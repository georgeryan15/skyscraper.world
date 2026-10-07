import type { Pool } from "pg";
import type { BuildingDetails, BuildingPhoto } from "./buildings.ts";

type BuildingRow = {
  id: string;
  modelId: string;
  name: string;
  address: string;
  neighborhood: string;
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
    SELECT id, mapbox_model_id AS "modelId", name, address, neighborhood,
      longitude, latitude, height_m AS "heightM", floors, completed_year AS completed,
      architect, architectural_style AS style, description AS summary, photo
    FROM buildings
    WHERE mapbox_source = 'mapbox.mapbox-3dbuildings-v1'
    ORDER BY height_m DESC, id
  `);
  return rows.map(({ longitude, latitude, floors, completed, architect, style, photo, ...building }) => ({
    ...building,
    coordinates: [longitude, latitude],
    floors: floors ?? undefined,
    completed: completed ?? undefined,
    architect: architect ?? undefined,
    style: style ?? undefined,
    photo: photo ?? undefined,
  }));
}
