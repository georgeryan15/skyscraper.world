-- Mapbox serves some twin towers as one mesh. Keep the physical model unique
-- and let each tower retain its own identity, location, dates and description.
CREATE TABLE building_model_groups (
  id text PRIMARY KEY,
  mapbox_source text NOT NULL DEFAULT 'mapbox.mapbox-3dbuildings-v1',
  mapbox_model_id text NOT NULL CHECK (btrim(mapbox_model_id) <> ''),
  UNIQUE (mapbox_source, mapbox_model_id)
);
ALTER TABLE buildings ADD COLUMN model_group text REFERENCES building_model_groups(id);
ALTER TABLE buildings ADD CONSTRAINT building_model_kind CHECK (model_group IS NULL OR mapbox_model_id IS NULL);
