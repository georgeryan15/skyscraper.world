import assert from "node:assert/strict";
import test from "node:test";
import { addLandmarkHover, applyModelFilter, isMajorMidtownBuilding } from "../src/lib/landmark-hover.ts";
import { maskBounds, maskCovers } from "../src/lib/landmark-hit-test.ts";

function building(id, height = 260, coordinates = [-73.9792, 40.759]) {
  return { type: "Feature", id, properties: { height }, geometry: { type: "Point", coordinates } };
}

test("Only major native Midtown models are eligible", () => {
  assert.equal(isMajorMidtownBuilding(building("rockefeller")), true);
  assert.equal(isMajorMidtownBuilding(building("park", 423, [-73.9754, 40.7556])), true);
  assert.equal(isMajorMidtownBuilding(building("downtown", 541, [-74.0134, 40.7127])), false);
  assert.equal(isMajorMidtownBuilding(building("uptown", 200, [-73.9717, 40.791])), false);
  for (const height of [30, undefined, null, NaN, Infinity, "unknown"]) {
    const feature = building("invalid");
    feature.properties.height = height;
    assert.equal(isMajorMidtownBuilding(feature), false);
  }
});

/** A bit-packed silhouette covering CSS-pixel rectangles on a canvas of the given size. */
function silhouette(rects, width = 1000, height = 700, density = 1) {
  const maskWidth = width * density;
  const maskHeight = height * density;
  const stride = Math.ceil(maskWidth / 32) * 4;
  const bits = new Uint8Array(stride * maskHeight);
  for (const { x0, y0, x1, y1 } of rects) {
    for (let y = y0 * density; y < y1 * density; y++) {
      const row = maskHeight - 1 - y;
      for (let x = x0 * density; x < x1 * density; x++) bits[row * stride + (x >> 3)] |= 1 << (x & 7);
    }
  }
  return { bits, width: maskWidth, height: maskHeight, stride, bounds: maskBounds(bits, maskWidth, maskHeight, stride) };
}

test("Silhouette bounds come from the packed bits, bottom-up", () => {
  assert.deepEqual(silhouette([{ x0: 40, y0: 600, x1: 75, y1: 690 }]).bounds, { minX: 40, minY: 10, maxX: 74, maxY: 99 });
  assert.equal(silhouette([]).bounds, null);
});

test("Pointer tolerance stays in CSS pixels on Retina displays and clamps to the canvas", () => {
  const canvas = { clientWidth: 1000, clientHeight: 700 };
  for (const density of [1, 2]) {
    const mask = silhouette([{ x0: 100, y0: 100, x1: 200, y1: 300 }], 1000, 700, density);
    assert.equal(maskCovers(mask, { x: 150, y: 200 }, canvas, 0), true);
    assert.equal(maskCovers(mask, { x: 203, y: 200 }, canvas, 2), false);
    assert.equal(maskCovers(mask, { x: 203, y: 200 }, canvas, 5), true);
    assert.equal(maskCovers(mask, { x: 150, y: 96 }, canvas, 5), true);
  }
  const corner = silhouette([{ x0: 0, y0: 0, x1: 3, y1: 3 }, { x0: 997, y0: 697, x1: 1000, y1: 700 }]);
  for (const point of [{ x: 0, y: 0 }, { x: 1000, y: 700 }]) assert.equal(maskCovers(corner, point, canvas, 5), true);
});

function events() {
  const handlers = new Map();
  return {
    on(name, callback) { if (!handlers.has(name)) handlers.set(name, new Set()); handlers.get(name).add(callback); },
    off(name, callback) { handlers.get(name)?.delete(callback); },
    emit(name, value) { for (const callback of [...(handlers.get(name) ?? [])]) callback(value); },
    count: () => [...handlers.values()].reduce((sum, set) => sum + set.size, 0),
  };
}

const TOWER = { x0: 250, y0: 150, x1: 350, y1: 400 };
const POINTER = { x: 300, y: 250 };
const OUTSIDE = { x: 600, y: 600 };

