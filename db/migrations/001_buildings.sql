CREATE TABLE buildings (
  id text PRIMARY KEY CHECK (btrim(id) <> ''),
  -- The source and exact string ID identify the physical Mapbox landmark mesh.
  -- Many IDs exceed both JS safe integers and signed PostgreSQL bigint.
  mapbox_source text NOT NULL DEFAULT 'mapbox.mapbox-3dbuildings-v1'
    CHECK (btrim(mapbox_source) <> ''),
  mapbox_model_id text NOT NULL CHECK (btrim(mapbox_model_id) <> ''),
  name text NOT NULL CHECK (btrim(name) <> ''),
  address text NOT NULL CHECK (btrim(address) <> ''),
  neighborhood text NOT NULL DEFAULT '',
  -- Footprint centroid, NOT the tile anchor returned by Mapbox model queries.
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  height_m double precision NOT NULL CHECK (height_m >= 0 AND height_m < 'Infinity'::float8),
  floors integer CHECK (floors > 0),
  completed_year integer CHECK (completed_year BETWEEN 1 AND 9999),
  architect text,
  architectural_style text,
  description text NOT NULL DEFAULT '',
  additional_stats jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(additional_stats) = 'object'),
  photo jsonb CHECK (
    photo IS NULL OR (
      jsonb_typeof(photo) = 'object'
      AND photo ?& ARRAY['src', 'credit', 'license', 'href']
      AND jsonb_typeof(photo->'src') = 'string'
      AND jsonb_typeof(photo->'credit') = 'string'
      AND jsonb_typeof(photo->'license') = 'string'
      AND jsonb_typeof(photo->'href') = 'string'
    )
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mapbox_source, mapbox_model_id)
);

CREATE INDEX buildings_height_idx ON buildings (height_m DESC);

CREATE FUNCTION set_building_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE TRIGGER buildings_updated_at
BEFORE UPDATE ON buildings
FOR EACH ROW EXECUTE FUNCTION set_building_updated_at();
