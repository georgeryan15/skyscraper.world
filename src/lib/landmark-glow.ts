import type { CustomLayerInterface, Map } from "mapbox-gl";
import { maskBounds, type LandmarkMask, type MaskBounds } from "./landmark-hit-test.ts";

export type GlowState = {
  /** A model is in the selected layer: trace its silhouette while rendering. */
  active: boolean;
  /** Strength of the outline and halo, 0–1. */
  amount: number;
  /** Bumped whenever the selected layer's contents change. */
  generation: number;
  /** Read the silhouette of this generation back to the CPU on the next render. */
  readback: number | null;
  /** Extent of the shown silhouette, in mask texels; bounds the composite. */
  bounds: MaskBounds | null;
  onMask: (generation: number, mask: LandmarkMask) => void;
  /** The renderer's depth buffer cannot be copied, so silhouettes are unavailable. */
  onUnsupported: () => void;
};

const VERTEX = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

// Only the selected model is drawn between the two depth copies, so a nearer
// depth marks one of its visible pixels: other buildings in front of it keep
// theirs. Unchanged depth is bit-identical, so unlike a colour comparison the
// silhouette has no holes where the model resembles what is behind it.
const SILHOUETTE = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
uniform sampler2D beforeDepth;
uniform sampler2D afterDepth;
uniform int scale;
out vec4 color;
void main() {
  ivec2 origin = ivec2(gl_FragCoord.xy) * scale;
  ivec2 last = textureSize(afterDepth, 0) - 1;
  float covered = 0.0;
  for (int y = 0; y < 3; y++) {
    for (int x = 0; x < 3; x++) {
      if (x >= scale || y >= scale) continue;
      ivec2 p = min(origin + ivec2(x, y), last);
      if (texelFetch(afterDepth, p, 0).r < texelFetch(beforeDepth, p, 0).r) covered += 1.0;
    }
  }
  color = vec4(covered / float(scale * scale), 0.0, 0.0, 1.0);
}`;

// Pack 32 silhouette texels into each RGBA8 texel, one bit per CSS pixel, so
// the CPU copy used for hit testing is a few hundred kilobytes.
const PACK = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D silhouette;
out vec4 color;
float byteAt(ivec2 start, int width) {
  int value = 0;
  for (int bit = 0; bit < 8; bit++) {
    ivec2 p = start + ivec2(bit, 0);
    // A texel counts once at least a third of its pixels are covered.
    if (p.x < width && texelFetch(silhouette, p, 0).r > 0.33) value |= 1 << bit;
  }
  return float(value) / 255.0;
}
void main() {
  ivec2 start = ivec2(int(gl_FragCoord.x) * 32, int(gl_FragCoord.y));
  int width = textureSize(silhouette, 0).x;
  color = vec4(byteAt(start, width), byteAt(start + ivec2(8, 0), width),
    byteAt(start + ivec2(16, 0), width), byteAt(start + ivec2(24, 0), width));
}`;

const COMPOSITE = `#version 300 es
precision highp float;
uniform sampler2D silhouette;
uniform vec2 extent;
uniform vec2 texel;
uniform float amount;
out vec4 color;
const vec3 CYAN = vec3(0.08, 0.78, 1.0);
const vec3 ICE = vec3(0.68, 0.96, 1.0);
void main() {
  vec2 uv = gl_FragCoord.xy / extent;
  float inside = texture(silhouette, uv).r;
  float ring = 0.0;
  float halo = 0.0;
  for (int i = 0; i < 12; i++) {
    float angle = float(i) * 0.5235988;
    vec2 direction = vec2(cos(angle), sin(angle)) * texel;
    ring = max(ring, max(texture(silhouette, uv + direction * 1.25).r, texture(silhouette, uv + direction * 2.5).r));
    halo += textureLod(silhouette, uv + direction * 5.0, 2.0).r
      + 0.5 * textureLod(silhouette, uv + direction * 10.0, 3.0).r;
  }
  // Stroke only the outside of the silhouette, so no line crosses the model.
  float outline = clamp(ring - inside, 0.0, 1.0);
  float glow = clamp(halo / 18.0, 0.0, 1.0) * (1.0 - inside);
  float alpha = max(outline * 0.95, glow * 0.42) * amount;
  color = vec4(mix(CYAN, ICE, outline * 0.35) * alpha, alpha);
}`;

/** Halo reach beyond the silhouette, in mask texels, for the composite's scissor. */
const HALO_REACH = 20;

