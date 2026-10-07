import type { Map, MapLayerMouseEvent } from "mapbox-gl";
import type { FeatureCollection, Point } from "geojson";
import type { BuildingDetails } from "./buildings.ts";

const SOURCE = "catalog-locations";
const LAYER = "catalog-location-pins";

export function catalogLocations(buildings: readonly BuildingDetails[]): FeatureCollection<Point> {
  return {
    type: "FeatureCollection",
    features: buildings.filter((building) => building.coordinates).map((building) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: building.coordinates! },
      properties: { buildingId: building.id, hasModel: Boolean(building.modelId) },
    })),
  };
}

/** Location pins keep every record discoverable even outside 3D coverage. */
export function addCatalogLocations(map: Map, buildings: readonly BuildingDetails[], events: {
  onHover: (building: BuildingDetails | null) => void;
  onSelect: (building: BuildingDetails) => void;
}): () => void {
  const byId = new globalThis.Map(buildings.map((building) => [building.id, building]));
  map.addSource(SOURCE, { type: "geojson", data: catalogLocations(buildings) });
  map.addLayer({
    id: LAYER, type: "circle", source: SOURCE,
    // Native mesh silhouettes take over at street scale where available.
    filter: ["any", ["!", ["get", "hasModel"]], ["<", ["zoom"], 14.6]],
    paint: { "circle-radius": 6, "circle-color": "#0779a3", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 },
  });
  function resolve(event: MapLayerMouseEvent) {
    return byId.get(String(event.features?.[0]?.properties?.buildingId));
  }
  function enter(event: MapLayerMouseEvent) {
    map.getCanvas().style.cursor = "pointer";
    events.onHover(resolve(event) ?? null);
  }
  function leave() {
    map.getCanvas().style.cursor = "";
    events.onHover(null);
  }
  function click(event: MapLayerMouseEvent) {
    const building = resolve(event);
    if (!building) return;
    event.preventDefault();
    events.onSelect(building);
  }
  map.on("mousemove", LAYER, enter);
  map.on("mouseleave", LAYER, leave);
  map.on("click", LAYER, click);
  map.on("movestart", leave);
  return () => {
    map.off("mousemove", LAYER, enter);
    map.off("mouseleave", LAYER, leave);
    map.off("click", LAYER, click);
    map.off("movestart", leave);
    if (map.getLayer(LAYER)) map.removeLayer(LAYER);
    if (map.getSource(SOURCE)) map.removeSource(SOURCE);
  };
}
