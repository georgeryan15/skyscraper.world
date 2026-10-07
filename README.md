# Skyscraper

A full-screen 3D Mapbox map of the world's tallest buildings, built with Next.js,
TypeScript, and PostgreSQL. It opens in Midtown Manhattan; **Explore skyscrapers**
searches the worldwide catalogue and flies to a selected building.

## Catalogue

The catalogue contains **49 buildings**: the original 10 plus 39 additions from
[Wikipedia's tallest buildings table](https://en.wikipedia.org/wiki/List_of_tallest_buildings#Tallest_buildings_in_the_world).
The 7 existing towers in that table are reused, and tied ranks and twin towers
remain separate records. Of the table's 98 entries, 52 listed under China
(including Hong Kong) are deferred; Taipei 101 is included under Taiwan.
`db/catalog-import.json` records the source, date, included/excluded entries,
references, and native-model coverage for the import.

Every entry has a location, short description, facts, image, credit, and source
link. Heights, floor counts, and years follow the source table; topped-out
buildings are labelled separately from completed buildings.

Thirty records resolve to 28 native Mapbox meshes. Petronas Towers and JW
Marriott Marquis Dubai each share one mesh for their two towers; the details
panel lets you switch between the individual records. The other 19 buildings
have location pins because no matching native landmark mesh was found. Pins
also identify modelled buildings when zoomed out. No substitute prism or guessed
hover shape is drawn. Coverage can improve by assigning a verified model ID later.

## Development

```sh
npm install
cp .env.example .env
npm run db:up
npm run dev
```

Set `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` in `.env`, then open http://localhost:3000.
Local `.env` files are gitignored. Mapbox uses a public browser token, so Next.js
includes this value in the client bundle; use a public token with appropriate URL restrictions.

## Local PostgreSQL

Docker must be running. `npm run db:up` starts PostgreSQL 18, waits for it to be
healthy, applies the SQL migrations in `db/migrations/`, and imports all 49
buildings from `db/buildings.seed.json`. The database is exposed only
on `127.0.0.1:5432` and persists in the Compose `postgres_data` named volume.
The volume mounts at `/var/lib/postgresql`, as required by the
[PostgreSQL 18 Docker image](https://hub.docker.com/_/postgres).

The defaults in `.env.example` are database/user `skyscraper` and local password
`skyscraper_local`. The app and database scripts connect using `DATABASE_URL`.
If you change the Compose credentials or port, update `DATABASE_URL` to match.
Compose reads `.env`; the app and scripts also respect Next.js `.env.local`
overrides. Changing `POSTGRES_USER`, `POSTGRES_DB`, or `POSTGRES_PASSWORD` after
initialization does not change an existing database or role.

```sh
npm run db:up       # Start, migrate, and import; safe to repeat
npm run db:down     # Stop/remove the container; retain the data volume
npm run db:migrate  # Apply new numbered SQL migrations
npm run db:seed     # Insert missing buildings; preserve existing DB edits
npm run db:psql     # Open a SQL shell in the container
npm run test:db     # Integration checks using a temporary, isolated schema
```

`buildings` stores the building's stable slug, Mapbox source and model ID,
location (longitude/latitude), name, address, neighborhood, city, country, height in
metres, floor count, completion year/status, architect, architectural style, description,
source URL/rank, and photo URL/credit/licence/link. `additional_stats` is a JSON object for further
statistics. `created_at` and automatically maintained `updated_at` track changes.
Mapbox IDs are stored as text to preserve their exact values, with a unique
constraint on `(mapbox_source, mapbox_model_id)` to prevent duplicate physical
models. `building_model_groups` stores the shared identity for twin towers;
their building records reference that group and leave the direct model ID empty.
Buildings outside landmark coverage have neither a model ID nor a group.
The model itself is served by Mapbox; the DB stores its identity and location
rather than copying its mesh or treating a tile anchor as a footprint.

For example, inside `npm run db:psql`:

```sql
SELECT name, mapbox_model_id, height_m, floors, completed_year FROM buildings ORDER BY height_m DESC;
UPDATE buildings SET description = 'Your updated description.' WHERE id = 'empire-state-building';
```

The page reads PostgreSQL on the server for each request and passes the catalog
to the map, tooltips, and details panel. Reload the page to see database edits.
No database credentials are sent to the browser, and production builds do not
need a running database. Add a new migration rather than editing an applied one;
the migration runner detects changed checksums.

The map uses Mapbox Standard's default colours and daytime lighting, with native
3D buildings, landmarks, facades, and trees enabled. POI, business, landmark, and
transit markers are hidden. Drag to pan, scroll to zoom, and right-drag (or
Ctrl-drag) to rotate and tilt.

Hover a catalogued native landmark, or a major Midtown landmark, to fade in richer teal glass, warm roof and facade
colours, and a bold cyan outline with a soft halo. A pointer cursor confirms the
hover. The effect uses Mapbox's native landmark meshes, including 270 Park
Avenue and 30 Rockefeller Plaza, rather than approximate street footprints.

The hovered model moves into its own layer between two custom WebGL passes,
which copy the depth buffer before and after it is drawn. Every pixel whose
depth changed is a visible pixel of that model, so the silhouette follows
setbacks and spires, respects buildings in front of it, and has no holes where
its colours resemble the scene behind it. The outline strokes only the outside
of the silhouette at a constant CSS-pixel width.

Model queries only test bounding boxes, so each candidate's silhouette is first
traced invisibly (the selected layer matches the base until confirmed) and read
back asynchronously, packed to one bit per CSS pixel, without stalling the GPU.
Candidates are tried nearest first. Silhouettes are cached for the current
camera position, so moving the pointer over or between traced towers is decided
on the CPU without re-rendering the map. Acquisition uses a 2 CSS-pixel radius,
widening to 5 pixels once hovered to bridge mullions and antialiased edges.

The selected layer's filter is changed in place rather than through
`map.setFilter`, which would reload and re-parse every landmark tile on each
hover (see `applyModelFilter` in `src/lib/landmark-hover.ts`). The map only
re-renders during the 200 ms fade in and 150 ms fade out. Model selection is
enabled for all verified catalogue model IDs worldwide, plus native landmark
models at least 150 metres tall with anchors in Midtown. Hover clears during map movement and rechecks the pointer when movement
ends. Reduced-motion settings skip the fades, and GPU resources and listeners
are freed on cleanup.

## Building tooltip and details

Rest the pointer on a landmark for half a second to see a liquid-glass tooltip
with its name, height, and a gauge comparing it with the tallest catalogued
tower. Click the landmark to open a details panel with a photo, key facts, its
height rank, and buttons to fly to the building or copy its address. Press
Escape, use the close button, or click elsewhere on the map to close it. On
narrow screens the panel becomes a bottom sheet, and on touch screens a tap
opens the tallest eligible landmark under the finger.

Flying to a building frames the whole tower, upright and vertically centred, in
the part of the map the panel leaves uncovered (`src/lib/tower-camera.ts`). It
uses Mapbox's camera padding, which moves the perspective centre into that area,
so the tower does not lean as it would if merely offset from the middle of the
screen. The zoom is chosen from the tower's height so it fills about 72% of the
uncovered height, and the padding eases away when the panel closes. Catalogue
coordinates identify each building's location; model anchors are used where available.

Building details come from the local PostgreSQL database, initially populated
with the existing catalog in `db/buildings.seed.json`. Model queries return each
tile's anchor rather than the building's position, so towers are matched by
landmark model id; other landmarks show their model height only.
Images are hotlinked with photographer/owner credits and source/licence links.
47 records use freely licensed Wikimedia Commons or English Wikipedia images.
Ciel uses an official owner image, and City Tower 1 uses a credited architectural
rendering from Pelli Clarke & Partners; these two are labelled **Copyright retained**,
not as Creative Commons images. Public availability alone does not grant reuse rights.
In Chromium the glass also refracts the map at its rim through an SVG
displacement filter; other browsers keep the blur and specular rim.

## HeroUI

HeroUI styles are loaded in `src/app/globals.css`. HeroUI v3 does not require a provider.

Import components as needed:

```tsx
import { Button } from "@heroui/react";

export default function Home() {
  return <Button>Hello HeroUI</Button>;
}
```

See the [HeroUI documentation](https://heroui.com/en/docs/react/getting-started/quick-start).

## Checks and production

```sh
npm run lint
npm run typecheck
npm test
npm run test:db
npm run build
npm start
```
