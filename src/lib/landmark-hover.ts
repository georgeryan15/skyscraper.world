import type { GeoJSONSource, Map, MapMouseEvent, MapSourceDataEvent } from "mapbox-gl";
import type { Feature, FeatureCollection, MultiPolygon, Point, Polygon, Position } from "geojson";

const MIDTOWN = [
  [-73.9915, 40.7745],
  [-73.955, 40.76],
  [-73.9727, 40.7405],
  [-74.007, 40.7545],
];
const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };
const TILES = "midtown-building-tiles";
const LANDMARKS = "midtown-landmark-tiles";
const BUILDINGS = "midtown-major-buildings";
const HOVER = "midtown-building-hover";
const HIT_LAYER = "midtown-building-hit-area";
// Explicit tower anchors cover the requested buildings: the Rockefeller POI
// describes the wider complex, and 270 Park is not yet in the landmark POI tiles.
const ADDITIONAL_LANDMARKS: Feature<Point>[] = [{
  type: "Feature",
  properties: { name: "270 Park Avenue" },
  geometry: { type: "Point", coordinates: [-73.9754, 40.7556] },
}, {
  type: "Feature",
  properties: { name: "30 Rockefeller Plaza" },
  geometry: { type: "Point", coordinates: [-73.9792, 40.7590] },
}];

type Building = Feature<Polygon | MultiPolygon>;