function setup(t, { reducedMotion = false, callbacks = {}, depthError = 0 } = {}) {
  const frames = new Map();
  let nextFrame = 0;
  let now = 1000;
  t.mock.method(performance, "now", () => now);
  const windowEvents = events();
  const motion = { matches: reducedMotion, addEventListener() {}, removeEventListener() {} };
  const originals = Object.fromEntries(["window", "requestAnimationFrame", "cancelAnimationFrame"].map((key) => [key, globalThis[key]]));
  globalThis.window = { addEventListener: windowEvents.on, removeEventListener: windowEvents.off, matchMedia: () => motion };
  globalThis.requestAnimationFrame = (callback) => { frames.set(++nextFrame, callback); return nextFrame; };
  globalThis.cancelAnimationFrame = (id) => frames.delete(id);

  const canvasEvents = events();
  const canvas = { style: {}, clientWidth: 1000, clientHeight: 700, addEventListener: canvasEvents.on, removeEventListener: canvasEvents.off };
  const mapEvents = events();
  const layers = new Map();
  const sources = new Map();
  const filters = [];
  const states = new Map();
  // Visible silhouette of each model, in CSS pixels; the GPU mock traces the
  // one currently in the selected layer.
  const silhouettes = new Map();
  const counts = { queries: 0, repaints: 0, readbacks: 0 };
  const gpu = { fenceReady: true };
  let selectedId;
  const map = {
    on: mapEvents.on, off: mapEvents.off,
    addSource(id, source) { sources.set(id, source); },
    addLayer(layer) { layers.set(layer.id, layer); },
    getLayer: (id) => layers.get(id), getSource: (id) => sources.get(id),
    removeLayer(id) { layers.get(id).onRemove?.(map, gl); layers.delete(id); },
    removeSource: (id) => sources.delete(id),
    setFilter(id, filter) { filters.push({ id, filter }); selectedId = filter[2] || undefined; },
    setFeatureState({ id }, state) { states.set(id, { ...states.get(id), ...state }); },
    removeFeatureState({ id }) { states.delete(id); },
    getCanvas: () => canvas, triggerRepaint() { counts.repaints++; }, isMoving: () => false,
    queryRenderedFeatures() { counts.queries++; return map.features; }, features: [],
  };

  const uniforms = {};
  const gl = new Proxy({
    drawingBufferWidth: 1000, drawingBufferHeight: 700,
    NO_ERROR: 0, TIMEOUT_EXPIRED: 0x911b, WAIT_FAILED: 0x911d,
    getError: () => depthError,
    getShaderParameter: () => true, getProgramParameter: () => true,
    getUniformLocation: (_program, name) => name,
    uniform1f: (name, value) => { uniforms[name] = value; },
    createShader: () => ({}), createProgram: () => ({}), createTexture: () => ({}), createVertexArray: () => ({}),
    createFramebuffer: () => ({}), createBuffer: () => ({}), fenceSync: () => ({}),
    getParameter: () => null, isContextLost: () => false, clientWaitSync: () => (gpu.fenceReady ? 0x911a : 0x911b),
    readPixels() { counts.readbacks++; },
    getBufferSubData(_target, _offset, out) { out.set(silhouette(silhouettes.get(selectedId) ?? []).bits); },
  }, {
    // Unlisted enums resolve to numbers; anything else is a no-op call.
    get: (object, key) => key in object ? object[key] : /^[A-Z0-9_]+$/.test(key) ? key.length : () => {},
  });

  const dispose = addLandmarkHover(map, callbacks);
  layers.get("landmark-edge-glow").onAdd(map, gl);
  t.after(() => {
    dispose();
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  });
  const flush = (elapsed = 16) => {
    now += elapsed;
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback(now);
  };
  const render = () => {
    layers.get("landmark-scene-capture").render(gl);
    layers.get("landmark-edge-glow").render(gl);
  };
  const move = (features, point = POINTER) => {
    map.features = features;
    mapEvents.emit("mousemove", { point });
    flush();
  };
  // A render traces the selected model; the next frame reads it back.
  const trace = () => { render(); flush(); };
  const settle = () => { for (let i = 0; i < 20; i++) { flush(); render(); } };
  return { map, mapEvents, canvasEvents, windowEvents, canvas, frames, layers, sources, filters, states, silhouettes, counts, gpu, uniforms, dispose, flush, render, move, trace, settle };
}

