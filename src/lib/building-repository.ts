import type { Pool } from "pg";
import type { BuildingDetails, BuildingPhoto } from "./buildings.ts";

type BuildingRow = {
  id: string;
  modelId: string | null;
  modelGroup: string | null;
  name: string;
  address: string;
  neighborhood: string;
  city: string;
  country: string;
  status: BuildingDetails["status"];
  sourceUrl: string | null;
  sourceRank: number | null;
  longitude: number;
  latitude: number;
  heightM: number;
  floors: number | null;
  completed: number | null;
  architect: string | null;
  style: string | null;
  summary: string;
  photo: BuildingPhoto | null;
};

export async function listBuildings(db: Pick<Pool, "query">): Promise<BuildingDetails[]> {
  const { rows } = await db.query<BuildingRow>(`
    SELECT b.id, COALESCE(b.mapbox_model_id, g.mapbox_model_id) AS "modelId", b.model_group AS "modelGroup", name, address, neighborhood,
      longitude, latitude, height_m AS "heightM", floors, completed_year AS completed,
      architect, architectural_style AS style, description AS summary, photo,
      city, country, status, source_url AS "sourceUrl", source_rank AS "sourceRank"
    FROM buildings b
    LEFT JOIN building_model_groups g ON g.id = b.model_group
    WHERE b.mapbox_source = 'mapbox.mapbox-3dbuildings-v1'
    ORDER BY height_m DESC, b.id
  `);
  return rows.map(({ longitude, latitude, modelId, modelGroup, floors, completed, architect, style, photo, sourceUrl, sourceRank, ...building }) => ({
    ...building,
    modelId: modelId ?? undefined,
    modelGroup: modelGroup ?? undefined,
    coordinates: [longitude, latitude],
    floors: floors ?? undefined,
    completed: completed ?? undefined,
    architect: architect ?? undefined,
    style: style ?? undefined,
    photo: photo ?? undefined,
    sourceUrl: sourceUrl ?? undefined,
    sourceRank: sourceRank ?? undefined,
  }));
}