type PendingReadback = {
  sync: WebGLSync;
  generation: number;
  width: number;
  height: number;
  stride: number;
};

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Landmark glow shader: ${message}`);
  }
  return shader;
}

function link(gl: WebGL2RenderingContext, fragmentSource: string, names: string[]) {
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram()!;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("Could not link landmark glow shader");
  const uniforms = Object.fromEntries(names.map((name) => [name, gl.getUniformLocation(program, name)]));
  return { program, uniforms };
}

/** Trace the selected model's visible silhouette from the depth buffer, draw an
 * outline and halo around it, and read it back to the CPU without stalling.
 */
export function createLandmarkGlow(map: Map, state: GlowState) {
  let gl: WebGL2RenderingContext | undefined;
  let silhouetteProgram: ReturnType<typeof link> | undefined;
  let packProgram: ReturnType<typeof link> | undefined;
  let compositeProgram: ReturnType<typeof link> | undefined;
  let vao: WebGLVertexArrayObject | null = null;
  let beforeDepth: WebGLTexture | null = null;
  let afterDepth: WebGLTexture | null = null;
  let beforeFramebuffer: WebGLFramebuffer | null = null;
  let afterFramebuffer: WebGLFramebuffer | null = null;
  let mask: WebGLTexture | null = null;
  let maskFramebuffer: WebGLFramebuffer | null = null;
  let packed: WebGLTexture | null = null;
  let packedFramebuffer: WebGLFramebuffer | null = null;
  let packBuffer: WebGLBuffer | null = null;
  let packBytes = 0;
  let width = 0;
  let height = 0;
  let scale = 1;
  let maskWidth = 0;
  let maskHeight = 0;
  let packedWidth = 0;
  let depthChecked = false;
  let supported = true;
  let captured = false;
  let pending: PendingReadback | null = null;
  let pollFrame = 0;
  let restoreResources: (() => void) | undefined;
  let dropResources: (() => void) | undefined;

  function release(context: WebGL2RenderingContext) {
    for (const texture of [beforeDepth, afterDepth, mask, packed]) context.deleteTexture(texture);
    for (const framebuffer of [beforeFramebuffer, afterFramebuffer, maskFramebuffer, packedFramebuffer]) context.deleteFramebuffer(framebuffer);
    beforeDepth = afterDepth = mask = packed = null;
    beforeFramebuffer = afterFramebuffer = maskFramebuffer = packedFramebuffer = null;
    width = height = 0;
  }

  function allocate(context: WebGL2RenderingContext) {
    if (width === context.drawingBufferWidth && height === context.drawingBufferHeight && mask) return;
    release(context);
    width = context.drawingBufferWidth;
    height = context.drawingBufferHeight;
    // One mask texel per CSS pixel keeps the stroke width independent of density.
    scale = Math.max(1, Math.min(3, Math.round(width / Math.max(1, map.getCanvas().clientWidth))));
    maskWidth = Math.ceil(width / scale);
    maskHeight = Math.ceil(height / scale);
    packedWidth = Math.ceil(maskWidth / 32);
    const depthTarget = () => {
      // Mapbox copies its own depth buffer into the same format every frame.
      const texture = context.createTexture();
      context.bindTexture(context.TEXTURE_2D, texture);
      context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MIN_FILTER, context.NEAREST);
      context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MAG_FILTER, context.NEAREST);
      context.texStorage2D(context.TEXTURE_2D, 1, context.DEPTH24_STENCIL8, width, height);
      const framebuffer = context.createFramebuffer();
      context.bindFramebuffer(context.FRAMEBUFFER, framebuffer);
      context.framebufferTexture2D(context.FRAMEBUFFER, context.DEPTH_STENCIL_ATTACHMENT, context.TEXTURE_2D, texture, 0);
      return [texture, framebuffer] as const;
    };
    [beforeDepth, beforeFramebuffer] = depthTarget();
    [afterDepth, afterFramebuffer] = depthTarget();
    mask = context.createTexture();
    context.bindTexture(context.TEXTURE_2D, mask);
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MIN_FILTER, context.LINEAR_MIPMAP_LINEAR);
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MAG_FILTER, context.LINEAR);
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_S, context.CLAMP_TO_EDGE);
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_T, context.CLAMP_TO_EDGE);
    const levels = Math.floor(Math.log2(Math.max(maskWidth, maskHeight))) + 1;
    context.texStorage2D(context.TEXTURE_2D, levels, context.R8, maskWidth, maskHeight);
    maskFramebuffer = context.createFramebuffer();
    context.bindFramebuffer(context.FRAMEBUFFER, maskFramebuffer);
    context.framebufferTexture2D(context.FRAMEBUFFER, context.COLOR_ATTACHMENT0, context.TEXTURE_2D, mask, 0);
    packed = context.createTexture();
    context.bindTexture(context.TEXTURE_2D, packed);
    context.texStorage2D(context.TEXTURE_2D, 1, context.RGBA8, packedWidth, maskHeight);
    packedFramebuffer = context.createFramebuffer();
    context.bindFramebuffer(context.FRAMEBUFFER, packedFramebuffer);
    context.framebufferTexture2D(context.FRAMEBUFFER, context.COLOR_ATTACHMENT0, context.TEXTURE_2D, packed, 0);
    depthChecked = false;
  }

  function copyDepth(context: WebGL2RenderingContext, source: WebGLFramebuffer | null, target: WebGLFramebuffer | null) {
    // Check the first copy into new targets; a mismatched depth format fails.
    if (!depthChecked) context.getError();
    context.disable(context.SCISSOR_TEST);
    context.bindFramebuffer(context.READ_FRAMEBUFFER, source);
    context.bindFramebuffer(context.DRAW_FRAMEBUFFER, target);
    context.blitFramebuffer(0, 0, width, height, 0, 0, width, height, context.DEPTH_BUFFER_BIT, context.NEAREST);
    context.bindFramebuffer(context.FRAMEBUFFER, source);
    if (!depthChecked) {
      depthChecked = true;
      if (context.getError() !== context.NO_ERROR) {
        supported = false;
        state.onUnsupported();
      }
    }
  }

  function startReadback(context: WebGL2RenderingContext) {
    const program = packProgram!;
    context.bindFramebuffer(context.FRAMEBUFFER, packedFramebuffer);
    context.viewport(0, 0, packedWidth, maskHeight);
    context.useProgram(program.program);
    context.activeTexture(context.TEXTURE0);
    context.bindTexture(context.TEXTURE_2D, mask);
    context.uniform1i(program.uniforms.silhouette, 0);
    context.drawArrays(context.TRIANGLES, 0, 3);
    const stride = packedWidth * 4;
    const bytes = stride * maskHeight;
    packBuffer ??= context.createBuffer();
    context.bindBuffer(context.PIXEL_PACK_BUFFER, packBuffer);
    if (packBytes !== bytes) {
      context.bufferData(context.PIXEL_PACK_BUFFER, bytes, context.STREAM_READ);
      packBytes = bytes;
    }
    // Into a buffer, readPixels queues a copy instead of waiting for the GPU.
    context.readPixels(0, 0, packedWidth, maskHeight, context.RGBA, context.UNSIGNED_BYTE, 0);
    context.bindBuffer(context.PIXEL_PACK_BUFFER, null);
    const sync = context.fenceSync(context.SYNC_GPU_COMMANDS_COMPLETE, 0);
    if (!sync) return;
    pending = { sync, generation: state.generation, width: maskWidth, height: maskHeight, stride };
    context.flush();
    poll();
  }

  function poll() {
    if (pollFrame) return;
    pollFrame = requestAnimationFrame(() => {
      pollFrame = 0;
      const context = gl;
      const readback = pending;
      if (!context || !readback || context.isContextLost()) return;
      const status = context.clientWaitSync(readback.sync, 0, 0);
      if (status === context.TIMEOUT_EXPIRED) {
        poll();
        return;
      }
      pending = null;
      if (status !== context.WAIT_FAILED) {
        const bits = new Uint8Array(readback.stride * readback.height);
        context.bindBuffer(context.PIXEL_PACK_BUFFER, packBuffer);
        context.getBufferSubData(context.PIXEL_PACK_BUFFER, 0, bits);
        context.bindBuffer(context.PIXEL_PACK_BUFFER, null);
        const { generation, width, height, stride } = readback;
        state.onMask(generation, { bits, width, height, stride, bounds: maskBounds(bits, width, height, stride) });
      }
      context.deleteSync(readback.sync);
      // Selection moved on while this copy was in flight; trace the new one.
      if (state.readback !== null && state.readback !== readback.generation) map.triggerRepaint();
    });
  }

  const capture: CustomLayerInterface = {
    id: "landmark-scene-capture",
    type: "custom",
    renderingMode: "3d",
    render(context) {
      captured = false;
      if (!state.active || !supported || !silhouetteProgram) return;
      const gl = context as WebGL2RenderingContext;
      const target = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
      allocate(gl);
      copyDepth(gl, target, beforeFramebuffer);
      captured = supported;
    },
  };

  const composite: CustomLayerInterface = {
    id: "landmark-edge-glow",
    type: "custom",
    renderingMode: "3d",
    onAdd(_map, context) {
      gl = context as WebGL2RenderingContext;
      const owner = gl;
      restoreResources = () => {
        width = height = packBytes = 0;
        captured = depthChecked = false;
        pending = null;
        beforeDepth = afterDepth = mask = packed = packBuffer = null;
        beforeFramebuffer = afterFramebuffer = maskFramebuffer = packedFramebuffer = null;
        silhouetteProgram = link(owner, SILHOUETTE, ["beforeDepth", "afterDepth", "scale"]);
        packProgram = link(owner, PACK, ["silhouette"]);
        compositeProgram = link(owner, COMPOSITE, ["silhouette", "extent", "texel", "amount"]);
        vao = owner.createVertexArray();
      };
      dropResources = () => {
        cancelAnimationFrame(pollFrame);
        pollFrame = 0;
        pending = null;
        silhouetteProgram = packProgram = compositeProgram = undefined;
      };
      restoreResources();
      map.getCanvas().addEventListener("webglcontextlost", dropResources);
      map.getCanvas().addEventListener("webglcontextrestored", restoreResources);
    },
    render(context) {
      if (!captured || !silhouetteProgram || !packProgram || !compositeProgram) return;
      captured = false;
      const gl = context as WebGL2RenderingContext;
      const target = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
      copyDepth(gl, target, afterFramebuffer);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.STENCIL_TEST);
      gl.disable(gl.BLEND);
      gl.depthMask(false);
      gl.colorMask(true, true, true, true);
      gl.bindVertexArray(vao);

      gl.bindFramebuffer(gl.FRAMEBUFFER, maskFramebuffer);
      gl.viewport(0, 0, maskWidth, maskHeight);
      gl.useProgram(silhouetteProgram.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, beforeDepth);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, afterDepth);
      gl.uniform1i(silhouetteProgram.uniforms.beforeDepth, 0);
      gl.uniform1i(silhouetteProgram.uniforms.afterDepth, 1);
      gl.uniform1i(silhouetteProgram.uniforms.scale, scale);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (state.readback === state.generation && !pending) startReadback(gl);

      gl.bindFramebuffer(gl.FRAMEBUFFER, target);
      gl.viewport(0, 0, width, height);
      if (state.amount > 0) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, mask);
        gl.generateMipmap(gl.TEXTURE_2D);
        if (state.bounds) {
          const { minX, minY, maxX, maxY } = state.bounds;
          gl.enable(gl.SCISSOR_TEST);
          gl.scissor((minX - HALO_REACH) * scale, (minY - HALO_REACH) * scale,
            (maxX - minX + 1 + HALO_REACH * 2) * scale, (maxY - minY + 1 + HALO_REACH * 2) * scale);
        }
        gl.enable(gl.BLEND);
        // Premultiplied colour over the scene; the canvas alpha stays opaque.
        gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
        gl.useProgram(compositeProgram.program);
        gl.uniform1i(compositeProgram.uniforms.silhouette, 0);
        gl.uniform2f(compositeProgram.uniforms.extent, maskWidth * scale, maskHeight * scale);
        gl.uniform2f(compositeProgram.uniforms.texel, 1 / maskWidth, 1 / maskHeight);
        gl.uniform1f(compositeProgram.uniforms.amount, state.amount);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.disable(gl.SCISSOR_TEST);
        gl.disable(gl.BLEND);
      }
      gl.bindVertexArray(null);
    },
    onRemove(_map, context) {
      const gl = context as WebGL2RenderingContext;
      if (restoreResources) map.getCanvas().removeEventListener("webglcontextrestored", restoreResources);
      if (dropResources) map.getCanvas().removeEventListener("webglcontextlost", dropResources);
      cancelAnimationFrame(pollFrame);
      pollFrame = 0;
      if (pending) gl.deleteSync(pending.sync);
      pending = null;
      release(gl);
      gl.deleteBuffer(packBuffer);
      for (const program of [silhouetteProgram, packProgram, compositeProgram]) gl.deleteProgram(program?.program ?? null);
      gl.deleteVertexArray(vao);
      packBuffer = vao = null;
      silhouetteProgram = packProgram = compositeProgram = undefined;
      packBytes = 0;
    },
  };
  return { capture, composite };
}