test("A model is shown only once its traced silhouette is under the pointer", (t) => {
  const hovers = [];
  const h = setup(t, { callbacks: { onHoverChange: (feature) => hovers.push(feature?.id ?? null) } });
  h.silhouettes.set("tower", [TOWER]);
  h.move([building("tower")]);
  assert.deepEqual(h.filters.at(-1).filter, ["==", ["id"], "tower"]);
  assert.equal(h.canvas.style.cursor, undefined, "A bounding-box hit alone is not a visible model");
  assert.deepEqual(hovers, []);
  h.trace();
  assert.equal(h.canvas.style.cursor, "pointer");
  assert.deepEqual(hovers, ["tower"]);
  h.settle();
  assert.equal(h.states.get("tower").hover, 1);
  assert.equal(h.uniforms.amount, 1);
  assert.equal(h.frames.size, 0, "Nothing animates once the highlight has settled");
});

test("Bounding-box false positives fall through to the visible model behind them", (t) => {
  const h = setup(t);
  h.silhouettes.set("empty-box", [{ x0: 600, y0: 100, x1: 700, y1: 300 }]);
  h.silhouettes.set("visible", [TOWER]);
  h.move([building("empty-box", 400), building("visible")]);
  h.trace();
  assert.deepEqual(h.filters.at(-1).filter, ["==", ["id"], "visible"]);
  assert.equal(h.canvas.style.cursor, undefined, "The probed box never showed");
  h.trace();
  assert.equal(h.canvas.style.cursor, "pointer");
  assert.equal(h.states.has("empty-box"), false);
});

test("Moving within a shown model needs no queries, renders, readbacks or filter changes", (t) => {
  const h = setup(t);
  h.silhouettes.set("tower", [TOWER]);
  h.move([building("tower")]);
  h.trace();
  h.settle();
  const before = { ...h.counts, filters: h.filters.length };
  for (let i = 0; i < 60; i++) h.move([building("nearby", 400), building("tower")], { x: 260 + i, y: 160 + i * 3 });
  // The antialiased edge stays hovered within the wider retention radius.
  h.move([], { x: 353, y: 250 });
  assert.deepEqual({ ...h.counts, filters: h.filters.length }, before);
  assert.equal(h.canvas.style.cursor, "pointer");
});

test("Leaving fades out before emptying the selected layer, and returning reuses the silhouette", (t) => {
  const hovers = [];
  const h = setup(t, { callbacks: { onHoverChange: (feature) => hovers.push(feature?.id ?? null) } });
  h.silhouettes.set("tower", [TOWER]);
  h.move([building("tower")]);
  h.trace();
  h.settle();
  const filters = h.filters.length;
  h.move([], OUTSIDE);
  h.flush(60);
  assert.equal(h.canvas.style.cursor, "");
  assert.deepEqual(hovers, ["tower", null]);
  assert.equal(h.filters.length, filters, "The fading model stays in the selected layer");
  assert.ok(h.states.get("tower").hover < 1);
  h.settle();
  assert.deepEqual(h.filters.at(-1).filter, ["==", ["id"], ""]);
  assert.equal(h.frames.size, 0);
  const readbacks = h.counts.readbacks;
  h.move([building("tower")]);
  assert.equal(h.canvas.style.cursor, "pointer");
  assert.equal(h.counts.readbacks, readbacks);
  assert.deepEqual(hovers, ["tower", null, "tower"]);
});

test("Returning during the fade-out reverses it without a new probe", (t) => {
  const h = setup(t);
  h.silhouettes.set("tower", [TOWER]);
  h.move([building("tower")]);
  h.trace();
  h.settle();
  h.move([], OUTSIDE);
  h.flush(60);
  const fading = h.states.get("tower").hover;
  const filters = h.filters.length;
  h.move([]);
  assert.equal(h.canvas.style.cursor, "pointer");
  h.settle();
  assert.ok(fading < 1);
  assert.equal(h.states.get("tower").hover, 1);
  assert.equal(h.filters.length, filters);
});

test("A readback for an earlier selection is ignored, and the new one is traced", (t) => {
  const h = setup(t);
  h.silhouettes.set("first", [TOWER]);
  h.silhouettes.set("second", [TOWER]);
  h.gpu.fenceReady = false;
  h.move([building("first")]);
  h.render();
  // The pointer leaves and returns over another model while the copy is in flight.
  h.canvasEvents.emit("mouseleave");
  h.move([building("second")]);
  h.render();
  h.gpu.fenceReady = true;
  const repaints = h.counts.repaints;
  h.flush();
  assert.equal(h.canvas.style.cursor, undefined, "The first model's silhouette is not used for the second");
  assert.ok(h.counts.repaints > repaints, "The stale readback asks for another render");
  h.trace();
  assert.equal(h.canvas.style.cursor, "pointer");
  assert.deepEqual(h.filters.at(-1).filter, ["==", ["id"], "second"]);
});

