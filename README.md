<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# SG Cheap Carpark

Find the closest, cheapest available parking in Singapore, with an AI
advisor, smart vacancy alerts, and an offline drive simulator. Includes
private/mall carpark rates with day/night and weekday/weekend pricing —
shown even when a mall has no live availability feed.

View your app in AI Studio: https://ai.studio/apps/e4919ff4-dfea-4617-b37a-7ecf86e9c527

## Stack

- **Map & tiles**: [MapLibre GL JS](https://maplibre.org/) via `react-map-gl`, tiles served free by [OpenFreeMap](https://openfreemap.org) — no API key, no billing account required.
- **Geocoding**: [OneMap](https://www.onemap.gov.sg/) (Singapore Land Authority's official geocoder, if configured) with [OpenStreetMap Nominatim](https://nominatim.org/) as a fallback — both proxied through the server.
- **Driving directions**: [OpenRouteService](https://openrouteservice.org) (free tier), with an automatic fallback to the public OSRM demo server if no key is configured.
- **AI Advisor**: Google Gemini, via `@google/genai`.
- **Live carpark data**: [data.gov.sg](https://data.gov.sg) carpark availability API + HDB static carpark info + a curated list of private mall carparks with time-based pricing.

No Google Maps Platform key or Google Cloud billing account is required.

## Run Locally

**Prerequisites:** Node.js 20+

1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env.local` and fill in your keys — see that file
   for what each one does and where to get a free one. At minimum you'll
   want a `GEMINI_API_KEY` (for the AI Advisor); the map itself works with
   no keys at all.
3. Run the app:
   `npm run dev`

The app runs at http://localhost:3000.

## Deploying

See [`AZURE_DEPLOY.md`](AZURE_DEPLOY.md) for a full walkthrough of deploying
to Azure App Service, including a ready-to-use GitHub Actions workflow
(`.github/workflows/azure-deploy.yml`) that builds and deploys on every push
to `main`.
