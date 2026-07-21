# Deploying to Azure App Service

This app is a Node/Express server (serving the built React frontend and two
API proxy routes), so it needs a real Node runtime — not a static host.
**Azure App Service (Linux, Node 20)** is the simplest fit and doesn't
require a billing-heavy setup: the **F1 (Free)** or **B1 (Basic)** tier is
enough to run this.

No Google Cloud billing account is needed anywhere in this stack — maps,
tiles, geocoding, and routing all use free/open-source services (see
`.env.example` for details).

## 1. One-time Azure setup (Azure CLI)

Install the [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli)
if you don't have it, then:

```bash
az login

# Pick names/region you want — must be globally unique for the web app name
RESOURCE_GROUP="sg-cheap-carpark-rg"
APP_SERVICE_PLAN="sg-cheap-carpark-plan"
WEBAPP_NAME="sg-cheap-carpark"        # becomes <name>.azurewebsites.net
LOCATION="southeastasia"               # closest region to Singapore

# 1. Resource group
az group create --name $RESOURCE_GROUP --location $LOCATION

# 2. App Service plan (Linux, Free tier — bump to B1 if you outgrow it)
az appservice plan create \
  --name $APP_SERVICE_PLAN \
  --resource-group $RESOURCE_GROUP \
  --sku F1 \
  --is-linux

# 3. Web App running Node 20
az webapp create \
  --name $WEBAPP_NAME \
  --resource-group $RESOURCE_GROUP \
  --plan $APP_SERVICE_PLAN \
  --runtime "NODE:20-lts"
```

## 2. Configure environment variables & startup command

```bash
# App secrets/config (same values you'd put in .env.local)
az webapp config appsettings set \
  --name $WEBAPP_NAME \
  --resource-group $RESOURCE_GROUP \
  --settings \
    GEMINI_API_KEY="your-gemini-api-key" \
    ORS_API_KEY="your-openrouteservice-key-or-leave-blank" \
    ONEMAP_EMAIL="your-onemap-account-email-or-leave-blank" \
    ONEMAP_PASSWORD="your-onemap-account-password-or-leave-blank" \
    APP_URL="https://$WEBAPP_NAME.azurewebsites.net" \
    SCM_DO_BUILD_DURING_DEPLOYMENT=false \
    WEBSITE_NODE_DEFAULT_VERSION="20-lts"

# Tell App Service how to start the already-built bundle
# (the GitHub Actions workflow deploys dist/ + node_modules/ prebuilt,
# so Azure doesn't need to run its own build step — that's what
# SCM_DO_BUILD_DURING_DEPLOYMENT=false above is for)
az webapp config set \
  --name $WEBAPP_NAME \
  --resource-group $RESOURCE_GROUP \
  --startup-file "node dist/server.cjs"
```

`server.ts` reads `process.env.PORT` (falling back to 3000 for local dev),
so it automatically binds to whatever port Azure assigns — no extra config
needed there.

## 3. Wire up GitHub Actions to auto-deploy on push

1. Download the publish profile for your Web App:
   ```bash
   az webapp deployment list-publishing-profiles \
     --name $WEBAPP_NAME \
     --resource-group $RESOURCE_GROUP \
     --xml
   ```
   This prints an XML document — copy the whole thing.

2. In your GitHub repo, go to **Settings → Secrets and variables → Actions
   → New repository secret**, name it `AZURE_WEBAPP_PUBLISH_PROFILE`, and
   paste the XML as the value.

3. If you named your Web App something other than `sg-cheap-carpark`, update
   `AZURE_WEBAPP_NAME` in `.github/workflows/azure-deploy.yml` to match.

4. Push to `main` (or run the workflow manually from the **Actions** tab) —
   it will install deps, type-check, build the client bundle + server
   bundle, strip devDependencies, and deploy the result to Azure.

## 4. Verify

```bash
curl https://$WEBAPP_NAME.azurewebsites.net/api/health
```

Should return `{"status":"ok","cacheLoaded":true}`. If it doesn't respond
within a minute or two of the workflow finishing, check
**Azure Portal → your Web App → Log stream** for startup errors (most
commonly a missing/incorrect startup command or a missing env var).

## Notes on cost

- **App Service F1 (Free)** tier: no cost, but the app sleeps after periods
  of inactivity (cold start delay on the next request) and has a monthly
  compute-minute cap. Fine for a demo/portfolio project.
- **B1 (Basic)**: a few dollars/month, keeps the app always-on, no sleep.
- Map tiles (OpenFreeMap), geocoding (Nominatim), and the OSRM fallback
  route provider are all free with no Azure-side or Google-side billing
  involved. OpenRouteService's free tier (2,000 requests/day) is also
  card-free — just an email signup.
