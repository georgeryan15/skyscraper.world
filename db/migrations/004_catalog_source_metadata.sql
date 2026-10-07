-- Align the original seed records with the requested source table.
-- Conditional updates preserve subsequent user edits.
UPDATE buildings SET source_url = COALESCE(source_url, 'https://en.wikipedia.org/wiki/Central_Park_Tower'), source_rank = COALESCE(source_rank, 15) WHERE id = 'central-park-tower';
UPDATE buildings SET height_m = 472.4 WHERE id = 'central-park-tower' AND height_m = 472;
UPDATE buildings SET completed_year = 2021 WHERE id = 'central-park-tower' AND completed_year = 2020;
UPDATE buildings SET source_url = COALESCE(source_url, 'https://en.wikipedia.org/wiki/111_West_57th_Street'), source_rank = COALESCE(source_rank, 29) WHERE id = '111-west-57th-street';
UPDATE buildings SET height_m = 435.3 WHERE id = '111-west-57th-street' AND height_m = 435;
UPDATE buildings SET source_url = COALESCE(source_url, 'https://en.wikipedia.org/wiki/One_Vanderbilt'), source_rank = COALESCE(source_rank, 31) WHERE id = 'one-vanderbilt';
UPDATE buildings SET source_url = COALESCE(source_url, 'https://en.wikipedia.org/wiki/432_Park_Avenue'), source_rank = COALESCE(source_rank, 32) WHERE id = '432-park-avenue';
UPDATE buildings SET height_m = 425.7 WHERE id = '432-park-avenue' AND height_m = 426;
UPDATE buildings SET source_url = COALESCE(source_url, 'https://en.wikipedia.org/wiki/270_Park_Avenue_(2025%E2%80%93present)'), source_rank = COALESCE(source_rank, 35) WHERE id = '270-park-avenue';
UPDATE buildings SET source_url = COALESCE(source_url, 'https://en.wikipedia.org/wiki/Empire_State_Building'), source_rank = COALESCE(source_rank, 60) WHERE id = 'empire-state-building';
UPDATE buildings SET source_url = COALESCE(source_url, 'https://en.wikipedia.org/wiki/Bank_of_America_Tower_(Manhattan)'), source_rank = COALESCE(source_rank, 75) WHERE id = 'bank-of-america-tower';
UPDATE buildings SET height_m = 365.8 WHERE id = 'bank-of-america-tower' AND height_m = 366;