test("Camera movement clears the hover and its silhouettes; moveend checks again", (t) => {
  const h = setup(t);
  h.silhouettes.set("tower", [TOWER]);
  h.move([building("tower")]);
  h.trace();
  h.mapEvents.emit("movestart");
  assert.equal(h.canvas.style.cursor, "");
  assert.deepEqual(h.filters.at(-1).filter, ["==", ["id"], ""]);
  const readbacks = h.counts.readbacks;
  h.mapEvents.emit("moveend");
  h.flush();
  h.trace();
  assert.equal(h.counts.readbacks, readbacks + 1, "The new view is traced again");
  assert.equal(h.canvas.style.cursor, "pointer");
  h.windowEvents.emit("blur");
  assert.equal(h.canvas.style.cursor, "");
});

test("Reduced motion shows and hides the highlight without animation frames", (t) => {
  const h = setup(t, { reducedMotion: true });
  h.silhouettes.set("tower", [TOWER]);
  h.move([building("tower")]);
  h.trace();
  assert.equal(h.states.get("tower").hover, 1);
  assert.equal(h.frames.size, 0);
  h.move([], OUTSIDE);
  assert.deepEqual(h.filters.at(-1).filter, ["==", ["id"], ""]);
  assert.equal(h.frames.size, 0);
});

test("Clicks select only a shown model, and anything else clears the selection", (t) => {
  const selections = [];
  const h = setup(t, { callbacks: { onSelect: (feature) => selections.push(feature?.id ?? null) } });
  h.silhouettes.set("tower", [TOWER]);
  h.mapEvents.emit("click", { point: POINTER });
  h.move([building("tower")]);
  h.mapEvents.emit("click", { point: POINTER });
  h.trace();
  h.mapEvents.emit("click", { point: POINTER });
  assert.deepEqual(selections, [null, null, "tower"]);
  h.dispose();
  h.mapEvents.emit("click", { point: POINTER });
  assert.equal(selections.length, 3);
});

test("Disposal removes every layer, source and listener", (t) => {
  const h = setup(t);
  h.silhouettes.set("tower", [TOWER]);
  h.move([building("tower")]);
  h.trace();
  h.dispose();
  assert.equal(h.layers.size, 0);
  assert.equal(h.sources.size, 0);
  assert.equal(h.canvas.style.cursor, "");
  assert.equal(h.canvasEvents.count() + h.windowEvents.count(), 0);
  const queries = h.counts.queries;
  h.move([building("tower")]);
  assert.equal(h.counts.queries, queries);
});

test("A depth buffer that cannot be copied disables the hover with a warning", (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  const h = setup(t, { depthError: 0x0502 });
  h.silhouettes.set("tower", [TOWER]);
  h.move([building("tower")]);
  h.trace();
  assert.equal(warn.mock.callCount(), 1);
  assert.deepEqual(h.filters.at(-1).filter, ["==", ["id"], ""]);
  const queries = h.counts.queries;
  h.move([building("tower")]);
  assert.equal(h.counts.queries, queries);
});

test("Model filters change in place on the layer and its uploaded buckets", () => {
  const layer = { filter: ["==", ["id"], ""] };
  const uploaded = { uploaded: true, setFilter(filter) { this.filter = filter; } };
  const loading = { uploaded: false, setFilter(filter) { this.filter = filter; } };
  const tiles = new Map([[1, uploaded], [2, loading]]);
  let repaints = 0;
  let publicCalls = 0;
  const map = {
    style: {
      getOwnLayer: (id) => (id === "selected" ? layer : undefined),
      getLayerSourceCache: () => ({ getIds: () => [...tiles.keys()], getTileByID: (id) => ({ getBucket: () => tiles.get(id) }) }),
    },
    setFilter() { publicCalls++; },
    triggerRepaint() { repaints++; },
  };
  const filter = ["==", ["id"], "tower"];
  applyModelFilter(map, "selected", filter);
  assert.equal(layer.filter, filter);
  assert.equal(uploaded.filter, filter);
  assert.equal(loading.filter, undefined, "A bucket uploads only the models its filter passes");
  assert.equal(publicCalls, 0);
  assert.equal(repaints, 1);
  applyModelFilter(map, "missing", filter);
  assert.equal(publicCalls, 1, "Unknown internals fall back to the public API");
});
