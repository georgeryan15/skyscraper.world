-- Some locations have no native landmark mesh. Keep them in the catalogue
-- without inventing a model ID or drawing an inaccurate replacement shape.
ALTER TABLE buildings ALTER COLUMN mapbox_model_id DROP NOT NULL;
ALTER TABLE buildings
  ADD COLUMN city text NOT NULL DEFAULT '',
  ADD COLUMN country text NOT NULL DEFAULT '',
  ADD COLUMN status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'topped-out')),
  ADD COLUMN source_url text,
  ADD COLUMN source_rank integer CHECK (source_rank > 0);

UPDATE buildings SET city = 'New York City', country = 'United States'
WHERE id IN ('empire-state-building', 'chrysler-building', 'one-vanderbilt',
  '270-park-avenue', '30-rockefeller-plaza', 'central-park-tower',
  '432-park-avenue', '111-west-57th-street', 'bank-of-america-tower', 'metlife-building');
