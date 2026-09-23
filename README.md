# fine-diet-platform

Routing & IA rules: [docs/navigation/ROUTING-IA.md](docs/navigation/ROUTING-IA.md).

## Local grocery price search (Lists / Plans)

SerpAPI-backed Find Price reads `SERPAPI_API_KEY` from Next.js env files. Put the key in `.env.local`. Do not set `SERPAPI_API_KEY=""` in `.env.production.local` — an empty override masks a valid `.env.local` value. After changing env files, restart `npm run dev` (the running Node process does not reload keys). Optional check: `NODE_ENV=development npx tsx scripts/diagListPriceSearch.ts`.