function isInMidtown([lng, lat]: Position): boolean {
  let inside = false;
  for (let i = 0, j = MIDTOWN.length - 1; i < MIDTOWN.length; j = i++) {
    const [xi, yi] = MIDTOWN[i];
    const [xj, yj] = MIDTOWN[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export function isMajorMidtownBuilding(feature: Feature): feature is Building {
  if (!feature.geometry || !["Polygon", "MultiPolygon"].includes(feature.geometry.type)) return false;
  if (Number(feature.properties?.height) < 150 || !Number.isFinite(Number(feature.properties?.height))) return false;
  const geometry = feature.geometry as Polygon | MultiPolygon;
  const ring = geometry.type === "Polygon" ? geometry.coordinates[0] : geometry.coordinates[0][0];
  return ring.length > 0 && isInMidtown(ring[0]);
}

function distanceToFootprint(point: Position, building: Building): number {
  const rings = building.geometry.type === "Polygon"
    ? [building.geometry.coordinates[0]]
    : building.geometry.coordinates.map((polygon) => polygon[0]);
  let closest = Infinity;
  for (const ring of rings) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if ((yi > point[1]) !== (yj > point[1]) && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) inside = !inside;
      const ax = (xi - point[0]) * 84_300;
      const ay = (yi - point[1]) * 111_000;
      const bx = (xj - point[0]) * 84_300;
      const by = (yj - point[1]) * 111_000;
      const dx = bx - ax;
      const dy = by - ay;
      const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
      closest = Math.min(closest, Math.hypot(ax + t * dx, ay + t * dy));
    }
    if (inside) return 0;
  }
  return closest;
}

export function matchLandmarkBuildings(buildings: Building[], landmarks: Feature[]): Building[] {
  const matches = new globalThis.Map<string | number, Building>();
  for (const landmark of landmarks) {
    if (landmark.geometry?.type !== "Point" || !isInMidtown(landmark.geometry.coordinates)) continue;
    let closest: Building | undefined;
    let closestDistance = 90;
    for (const building of buildings) {
      const distance = distanceToFootprint(landmark.geometry.coordinates, building);
      if (distance < closestDistance || (distance === closestDistance && Number(building.properties?.height) > Number(closest?.properties?.height ?? 0))) {
        closest = building;
        closestDistance = distance;
      }
    }
    if (closest?.id !== undefined) {
      // Stepped towers have multiple overlapping footprints at different heights.
      // Keep those parts together so hovering a side wing highlights the tower too.
      for (const building of buildings) {
        if (building.id !== undefined && distanceToFootprint(landmark.geometry.coordinates, building) <= closestDistance + 1) {
          matches.set(building.id, {
            ...building,
            properties: { ...building.properties, hover_group: closest.id },
          });
        }
      }
    }
  }
  return [...matches.values()];
}

/** Native Mapbox footprints keep the hover geometry aligned with the basemap. */
export function addLandmarkHover(map: Map): () => void {
  map.addSource(TILES, { type: "vector", url: "mapbox://mapbox.mapbox-streets-v8" });
  map.addSource(LANDMARKS, { type: "vector", url: "mapbox://mapbox.mapbox-landmark-pois-v1" });
  map.addLayer({
    id: "midtown-landmark-tile-loader",
    type: "circle",
    source: LANDMARKS,
    "source-layer": "landmarks_poi",
    minzoom: 14,
    paint: { "circle-opacity": 0, "circle-radius": 1 },
  });
  // This invisible layer loads the native building tiles without drawing markers.
  map.addLayer({
    id: "midtown-building-tile-loader",
    type: "fill",
    source: TILES,
    "source-layer": "building",
    minzoom: 14,
    paint: { "fill-opacity": 0 },
  });
  map.addSource(BUILDINGS, { type: "geojson", data: EMPTY });
  map.addSource(HOVER, { type: "geojson", data: EMPTY });

  // A separate GeoJSON hit area avoids the landmark replacement clipping that
  // Mapbox applies to its ordinary building vector layers.
  map.addLayer({
    id: HIT_LAYER,
    type: "fill-extrusion",
    source: BUILDINGS,
    slot: "top",
    minzoom: 14.5,
    paint: {
      "fill-extrusion-color": "#ffffff",
      "fill-extrusion-opacity": 0.001,
      "fill-extrusion-height": ["get", "height"],
      "fill-extrusion-base": ["coalesce", ["get", "min_height"], 0],
      "fill-extrusion-cast-shadows": false,
    },
  });
  map.addLayer({
    id: "midtown-building-tint",
    type: "fill-extrusion",
    source: HOVER,
    slot: "top",
    minzoom: 14.5,
    paint: {
      "fill-extrusion-color": "#389cdb",
      "fill-extrusion-opacity": 0.32,
      "fill-extrusion-height": ["+", ["get", "height"], 0.6],
      "fill-extrusion-base": ["coalesce", ["get", "min_height"], 0],
      "fill-extrusion-emissive-strength": 0.35,
      "fill-extrusion-vertical-gradient": false,
      "fill-extrusion-cast-shadows": false,
    },
  });
  map.addLayer({
    id: "midtown-building-outline",
    type: "fill-extrusion",
    source: HOVER,
    slot: "top",
    minzoom: 14.5,
    paint: {
      "fill-extrusion-color": "#69c6ff",
      "fill-extrusion-opacity": 0.8,
      "fill-extrusion-height": ["+", ["get", "height"], 1],
      "fill-extrusion-base": ["coalesce", ["get", "min_height"], 0],
      "fill-extrusion-line-width": 1.5,
      "fill-extrusion-emissive-strength": 0.75,
      "fill-extrusion-vertical-gradient": false,
      "fill-extrusion-cast-shadows": false,
    },
  });

  let hoveredId: string | number | undefined;
  let dataSignature = "";
  let currentBuildings: Building[] = [];
  const updateBuildings = () => {
    const buildings = new globalThis.Map<string | number, Building>();
    for (const feature of map.querySourceFeatures(TILES, { sourceLayer: "building" })) {
      if (feature.id !== undefined && isMajorMidtownBuilding(feature)) {
        // Materialize the SDK's lazily decoded geometry before giving it to GeoJSON.
        buildings.set(feature.id, {
          type: "Feature", id: feature.id, properties: feature.properties, geometry: feature.geometry,
        });
      }
    }
    const landmarks = map.querySourceFeatures(LANDMARKS, { sourceLayer: "landmarks_poi" });
    const features = matchLandmarkBuildings([...buildings.values()], [...landmarks, ...ADDITIONAL_LANDMARKS]);
    const signature = JSON.stringify(features);
    if (signature !== dataSignature) {
      dataSignature = signature;
      currentBuildings = features;
      (map.getSource(BUILDINGS) as GeoJSONSource).setData({ type: "FeatureCollection", features });
    }
  };
  const clear = () => {
    if (hoveredId !== undefined) (map.getSource(HOVER) as GeoJSONSource).setData(EMPTY);
    hoveredId = undefined;
    map.getCanvas().style.cursor = "";
  };
  const handleMove = (event: MapMouseEvent) => {
    if (map.isMoving()) return;
    const feature = map.queryRenderedFeatures(event.point, { layers: [HIT_LAYER] })[0];
    const group = feature?.properties?.hover_group as string | number | undefined;
    if (group === undefined) {
      clear();
      return;
    }
    if (group === hoveredId) return;
    hoveredId = group;
    (map.getSource(HOVER) as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: currentBuildings.filter((building) => building.properties?.hover_group === group),
    });
    map.getCanvas().style.cursor = "pointer";
  };

  const handleSourceData = (event: MapSourceDataEvent) => {
    if ((event.sourceId === TILES || event.sourceId === LANDMARKS) && event.isSourceLoaded) updateBuildings();
  };

  map.on("sourcedata", handleSourceData);
  map.on("idle", updateBuildings);
  map.on("mousemove", handleMove);
  map.on("movestart", clear);
  const canvas = map.getCanvas();
  canvas.addEventListener("mouseleave", clear);
  return () => {
    map.off("sourcedata", handleSourceData);
    map.off("idle", updateBuildings);
    map.off("mousemove", handleMove);
    map.off("movestart", clear);
    canvas.removeEventListener("mouseleave", clear);
  };
}
