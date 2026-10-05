# Skyscraper

An empty Next.js app with TypeScript, App Router, Tailwind CSS v4, and HeroUI v3.

## Development

```sh
npm install
npm run dev
```

Open http://localhost:3000. The homepage is intentionally blank; start building in `src/app/page.tsx`.

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
npm run build
npm start
```
