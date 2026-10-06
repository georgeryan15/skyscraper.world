"use client";

import { useEffect, useId, useRef, useState, type ComponentProps, type CSSProperties } from "react";

type LensMap = { href: string; width: number; height: number };

type LiquidGlassProps = ComponentProps<"div"> & {
  /** Width of the curved rim, in CSS pixels. */
  bezel?: number;
  /** Peak displacement at the rim, in CSS pixels. */
  refraction?: number;
};

// Only Chromium renders SVG filters in `backdrop-filter`. Elsewhere an unknown
// url() would drop the whole declaration, so those browsers keep blur alone.
function supportsBackdropLens(): boolean {
  const brands = (navigator as Navigator & { userAgentData?: { brands: { brand: string }[] } })
    .userAgentData?.brands;
  return Boolean(brands?.some(({ brand }) => brand === "Chromium"));
}

/** Encode a rounded-rect lens as a displacement map: red is x, green is y, 128 is still.
 * Pixels on the rim sample from further inside, so the backdrop bends like thick glass.
 */
function createLensMap(width: number, height: number, radius: number, bezel: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d")!;
  const image = context.createImageData(width, height);
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const corner = Math.min(radius, halfWidth, halfHeight);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const px = x + 0.5 - halfWidth;
      const py = y + 0.5 - halfHeight;
      const qx = Math.abs(px) - (halfWidth - corner);
      const qy = Math.abs(py) - (halfHeight - corner);
      let edge: number;
      let nx = 0;
      let ny = 0;
      if (qx > 0 && qy > 0) {
        const length = Math.hypot(qx, qy);
        edge = corner - length;
        nx = (qx / length) * Math.sign(px);
        ny = (qy / length) * Math.sign(py);
      } else if (qx > qy) {
        edge = corner - qx;
        nx = Math.sign(px);
      } else {
        edge = corner - qy;
        ny = Math.sign(py);
      }
      const t = Math.min(1, Math.max(0, 1 - edge / bezel));
      const strength = t * t;
      const offset = (y * width + x) * 4;
      image.data[offset] = 128 - nx * strength * 127;
      image.data[offset + 1] = 128 - ny * strength * 127;
      image.data[offset + 2] = 128;
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  return canvas.toDataURL();
}

export default function LiquidGlass({
  bezel = 16,
  refraction = 28,
  className,
  style,
  children,
  ref,
  ...props
}: LiquidGlassProps) {
  const filterId = `lens-${useId().replace(/[^\w-]/g, "")}`;
  const elementRef = useRef<HTMLDivElement | null>(null);
  const [lens, setLens] = useState<LensMap | null>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element || !supportsBackdropLens()) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const width = element.offsetWidth;
      const height = element.offsetHeight;
      if (!width || !height) return;
      // Entrance animations may morph border-radius; --glass-radius is the resting shape.
      const computed = getComputedStyle(element);
      const radius =
        parseFloat(computed.getPropertyValue("--glass-radius")) || parseFloat(computed.borderTopLeftRadius) || 0;
      setLens((current) =>
        current?.width === width && current.height === height
          ? current
          : { href: createLensMap(width, height, radius, bezel), width, height },
      );
    };
    const observer = new ResizeObserver(() => {
      if (!frame) frame = requestAnimationFrame(update);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [bezel]);

  return (
    <div
      {...props}
      ref={(element) => {
        elementRef.current = element;
        if (typeof ref === "function") return ref(element);
        if (ref) ref.current = element;
      }}
      className={className ? `liquid-glass ${className}` : "liquid-glass"}
      style={lens ? { ...style, "--glass-lens": `url(#${filterId})` } as CSSProperties : style}
    >
      {lens && (
        <svg className="liquid-glass__defs" aria-hidden="true" focusable="false">
          <filter
            id={filterId}
            x="0"
            y="0"
            width={lens.width}
            height={lens.height}
            filterUnits="userSpaceOnUse"
            primitiveUnits="userSpaceOnUse"
            colorInterpolationFilters="sRGB"
          >
            <feImage
              href={lens.href}
              x="0"
              y="0"
              width={lens.width}
              height={lens.height}
              preserveAspectRatio="none"
              result="lens"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="lens"
              scale={refraction}
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </svg>
      )}
      {children}
    </div>
  );
}
