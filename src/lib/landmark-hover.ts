import type {
  ExpressionSpecification, FilterSpecification, Map, MapMouseEvent, MapSourceDataEvent, MapboxGeoJSONFeature,
} from "mapbox-gl";
import type { Feature, Position } from "geojson";
import { createLandmarkGlow, type GlowState } from "./landmark-glow.ts";
import { maskCovers, type LandmarkMask } from "./landmark-hit-test.ts";

const MIDTOWN = [
  [-73.9915, 40.7745],
  [-73.955, 40.76],
  [-73.9727, 40.7405],
  [-74.007, 40.7545],
];
const SOURCE = "landmark-meshes";
const HIT_LAYER = "landmark-base-meshes";
const SELECTED_LAYER = "landmark-selected-mesh";
const NO_SELECTION: FilterSpecification = ["==", ["id"], ""];
const ENTER_MS = 200;
const EXIT_MS = 150;
// Silhouette tolerance in CSS pixels: tight to acquire a model, looser to keep
// it, so antialiased edges and mullions do not make the hover flicker.
const ACQUIRE_RADIUS = 2;
const RETAIN_RADIUS = 5;
// Silhouettes are valid for one camera position; this covers nearby towers.
const MASK_CACHE_SIZE = 12;

const BASE_COLOR: ExpressionSpecification = ["match", ["get", "part"], "window", "#a7c8e5", "roof", "#f5e8dc", "#ffffff"];
const BASE_EMISSIVE: ExpressionSpecification = ["match", ["get", "part"], "window", 0.4, "wall", 0.8, 0];
const BASE_ROUGHNESS: ExpressionSpecification = ["match", ["get", "part"], "window", 0, 1];
// The selected layer matches the base until a model is confirmed under the
// pointer, so probing one is invisible; the "hover" state then blends it.
const HOVER: ExpressionSpecification = ["number", ["feature-state", "hover"], 0];
const towardHighlight = (base: unknown, highlight: unknown) =>
  ["interpolate", ["linear"], HOVER, 0, base, 1, highlight] as ExpressionSpecification;

