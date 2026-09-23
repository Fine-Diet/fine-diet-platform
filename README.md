# fine-diet-platform

Routing & IA rules: [docs/navigation/ROUTING-IA.md](docs/navigation/ROUTING-IA.md).

## Local grocery price search (Lists / Plans)

SerpAPI-backed Find Price reads `SERPAPI_API_KEY` from Next.js env files. Put the key in `.env.local`. If `.env.production.local` sets `SERPAPI_API_KEY=""`, it overrides `.env.local` during `next dev` and price search will show as unavailable.