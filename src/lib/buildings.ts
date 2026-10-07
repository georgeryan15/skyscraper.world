import type { Feature } from "geojson";

export type BuildingPhoto = {
  src: string;
  credit: string;
  license: string;
  href: string;
  licenseHref?: string;
  caption?: string;
};

export type BuildingDetails = {
  id: string;
  /** Feature id of the native landmark model in mapbox.mapbox-3dbuildings-v1. */
  modelId?: string;
  /** Twin towers can share one native Mapbox mesh, but remain separate records. */
  modelGroup?: string;
  name: string;
  address: string;
  neighborhood: string;
  city?: string;
  country?: string;
  /** Year reported by the source, which can include architectural topping out. */
  status?: "completed" | "topped-out";
  sourceUrl?: string;
  sourceRank?: number;
  /** Building longitude/latitude; a verified model anchor where available. */
  coordinates?: [number, number];
  heightM: number;
  floors?: number;
  completed?: number;
  architect?: string;
  style?: string;
  summary: string;
  photo?: BuildingPhoto;
  /** No catalog entry matched; only the map's model data is known. */
  placeholder?: boolean;
};

export function describeBuilding(feature: Feature, buildings: readonly BuildingDetails[]): BuildingDetails {
  const match = feature.id === undefined ? undefined : buildings.find((tower) => tower.modelId === String(feature.id));
  if (match) return match;
  const height = Number(feature.properties?.height);
  return {
    id: `model-${feature.id}`,
    modelId: String(feature.id),
    name: "Unnamed tower",
    address: "Map landmark",
    neighborhood: "",
    heightM: Number.isFinite(height) ? Math.round(height) : 0,
    summary: "There are no details for this tower yet. Its height comes from the map's 3D model.",
    placeholder: true,
  };
}

export function buildingAddress(building: BuildingDetails): string {
  return [...new Set([building.address, building.neighborhood, building.city, building.country].filter(Boolean))].join(", ");
}

export function searchBuildings(buildings: readonly BuildingDetails[], query: string): BuildingDetails[] {
  const normalize = (value: string) => value.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const words = normalize(query).trim().split(/\s+/);
  return buildings.filter((building) => {
    const haystack = normalize([building.name, building.id.replaceAll("-", " "), buildingAddress(building)].join(" "));
    return words.every((word) => haystack.includes(word));
  }).sort((a, b) => b.heightM - a.heightM || a.name.localeCompare(b.name));
}

export function toFeet(metres: number): string {
  return Math.round(metres * 3.28084).toLocaleString("en-US");
}
