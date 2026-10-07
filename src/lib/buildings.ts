import type { Feature } from "geojson";

export type BuildingPhoto = {
  src: string;
  credit: string;
  license: string;
  href: string;
};

export type BuildingDetails = {
  id: string;
  /** Feature id of the native landmark model in mapbox.mapbox-3dbuildings-v1. */
  modelId?: string;
  name: string;
  address: string;
  neighborhood: string;
  /** Longitude, latitude of the landmark model's footprint centroid. */
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
  const match = buildings.find((tower) => tower.modelId === String(feature.id));
  if (match) return match;
  const height = Number(feature.properties?.height);
  return {
    id: `model-${feature.id}`,
    modelId: String(feature.id),
    name: "Unnamed tower",
    address: "Midtown Manhattan",
    neighborhood: "",
    heightM: Number.isFinite(height) ? Math.round(height) : 0,
    summary: "There are no details for this tower yet. Its height comes from the map's 3D model.",
    placeholder: true,
  };
}

export function toFeet(metres: number): string {
  return Math.round(metres * 3.28084).toLocaleString("en-US");
}
