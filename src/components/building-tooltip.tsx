"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import LiquidGlass from "./liquid-glass";
import { TALLEST_HEIGHT_M, type BuildingDetails } from "@/lib/buildings";

const DWELL_MS = 500;
const EXIT_MS = 160;
const CURSOR_GAP = 18;
const EDGE_GAP = 12;

type Pointer = { x: number; y: number; width: number; height: number };

type BuildingTooltipProps = {
  /** The building under the pointer, or null once the pointer leaves it. */
  building: BuildingDetails | null;
  containerRef: RefObject<HTMLElement | null>;
};

export default function BuildingTooltip({ building, containerRef }: BuildingTooltipProps) {
  const [revealed, setRevealed] = useState<BuildingDetails | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<Pointer | null>(null);
  const visible = revealed !== null && revealed.id === building?.id;

  // Reveal only after the pointer has rested on one building.
  useEffect(() => {
    if (!building) return;
    const timer = setTimeout(() => setRevealed(building), DWELL_MS);
    return () => clearTimeout(timer);
  }, [building]);

  // Keep the last building mounted while its exit animation plays.
  useEffect(() => {
    if (visible || !revealed) return;
    const timer = setTimeout(() => setRevealed(null), EXIT_MS);
    return () => clearTimeout(timer);
  }, [visible, revealed]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleMove = (event: PointerEvent) => {
      const bounds = container.getBoundingClientRect();
      pointerRef.current = {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
        width: bounds.width,
        height: bounds.height,
      };
      place(anchorRef.current, pointerRef.current);
    };
    container.addEventListener("pointermove", handleMove);
    return () => container.removeEventListener("pointermove", handleMove);
  }, [containerRef]);

  // Place before paint so the tooltip never flashes at the container origin,
  // then let later moves glide.
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor || !revealed) return;
    anchor.dataset.placed = "false";
    place(anchor, pointerRef.current);
    const frame = requestAnimationFrame(() => (anchor.dataset.placed = "true"));
    return () => cancelAnimationFrame(frame);
  }, [revealed]);

  if (!revealed) return null;

  const { name, heightM, completed } = revealed;
  const ratio = Math.min(1, heightM / TALLEST_HEIGHT_M);

  return (
    <div ref={anchorRef} className="building-tooltip" data-state={visible ? "open" : "closed"} aria-hidden="true">
      <LiquidGlass
        className="building-tooltip__glass"
        bezel={18}
        refraction={52}
        style={{ "--height-ratio": ratio } as CSSProperties}
      >
        <span className="building-tooltip__gauge" />
        <span className="building-tooltip__body">
          <span className="building-tooltip__name">{name}</span>
          <span className="building-tooltip__meta">
            <span className="building-tooltip__height">{heightM} m</span>
            {completed ? ` tall, built ${completed}` : " tall"}
          </span>
          <span className="building-tooltip__hint">Click for details</span>
        </span>
      </LiquidGlass>
    </div>
  );
}

/** Sit below-right of the cursor, flipping away from container edges. */
function place(anchor: HTMLElement | null, pointer: Pointer | null) {
  if (!anchor || !pointer) return;
  const width = anchor.offsetWidth;
  const height = anchor.offsetHeight;
  const left = pointer.x + CURSOR_GAP + width > pointer.width - EDGE_GAP;
  const above = pointer.y + CURSOR_GAP + height > pointer.height - EDGE_GAP;
  const x = left ? pointer.x - CURSOR_GAP - width : pointer.x + CURSOR_GAP;
  const y = above ? pointer.y - CURSOR_GAP - height : pointer.y + CURSOR_GAP;
  anchor.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
  // The glass grows out of the corner nearest the cursor.
  anchor.style.setProperty("--origin", `${above ? "bottom" : "top"} ${left ? "right" : "left"}`);
}