function isInMidtown([lng, lat]: Position): boolean {
  let inside = false;
  for (let i = 0, j = MIDTOWN.length - 1; i < MIDTOWN.length; j = i++) {
    const [xi, yi] = MIDTOWN[i];
    const [xj, yj] = MIDTOWN[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function isMajorMidtownBuilding(feature: Feature): boolean {
  const height = Number(feature.properties?.height);
  if (!Number.isFinite(height) || height < 150) return false;
  // Native model queries return the model's geographic anchor, not a footprint.
  return feature.geometry?.type === "Point" && isInMidtown(feature.geometry.coordinates);
}

type ModelBucket = { uploaded?: boolean; setFilter?: (filter: FilterSpecification) => void };
type InternalStyle = {
  getOwnLayer?: (id: string) => { filter?: FilterSpecification } | undefined;
  getLayerSourceCache?: (layer: object) => {
    getIds(): number[];
    getTileByID(id: number): { getBucket(layer: object): ModelBucket | undefined } | undefined;
  } | undefined;
};

/** Swap the models in a batched-model layer within a single frame.
 * Mapbox filters these models on the main thread, but `setFilter` also reloads
 * and re-parses every tile of the source, so changing it on hover stalls the
 * map. Update the filter in place on the layer and on each loaded tile's bucket:
 * the replacement pass reads the buckets before drawing, so updating the layer
 * alone would drop the previously selected model for one frame. Buckets upload
 * only the models their filter passes, so new ones are left unfiltered until
 * Mapbox has uploaded them. Falls back to the public API should these
 * internals change.
 */
export function applyModelFilter(map: Map, layerId: string, filter: FilterSpecification) {
  const style = (map as unknown as { style?: InternalStyle }).style;
  const layer = style?.getOwnLayer?.(layerId);
  const cache = layer && style?.getLayerSourceCache?.(layer);
  if (!layer || !cache || !("filter" in layer)) {
    map.setFilter(layerId, filter);
    return;
  }
  layer.filter = filter;
  for (const id of cache.getIds()) {
    const bucket = cache.getTileByID(id)?.getBucket(layer);
    if (bucket?.uploaded) bucket.setFilter?.(filter);
  }
  map.triggerRepaint();
}

export type LandmarkEvents = {
  /** The pointer settled on a visible model, or left it (null). */
  onHoverChange?: (feature: MapboxGeoJSONFeature | null) => void;
  /** A click on a model, or on anything else (null). */
  onSelect?: (feature: MapboxGeoJSONFeature | null) => void;
};

/** Use the very same landmark meshes as Standard, including their material parts. */
export function addLandmarkHover(map: Map, events: LandmarkEvents = {}): () => void {
  map.addSource(SOURCE, { type: "batched-model", url: "mapbox://mapbox.mapbox-3dbuildings-v1" });
  // A root model source replaces the imported landmarks through Mapbox's
  // conflation. Render their muted base materials here as well as querying them.
  map.addLayer({
    id: HIT_LAYER,
    type: "model",
    source: SOURCE,
    minzoom: 14.6,
    paint: {
      "model-color": BASE_COLOR,
      "model-color-mix-intensity": 1,
      "model-emissive-strength": BASE_EMISSIVE,
      "model-ambient-occlusion-intensity": 0.75,
      "model-roughness": BASE_ROUGHNESS,
    },
  });

  const canvas = map.getCanvas();
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const masks = new globalThis.Map<string | number, LandmarkMask>();
  let disposed = false;
  let unsupported = false;
  // The model in the selected layer: being probed, shown, or fading out.
  let selected: MapboxGeoJSONFeature | undefined;
  let shown = false;
  let leaving = false;
  let strength = 0;
  let announcedId: string | number | undefined;
  let lastPoint: MapMouseEvent["point"] | null = null;
  let queryFrame = 0;
  let fadeFrame = 0;

  const state: GlowState = {
    active: false, amount: 0, generation: 0, readback: null, bounds: null,
    onMask(generation, mask) {
      if (disposed || generation !== state.generation || selected?.id === undefined) return;
      state.readback = null;
      remember(selected.id, mask);
      evaluate();
    },
    onUnsupported() {
      unsupported = true;
      console.warn("Landmark hover is unavailable: this renderer's depth buffer cannot be copied.");
      clear();
    },
  };
  const glow = createLandmarkGlow(map, state);
  map.addLayer(glow.capture);
  // Only the selected model is drawn between the capture and composite layers,
  // which is what lets them trace its silhouette from the depth buffer.
  map.addLayer({
    id: SELECTED_LAYER,
    type: "model",
    source: SOURCE,
    minzoom: 14.6,
    filter: NO_SELECTION,
    paint: {
      "model-color": towardHighlight(BASE_COLOR,
        ["match", ["get", "part"], "window", "#269ebc", "roof", "#e5c39b", "wall", "#f2e1cb", "#b7d6df"]),
      "model-color-mix-intensity": towardHighlight(1, 0.85),
      "model-emissive-strength": towardHighlight(BASE_EMISSIVE, 0.28),
      "model-ambient-occlusion-intensity": 0.75,
      "model-roughness": towardHighlight(BASE_ROUGHNESS, ["match", ["get", "part"], "window", 0.2, 0.8]),
    },
  });
  map.addLayer(glow.composite);

  function remember(id: string | number, mask: LandmarkMask) {
    masks.delete(id);
    masks.set(id, mask);
    if (masks.size > MASK_CACHE_SIZE) masks.delete(masks.keys().next().value!);
  }

  function setStrength(value: number) {
    strength = state.amount = value;
    if (selected?.id !== undefined) map.setFeatureState({ source: SOURCE, id: selected.id }, { hover: value });
    map.triggerRepaint();
  }

  function fade(target: number, done?: () => void) {
    cancelAnimationFrame(fadeFrame);
    fadeFrame = 0;
    if (motion.matches) {
      setStrength(target);
      done?.();
      return;
    }
    const from = strength;
    const duration = target > from ? ENTER_MS : EXIT_MS;
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, Math.max(0, (now - start) / duration));
      setStrength(from + (target - from) * (1 - Math.pow(1 - progress, 3)));
      fadeFrame = progress < 1 ? requestAnimationFrame(step) : 0;
      if (progress === 1) done?.();
    };
    fadeFrame = requestAnimationFrame(step);
  }

  // Report only confirmed models, once each.
  function announce(feature?: MapboxGeoJSONFeature) {
    if (feature?.id === announcedId) return;
    announcedId = feature?.id;
    events.onHoverChange?.(feature ?? null);
  }

  function select(feature?: MapboxGeoJSONFeature) {
    cancelAnimationFrame(fadeFrame);
    fadeFrame = 0;
    if (selected?.id !== undefined) map.removeFeatureState({ source: SOURCE, id: selected.id });
    if (shown) {
      canvas.style.cursor = "";
      announce();
    }
    selected = feature;
    shown = leaving = false;
    strength = state.amount = 0;
    state.active = feature !== undefined;
    state.bounds = null;
    state.readback = null;
    state.generation++;
    applyModelFilter(map, SELECTED_LAYER, feature ? ["==", ["id"], feature.id!] : NO_SELECTION);
  }

  /** Trace a model's silhouette, out of sight, before deciding to show it. */
  function probe(feature: MapboxGeoJSONFeature) {
    if (selected?.id !== feature.id) select(feature);
    if (state.readback === state.generation) return;
    state.readback = state.generation;
    map.triggerRepaint();
  }

  function show(feature: MapboxGeoJSONFeature, mask: LandmarkMask) {
    if (selected?.id !== feature.id) select(feature);
    state.bounds = mask.bounds;
    if (shown && !leaving) return;
    shown = true;
    leaving = false;
    canvas.style.cursor = "pointer";
    announce(feature);
    fade(1);
  }

  function hide() {
    if (!selected || leaving) return;
    if (!shown) {
      select();
      return;
    }
    leaving = true;
    canvas.style.cursor = "";
    announce();
    fade(0, () => select());
  }

  function clear() {
    cancelAnimationFrame(queryFrame);
    queryFrame = 0;
    if (selected) select();
  }

  function evaluate() {
    queryFrame = 0;
    if (!lastPoint || disposed || unsupported || map.isMoving()) return;
    // The selected model is hidden from base-layer queries, so test it first.
    // While the pointer stays on it, nothing is queried or re-rendered.
    if (selected) {
      const mask = masks.get(selected.id!);
      if (!mask) {
        probe(selected);
        return;
      }
      if (maskCovers(mask, lastPoint, canvas, shown && !leaving ? RETAIN_RADIUS : ACQUIRE_RADIUS)) {
        show(selected, mask);
        return;
      }
    }
    // Model queries hit whole bounding boxes, nearest first. Probe each
    // candidate's silhouette once; cached ones are decided without rendering.
    const seen = new Set(selected ? [selected.id] : []);
    for (const candidate of map.queryRenderedFeatures(lastPoint, { layers: [HIT_LAYER] })) {
      if (candidate.id === undefined || seen.has(candidate.id) || !isMajorMidtownBuilding(candidate)) continue;
      seen.add(candidate.id);
      const mask = masks.get(candidate.id);
      if (!mask) {
        probe(candidate);
        return;
      }
      if (maskCovers(mask, lastPoint, canvas, ACQUIRE_RADIUS)) {
        show(candidate, mask);
        return;
      }
    }
    hide();
  }

  function schedule() {
    if (!queryFrame) queryFrame = requestAnimationFrame(evaluate);
  }
  function handleMove(event: MapMouseEvent) {
    lastPoint = event.point;
    schedule();
  }
  function handleLeave() {
    lastPoint = null;
    clear();
  }
  function handleMoveStart() {
    // Silhouettes belong to the camera position they were traced from.
    masks.clear();
    clear();
  }
  function handleMoveEnd() {
    if (lastPoint) schedule();
  }
  function handleSourceData(event: MapSourceDataEvent) {
    // New models may change the silhouettes traced so far.
    if (event.sourceId === SOURCE && event.tile) masks.clear();
  }
  function handleResize() {
    masks.clear();
    clear();
  }
  function handleClick(event: MapMouseEvent) {
    if (shown && !leaving && selected) {
      events.onSelect?.(selected);
      return;
    }
    // Touch has no hover to verify the model, so take the tallest candidate.
    const tapped = window.matchMedia("(hover: none)").matches
      ? map.queryRenderedFeatures(event.point, { layers: [HIT_LAYER] })
        .filter(isMajorMidtownBuilding)
        .sort((a, b) => Number(b.properties?.height) - Number(a.properties?.height))[0]
      : undefined;
    events.onSelect?.(tapped ?? null);
  }

  map.on("mousemove", handleMove);
  map.on("click", handleClick);
  map.on("movestart", handleMoveStart);
  map.on("moveend", handleMoveEnd);
  map.on("sourcedata", handleSourceData);
  map.on("resize", handleResize);
  canvas.addEventListener("mouseleave", handleLeave);
  canvas.addEventListener("webglcontextlost", handleLeave);
  window.addEventListener("blur", handleLeave);

  return () => {
    if (disposed) return;
    disposed = true;
    clear();
    masks.clear();
    map.off("mousemove", handleMove);
    map.off("click", handleClick);
    map.off("movestart", handleMoveStart);
    map.off("moveend", handleMoveEnd);
    map.off("sourcedata", handleSourceData);
    map.off("resize", handleResize);
    canvas.removeEventListener("mouseleave", handleLeave);
    canvas.removeEventListener("webglcontextlost", handleLeave);
    window.removeEventListener("blur", handleLeave);
    for (const id of [glow.composite.id, SELECTED_LAYER, glow.capture.id, HIT_LAYER]) {
      if (map.getLayer(id)) map.removeLayer(id);
    }
    if (map.getSource(SOURCE)) map.removeSource(SOURCE);
  };
}
