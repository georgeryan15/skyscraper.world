# Skyscraper

A full-screen 3D Mapbox map of Midtown Manhattan, built with Next.js and TypeScript.

## Development

```sh
npm install
cp .env.example .env
npm run dev
```

Set `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` in `.env`, then open http://localhost:3000.
Local `.env` files are gitignored. Mapbox uses a public browser token, so Next.js
includes this value in the client bundle; use a public token with appropriate URL restrictions.

The map uses Mapbox Standard's default colours and daytime lighting, with native
3D buildings, landmarks, facades, and trees enabled. POI, business, landmark, and
transit markers are hidden. Drag to pan, scroll to zoom, and right-drag (or
Ctrl-drag) to rotate and tilt.

Hover major Midtown landmarks to fade in richer teal glass, warm roof and facade
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
limited to native landmark models at least 150 metres tall with anchors in
Midtown. Hover clears during map movement and rechecks the pointer when movement
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
coordinates are the footprint centroids of the landmark models.

Building details are placeholder data in `src/lib/buildings.ts`. Model queries
return each tile's anchor rather than the building's position, so towers are
matched by landmark model id; other landmarks show their model height only.
Photos are hotlinked from Wikimedia Commons with their credit and licence.
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
npm run build
npm start
```
