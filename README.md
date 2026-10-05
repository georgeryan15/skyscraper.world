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

Hover major Midtown towers to reveal a blue tint and a luminous outline. The
effect uses Mapbox building footprints and landmark points, limited to towers
at least 150 metres tall between approximately 34th and 59th Streets. 270 Park
Avenue has an explicit landmark anchor because it is missing from Mapbox's
landmark POI tiles; 30 Rockefeller Plaza also has a tower-specific anchor.
Detailed native models remain visible beneath the overlay;
the outline follows the available footprint rather than the model's exact mesh.

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
