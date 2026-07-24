import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { SVY21 } from "./src/utils/svy21.ts";
import { Carpark } from "./src/types.ts";
import { PRIVATE_CARPARKS } from "./src/data/privateCarparks.ts";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Initialize SVY21 converter
const svy21Converter = new SVY21();

// Initialize GoogleGenAI server-side with required User-Agent
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "",
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

app.use(express.json());

// Minimal CORS support
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

// In-memory cache for HDB carpark static metadata
let hdbCarparkMetadataCache: Record<string, any> = {};
let cacheLoaded = false;

// Predefined coordinates and SGCarmart scraped rates for private carparks
const MALL_COORDINATES = PRIVATE_CARPARKS;

// Start background task to fetch and compile Singapore's carpark metadata
async function loadCarparkMetadata() {
  try {
    console.log("Loading Singapore carpark static database from GitHub...");
    const response = await fetch(
      "https://raw.githubusercontent.com/MarkFull/sg-parking/master/data/raw/hdb.json",
      { signal: AbortSignal.timeout(10000) }
    );
    if (!response.ok) {
      throw new Error(`HTTP Error fetching metadata: ${response.statusText}`);
    }
    const data = (await response.json()) as { records?: any[] };
    const records = data.records || [];
    
    // Compile coordinates for HDB carparks dynamically
    const compiled: Record<string, any> = {};
    for (const item of records) {
      const key = item.car_park_no;
      if (!key) continue;

      if (item.x_coord && item.y_coord) {
        const x = parseFloat(item.x_coord);
        const y = parseFloat(item.y_coord);
        if (!isNaN(x) && !isNaN(y)) {
          const gps = svy21Converter.computeLatLon(y, x);
          compiled[key] = {
            ...item,
            lat: gps.lat,
            lng: gps.lng,
          };
        }
      } else {
        compiled[key] = item;
      }
    }
    
    hdbCarparkMetadataCache = compiled;
    cacheLoaded = true;
    console.log(`Successfully compiled coordinates for ${Object.keys(compiled).length} HDB carparks!`);
  } catch (error: any) {
    console.warn("Failed to load Singapore carpark metadata: ", error.message || error);
    console.log("Falling back to local generated HDB database for basic services.");
  }
}

loadCarparkMetadata();

// --- URA Parking Places (covers non-HDB, non-mall carparks) ---
// The live LTA carpark-availability feed includes many URA-regulated
// carparks (community clubs, government buildings, open-air lots, etc.)
// identified only by a short code like "S0047" or "J0117" — with no name
// or address included. Previously, any such carpark that wasn't in the
// HDB static dataset AND didn't fuzzy-match one of the ~30 hand-curated
// entries in MALL_COORDINATES was silently dropped from the results
// entirely (e.g. Cairnhill Community Club, Environment Building). This
// loads URA's own official "Capacity of URA Parking Places" dataset from
// data.gov.sg, keyed by the same code (PP_CODE), to give those carparks a
// real name and location instead of disappearing.
let uraParkingPlacesCache: Record<string, { name: string; lat: number; lng: number }> = {};

async function loadUraParkingPlaces() {
  try {
    console.log("Loading URA parking places dataset...");
    const datasetId = "d_9bf8620ecfdc8a5f8f77e3f02160af5c";
    const pollResponse = await fetch(
      `https://api-open.data.gov.sg/v1/public/api/datasets/${datasetId}/poll-download`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!pollResponse.ok) {
      throw new Error(`Poll-download request failed with status ${pollResponse.status}`);
    }
    const pollData: any = await pollResponse.json();
    const downloadUrl = pollData?.data?.url;
    if (!downloadUrl) {
      throw new Error("No download URL returned from data.gov.sg poll-download");
    }

    const geoJsonResponse = await fetch(downloadUrl, { signal: AbortSignal.timeout(10000) });
    if (!geoJsonResponse.ok) {
      throw new Error(`GeoJSON download failed with status ${geoJsonResponse.status}`);
    }
    const geoJson: any = await geoJsonResponse.json();
    const features: any[] = geoJson.features || [];

    const compiled: Record<string, { name: string; lat: number; lng: number }> = {};
    for (const feature of features) {
      const props = feature.properties || {};
      const code = props.PP_CODE;
      const name = props.PARKING_PL;
      const coords = feature.geometry?.coordinates;
      if (!code || !name || !Array.isArray(coords) || coords.length < 2) continue;

      // GeoJSON coordinates are [lng, lat]
      const [lng, lat] = coords;
      if (typeof lat !== "number" || typeof lng !== "number") continue;

      compiled[code] = { name, lat, lng };
    }

    uraParkingPlacesCache = compiled;
    console.log(`Successfully loaded ${Object.keys(compiled).length} URA parking places!`);
  } catch (error: any) {
    console.warn("Failed to load URA parking places dataset: ", error.message || error);
    console.log("Continuing without URA parking place enrichment — unmatched non-HDB, non-mall carparks will still be omitted, same as before this feature was added.");
  }
}

loadUraParkingPlaces();

// --- OSM/Overpass supplemental parking discovery ---
// Even with HDB + URA + the curated mall list, some real carparks have no
// presence in any Singapore government dataset at all — small private lots,
// or buildings that manage their own parking without reporting it anywhere
// centrally. Google Places could fill this gap, but it requires a Google
// Cloud billing account — exactly the dependency this app was deliberately
// migrated away from. Instead, this queries OpenStreetMap's free Overpass
// API for named parking locations across Singapore, no key/billing needed,
// consistent with the rest of this app's map stack (MapLibre/OpenFreeMap/
// Nominatim are already OSM-based).
//
// Only NAMED parking nodes are kept — anonymous/unlabeled OSM parking dots
// (there can be thousands) would flood the list with entries a user can't
// actually identify or navigate to by name, so they're deliberately
// excluded rather than shown as noise.
let osmParkingCache: Record<string, { name: string; lat: number; lng: number }> = {};

async function loadOsmParkingPlaces() {
  console.log("Loading supplemental parking locations from OpenStreetMap...");
  // Singapore's bounding box: south, west, north, east
  const query = `
    [out:json][timeout:15];
    (
      node["amenity"="parking"]["name"](1.15,103.55,1.48,104.15);
      way["amenity"="parking"]["name"](1.15,103.55,1.48,104.15);
    );
    out center;
  `;

  const endpoints = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.ai/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
  ];

  let data: any = null;
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: query,
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        data = await response.json();
        break;
      }
    } catch {
      // Try next endpoint silently
    }
  }

  if (!data || !Array.isArray(data.elements)) {
    console.warn("Could not fetch OSM supplemental parking dataset (Overpass endpoints timed out or unreachable). Continuing with HDB/URA/Mall data.");
    return;
  }

  try {
    const elements: any[] = data.elements || [];
    const compiled: Record<string, { name: string; lat: number; lng: number }> = {};
    for (const el of elements) {
      const name = el.tags?.name;
      if (!name) continue;

      // Nodes have lat/lon directly; ways return a computed "center" point
      // because `out center` was used above instead of full geometry.
      const lat = el.lat ?? el.center?.lat;
      const lng = el.lon ?? el.center?.lon;
      if (typeof lat !== "number" || typeof lng !== "number") continue;

      compiled[`osm-${el.type}-${el.id}`] = { name, lat, lng };
    }

    osmParkingCache = compiled;
    console.log(`Successfully loaded ${Object.keys(compiled).length} named OpenStreetMap parking locations!`);
  } catch (error: any) {
    console.warn("Failed to parse OpenStreetMap parking dataset: ", error.message || error);
  }
}

loadOsmParkingPlaces();

// Straight-line distance in metres between two lat/lng points (Haversine).
// Used to de-duplicate OSM parking entries against carparks already known
// from HDB/URA/mall sources, so the same physical carpark isn't listed twice.
function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Helper to determine if a carpark is HDB Central Area
function isCentralArea(carparkNumber: string, address: string): boolean {
  const centralPrefixes = ["ACB", "BBB", "CBD", "C12", "C13", "C14", "C15", "C16", "C17", "C18", "C19", "C20", "C21", "C22", "C23", "C24", "C25", "C26"];
  if (centralPrefixes.some(p => carparkNumber.startsWith(p))) {
    return true;
  }
  const centralKeywords = ["ROCHOR", "CANTONMENT", "ALBERT STREET", "BRAS BASAH", "BUGIS", "CHINATOWN", "PEOPLES PARK", "TANJONG PAGAR", "OUTRAM"];
  if (centralKeywords.some(k => address.toUpperCase().includes(k))) {
    return true;
  }
  return false;
}

// Calculate standard HDB pricing
function getHDBPriceRate(carparkNumber: string, address: string): { rate: string; isCentral: boolean } {
  const central = isCentralArea(carparkNumber, address);
  if (central) {
    return {
      rate: "$1.20 per 30-mins (Daytime Mon-Sat 7am-5pm), $0.60 per 30-mins otherwise. Night capped at $5.",
      isCentral: true,
    };
  }
  return {
    rate: "$0.60 per 30-mins. Night capped at $5 (10:30pm-7am).",
    isCentral: false,
  };
}

// API Routes

// Health endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    cacheLoaded,
    // Render automatically injects these at runtime, so this lets anyone
    // verify exactly which commit is actually live — no dashboard access
    // needed. Useful for confirming a deploy actually picked up the latest
    // push, especially when troubleshooting "my fix isn't showing up" cases.
    deployedCommit: process.env.RENDER_GIT_COMMIT || null,
    deployedBranch: process.env.RENDER_GIT_BRANCH || null,
  });
});

// GET /api/carparks
app.get("/api/carparks", async (req, res) => {
  try {
    // 1. Fetch real-time carpark availability
    const apiResponse = await fetch("https://api.data.gov.sg/v1/transport/carpark-availability");
    if (!apiResponse.ok) {
      throw new Error(`Data.gov.sg API returned status ${apiResponse.status}`);
    }
    const apiData: any = await apiResponse.json();
    const items = apiData.items || [];
    if (items.length === 0) {
      return res.json([]);
    }

    const timestamp = items[0].timestamp;
    const carparkDataList = items[0].carpark_data || [];

    // 2. Map and enrich real-time carparks
    const enrichedCarparks: Carpark[] = [];
    const matchedMalls = new Set<string>();

    for (const item of carparkDataList) {
      const cpNum = item.carpark_number;
      const cpInfo = item.carpark_info?.[0] || {};
      const totalLots = parseInt(cpInfo.total_lots) || 0;
      const lotsAvail = parseInt(cpInfo.lots_available) || 0;
      const lotType = cpInfo.lot_type || "C";
      const updateTime = item.update_datetime;

      // Look up in static cache
      const staticMeta = hdbCarparkMetadataCache[cpNum];

      if (staticMeta && staticMeta.lat && staticMeta.lng) {
        const pricing = getHDBPriceRate(cpNum, staticMeta.address || "");
        enrichedCarparks.push({
          carpark_number: cpNum,
          address: staticMeta.address || `Block ${cpNum} Carpark`,
          lat: staticMeta.lat,
          lng: staticMeta.lng,
          total_lots: totalLots,
          lots_available: lotsAvail,
          lot_type: lotType,
          update_datetime: updateTime,
          car_park_type: staticMeta.car_park_type || "SURFACE CAR PARK",
          type_of_parking_system: staticMeta.type_of_parking_system || "ELECTRONIC PARKING SYSTEM",
          short_term_parking: staticMeta.short_term_parking || "WHOLE DAY",
          free_parking: staticMeta.free_parking || "NO",
          night_parking: staticMeta.night_parking || "YES",
          gantry_height: parseFloat(staticMeta.gantry_height) || 0.0,
          car_park_basement: staticMeta.car_park_basement || "N",
          agency: "HDB",
          price_rate: pricing.rate,
          is_central: pricing.isCentral,
        });
      } else {
        // Check if it matches a shopping mall in our mall dictionary
        const cpNumLower = cpNum.toLowerCase();
        let mallMatch = Object.entries(MALL_COORDINATES).find(([k]) => cpNumLower.includes(k) || k.includes(cpNumLower));
        
        if (mallMatch) {
          const [key, mall] = mallMatch;
          matchedMalls.add(key);
          enrichedCarparks.push({
            carpark_number: cpNum,
            address: mall.name,
            lat: mall.lat,
            lng: mall.lng,
            total_lots: totalLots,
            lots_available: lotsAvail,
            lot_type: lotType,
            update_datetime: updateTime,
            car_park_type: `${(mall.agency || "MALL").toUpperCase()} CAR PARK`,
            type_of_parking_system: mall.system + " PARKING SYSTEM",
            short_term_parking: "OPERATING HOURS",
            free_parking: "NO",
            night_parking: "OPERATING HOURS",
            gantry_height: 2.1,
            car_park_basement: "Y",
            agency: (mall.agency as any) || "MALL",
            price_rate: mall.price,
            price_details: mall.price_details,
            is_central: true,
          });
        } else {
          // Not HDB, not a known private site — check URA's official parking
          // places dataset before giving up on this carpark entirely.
          const uraMatch = uraParkingPlacesCache[cpNum];
          if (uraMatch) {
            enrichedCarparks.push({
              carpark_number: cpNum,
              address: uraMatch.name,
              lat: uraMatch.lat,
              lng: uraMatch.lng,
              total_lots: totalLots,
              lots_available: lotsAvail,
              lot_type: lotType,
              update_datetime: updateTime,
              car_park_type: "URA CAR PARK",
              type_of_parking_system: "ELECTRONIC PARKING SYSTEM",
              short_term_parking: "WHOLE DAY",
              free_parking: "NO",
              night_parking: "YES",
              gantry_height: 0.0,
              car_park_basement: "N",
              agency: "URA",
              price_rate: "Rate varies by location — check on-site signage or the URA MyTransport.SG app for current tariff.",
              is_central: false,
            });
          }
        }
      }
    }

    // 3. Append remaining predefined private carparks/malls without real-time LTA feeds
    for (const [key, mall] of Object.entries(MALL_COORDINATES)) {
      if (!matchedMalls.has(key)) {
        const normName = mall.name.toLowerCase().trim();
        const isDuplicate = enrichedCarparks.some(
          (cp) =>
            cp.address.toLowerCase().trim() === normName ||
            distanceMeters(cp.lat, cp.lng, mall.lat, mall.lng) < 25
        );
        if (isDuplicate) continue;

        enrichedCarparks.push({
          carpark_number: `${(mall.agency || "PVT").toUpperCase()}-${key.toUpperCase().replace(/[^A-Z0-9]/g, "-")}`,
          address: mall.name,
          lat: mall.lat,
          lng: mall.lng,
          total_lots: -1,       // Sentinel indicating no live data
          lots_available: -1,   // Sentinel indicating no live data
          lot_type: "C",
          update_datetime: new Date().toISOString(),
          car_park_type: `${(mall.agency || "MALL").toUpperCase()} CAR PARK`,
          type_of_parking_system: mall.system + " PARKING SYSTEM",
          short_term_parking: "OPERATING HOURS",
          free_parking: "NO",
          night_parking: "OPERATING HOURS",
          gantry_height: 2.1,
          car_park_basement: "Y",
          agency: (mall.agency as any) || "MALL",
          price_rate: mall.price,
          price_details: mall.price_details,
          is_central: true,
        });
      }
    }

    // 4. Append supplemental OSM-sourced named parking locations, skipping
    // any that are essentially the same physical carpark as one already
    // included above (within 40m — close enough to be the same site, far
    // enough apart that two genuinely distinct nearby carparks won't
    // accidentally get merged).
    const DEDUPE_RADIUS_METERS = 40;
    for (const [osmKey, osmPlace] of Object.entries(osmParkingCache)) {
      const isDuplicate = enrichedCarparks.some(
        (cp) => distanceMeters(cp.lat, cp.lng, osmPlace.lat, osmPlace.lng) < DEDUPE_RADIUS_METERS
      );
      if (isDuplicate) continue;

      enrichedCarparks.push({
        carpark_number: osmKey,
        address: osmPlace.name,
        lat: osmPlace.lat,
        lng: osmPlace.lng,
        total_lots: -1,      // Sentinel indicating no live data
        lots_available: -1,  // Sentinel indicating no live data
        lot_type: "C",
        update_datetime: new Date().toISOString(),
        car_park_type: "PARKING (COMMUNITY-MAPPED)",
        type_of_parking_system: "UNKNOWN",
        short_term_parking: "UNKNOWN",
        free_parking: "NO",
        night_parking: "UNKNOWN",
        gantry_height: 0.0,
        car_park_basement: "N",
        agency: "OSM",
        // This location comes from OpenStreetMap community mapping, not an
        // official government or verified pricing source — no rate is
        // guessed, and the source is disclosed so the person can judge its
        // reliability themselves.
        price_rate: "Rate not available — sourced from OpenStreetMap community data, not an official pricing source. Check on-site signage.",
        is_central: false,
      });
    }

    res.json(enrichedCarparks);
  } catch (error: any) {
    console.error("Error in /api/carparks:", error);
    // Return empty array or fallback standard set in case of APIs errors
    res.status(500).json({ error: error.message || "Failed to retrieve real-time carpark list" });
  }
});

// Discards results that are too broad to be a useful location for this app —
// e.g. a search for a specific postal code should never resolve to "Singapore"
// the country/city itself (which Nominatim centers near the Padang), since
// that's not a usable navigation destination.
function isOverlyBroadResult(r: any): boolean {
  const broadTypes = new Set(["country", "administrative", "city", "state", "island"]);
  if (r.type && broadTypes.has(r.type)) return true;
  if (r.class === "boundary" || r.class === "place") {
    // "place"/"boundary" results can still be legitimate (e.g. a named
    // neighbourhood), but reject ones with a very low place_rank, which
    // indicates a large administrative area rather than a specific spot.
    const rank = Number(r.place_rank);
    if (!isNaN(rank) && rank <= 12) return true;
  }
  return false;
}

// --- OneMap (Singapore Land Authority) geocoding ---
// OneMap is Singapore's official national map, built directly from
// government address data. It has far better postal-code-level coverage
// for Singapore than OpenStreetMap/Nominatim, so it's tried first below.
// Requires a free account (ONEMAP_EMAIL/ONEMAP_PASSWORD) — if unset, the
// app transparently falls back to Nominatim only, so this is optional.
let oneMapTokenCache: { value: string; expiresAt: number } | null = null;

async function getOneMapToken(): Promise<string | null> {
  const email = process.env.ONEMAP_EMAIL;
  const password = process.env.ONEMAP_PASSWORD;
  if (!email || !password) return null; // Not configured — caller falls back to Nominatim

  const now = Date.now();
  if (oneMapTokenCache && oneMapTokenCache.expiresAt > now + 60_000) {
    return oneMapTokenCache.value;
  }

  try {
    const response = await fetch("https://www.onemap.gov.sg/api/auth/post/getToken", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) {
      console.error("OneMap token request failed with status:", response.status);
      return null;
    }
    const data: any = await response.json();
    if (!data.access_token) return null;

    // Tokens are valid ~3 days; cache until shortly before expiry so we
    // don't re-authenticate on every single geocode request.
    const expiryMs = Number(data.expiry_timestamp) * 1000;
    oneMapTokenCache = {
      value: data.access_token,
      expiresAt: !isNaN(expiryMs) && expiryMs > now ? expiryMs : now + 2.5 * 24 * 60 * 60 * 1000,
    };
    return oneMapTokenCache.value;
  } catch (error) {
    console.error("Error fetching OneMap token:", error);
    return null;
  }
}

interface GeocodeResult {
  name: string;
  lat: number;
  lng: number;
  postal: string;
}

async function searchOneMap(query: string): Promise<GeocodeResult[]> {
  const token = await getOneMapToken();

  try {
    const url = new URL("https://www.onemap.gov.sg/api/common/elastic/search");
    url.searchParams.set("searchVal", query);
    url.searchParams.set("returnGeom", "Y");
    url.searchParams.set("getAddrDetails", "Y");
    url.searchParams.set("pageNum", "1");

    const headers: Record<string, string> = {};
    if (token) {
      headers["Authorization"] = token;
    }

    const response = await fetch(url.toString(), { headers });

    if (response.status === 401 && token) {
      // Token expired/invalid — clear cache and try anonymously
      oneMapTokenCache = null;
      const publicResponse = await fetch(url.toString());
      if (publicResponse.ok) {
        const publicData: any = await publicResponse.json();
        const results: any[] = publicData.results || [];
        return results
          .map((r: any) => ({
            name: r.ADDRESS || [r.BLK_NO, r.ROAD_NAME, r.BUILDING].filter(Boolean).join(" ").trim(),
            lat: parseFloat(r.LATITUDE),
            lng: parseFloat(r.LONGITUDE),
            postal: (r.POSTAL || "").trim(),
          }))
          .filter((r) => r.name && !isNaN(r.lat) && !isNaN(r.lng));
      }
      return [];
    }
    if (!response.ok) {
      console.error("OneMap search failed with status:", response.status);
      return [];
    }

    const data: any = await response.json();
    const results: any[] = data.results || [];

    return results
      .map((r: any) => ({
        name: r.ADDRESS || [r.BLK_NO, r.ROAD_NAME, r.BUILDING].filter(Boolean).join(" ").trim(),
        lat: parseFloat(r.LATITUDE),
        lng: parseFloat(r.LONGITUDE),
        postal: (r.POSTAL || "").trim(),
      }))
      .filter((r) => r.name && !isNaN(r.lat) && !isNaN(r.lng));
  } catch (error) {
    console.error("Error querying OneMap search:", error);
    return [];
  }
}

// GET /api/geocode?q=<free text query, or a 6-digit Singapore postal code>
// Tries local private carpark dictionary first for instant 0ms result,
// then OneMap (SLA's authoritative Singapore address data), then
// falls back to OpenStreetMap Nominatim — proxied server-side either way so
// the browser doesn't need custom headers and Nominatim's ~1 req/sec fair
// use policy is respected from a single process.
let lastNominatimCallAt = 0;
app.get("/api/geocode", async (req, res) => {
  const query = (req.query.q as string || "").trim();
  if (!query) {
    return res.status(400).json({ error: "Query parameter 'q' is required" });
  }

  const queryLower = query.toLowerCase();
  const isPostalCode = /^\d{6}$/.test(query);

  // 0. Direct match against known local carpark / landmark dictionary
  if (PRIVATE_CARPARKS[queryLower]) {
    const match = PRIVATE_CARPARKS[queryLower];
    return res.json([{
      name: match.name,
      lat: match.lat,
      lng: match.lng,
      postal: query,
    }]);
  }

  try {
    // 1. Try OneMap first (SLA's official Singapore address database)
    const oneMapResults = await searchOneMap(query);
    if (oneMapResults.length > 0) {
      // For postal code searches specifically, only trust a result whose
      // own postal field exactly matches — OneMap's elastic search can
      // still return nearby/fuzzy matches for a query it can't resolve
      // precisely, and a "close but wrong" postal code match is worse
      // than an honest "not found".
      const filtered = isPostalCode ? oneMapResults.filter((r) => r.postal === query) : oneMapResults;
      if (filtered.length > 0) {
        return res.json(filtered.slice(0, 5).map(({ name, lat, lng }) => ({ name, lat, lng })));
      }
    }

    // 2. Fall back to Nominatim — either OneMap isn't configured, or it had no match
    const now = Date.now();
    const waitMs = Math.max(0, 1100 - (now - lastNominatimCallAt));
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    lastNominatimCallAt = Date.now();

    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "5");
    url.searchParams.set("countrycodes", "sg");
    url.searchParams.set("addressdetails", "1");

    // Singapore postal codes are exactly 6 digits. Nominatim's free-text
    // search resolves these poorly/inconsistently, so route bare postal
    // codes through the structured `postalcode` param instead, which is
    // far more reliable for this specific case.
    if (isPostalCode) {
      url.searchParams.set("postalcode", query);
      url.searchParams.set("country", "Singapore");
    } else {
      url.searchParams.set("q", query);
      // Bias/clip free-text results to Singapore's bounding box
      url.searchParams.set("viewbox", "103.55,1.50,104.15,1.15");
      url.searchParams.set("bounded", "1");
    }

    const response = await fetch(url.toString(), {
      headers: {
        // Nominatim's usage policy requires a descriptive User-Agent or Referer
        "User-Agent": `sg-cheap-carpark/1.0 (${process.env.APP_URL || "https://github.com/ziahmed/sg_cheap_carpark"})`,
      },
    });

    if (!response.ok) {
      throw new Error(`Nominatim returned status ${response.status}`);
    }

    let results: any[] = await response.json();

    if (isPostalCode) {
      // Singapore postal codes are precise to an individual building, so a
      // "close but not exact" match is not a trustworthy substitute — if
      // nothing has this exact postcode, report no results rather than
      // guessing (this is what previously caused searches to silently land
      // on the wrong place, including Singapore's own country-level entry).
      results = results.filter((r) => r.address?.postcode === query);
    } else {
      // Free-text address/landmark searches also shouldn't resolve to the
      // whole country as a "match".
      results = results.filter((r) => !isOverlyBroadResult(r));
    }

    res.json(
      results.map((r) => ({
        name: r.display_name as string,
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon),
      }))
    );
  } catch (error: any) {
    console.error("Error in /api/geocode:", error);
    res.status(502).json({ error: "Address search is temporarily unavailable. Please try a listed landmark instead." });
  }
});

// GET /api/route?originLat=&originLng=&destLat=&destLng=
// Proxies OpenRouteService (free tier, requires ORS_API_KEY) for a driving
// route as GeoJSON, with a graceful fallback to the public OSRM demo server
// if no ORS key is configured (handy for local dev, not recommended for prod).
app.get("/api/route", async (req, res) => {
  const originLat = parseFloat(req.query.originLat as string);
  const originLng = parseFloat(req.query.originLng as string);
  const destLat = parseFloat(req.query.destLat as string);
  const destLng = parseFloat(req.query.destLng as string);

  if ([originLat, originLng, destLat, destLng].some((v) => isNaN(v))) {
    return res.status(400).json({ error: "originLat, originLng, destLat, destLng are all required" });
  }

  try {
    if (process.env.ORS_API_KEY) {
      const orsResponse = await fetch("https://api.openrouteservice.org/v2/directions/driving-car/geojson", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: process.env.ORS_API_KEY,
        },
        body: JSON.stringify({
          coordinates: [
            [originLng, originLat],
            [destLng, destLat],
          ],
        }),
      });

      if (!orsResponse.ok) {
        throw new Error(`OpenRouteService returned status ${orsResponse.status}`);
      }

      const data: any = await orsResponse.json();
      const feature = data.features?.[0];
      if (!feature) throw new Error("OpenRouteService returned no route");

      const summary = feature.properties?.summary || {};
      return res.json({
        geometry: feature.geometry, // GeoJSON LineString
        distanceMeters: summary.distance || 0,
        durationSeconds: summary.duration || 0,
        provider: "openrouteservice",
      });
    }

    // Fallback: public OSRM demo server (no key needed, not for heavy production use)
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${originLng},${originLat};${destLng},${destLat}?overview=full&geometries=geojson`;
    const osrmResponse = await fetch(osrmUrl);
    if (!osrmResponse.ok) {
      throw new Error(`OSRM demo server returned status ${osrmResponse.status}`);
    }
    const osrmData: any = await osrmResponse.json();
    const route = osrmData.routes?.[0];
    if (!route) throw new Error("OSRM returned no route");

    res.json({
      geometry: route.geometry,
      distanceMeters: route.distance || 0,
      durationSeconds: route.duration || 0,
      provider: "osrm-demo",
    });
  } catch (error: any) {
    console.error("Error in /api/route:", error);
    res.status(502).json({ error: "Driving directions are temporarily unavailable." });
  }
});

// POST /api/parking-assistant (Gemini-powered recommendation)
app.post("/api/parking-assistant", async (req, res) => {
  const { destination, carparks, query } = req.body;

  if (!destination) {
    return res.status(400).json({ error: "Destination name or location is required" });
  }

  try {
    // Format carpark list for Gemini context
    const sortedCarparks = carparks
      ?.sort((a: Carpark, b: Carpark) => (a.distance_meters || 0) - (b.distance_meters || 0))
      ?.slice(0, 5) || [];

    let carparkDetailsContext = "No nearby carparks found in context.";
    if (sortedCarparks.length > 0) {
      carparkDetailsContext = sortedCarparks
        .map((cp: Carpark, idx: number) => {
          const distanceStr = cp.distance_meters ? `${cp.distance_meters.toFixed(0)}m` : "unknown distance";
          const hasLive = cp.total_lots > 0 && cp.lots_available >= 0;
          const availabilityStr = hasLive
            ? `${cp.lots_available} / ${cp.total_lots} (${Math.round((cp.lots_available / cp.total_lots) * 100) || 0}% available)`
            : "Live availability data currently unavailable (Rates Only)";
          
          return `[${idx + 1}] ${cp.address} (${cp.carpark_number})
  - Distance from destination: ${distanceStr}
  - Available Lots: ${availabilityStr}
  - Parking System: ${cp.type_of_parking_system}
  - Agency: ${cp.agency}
  - Pricing: ${cp.price_rate}
  - Free Parking: ${cp.free_parking}
  - Night Parking: ${cp.night_parking}
  - Height Limit: ${cp.gantry_height ? `${cp.gantry_height}m` : 'No limit'}`;
        })
        .join("\n\n");
    }

    const systemInstruction = `You are the Singapore SG Carpark Finder Smart Assistant.
Your goal is to help a car driver pick the absolute best, most cost-effective, and closest parking spot near their target destination.
Analyze the provided nearby parking options based on:
1. Distance (closer is more convenient).
2. Availability / Occupancy rate (avoid lots with 0 or very few available lots. Note that some places like shopping malls do not provide live occupancy data; for these "Live availability data currently unavailable" is shown. Advise drivers based on rates, distance, and convenience, and mention that live occupancy is not tracked for these malls).
3. Price (HDB non-central is $0.60/30m, which is very cheap compared to malls).
4. Height limits and free parking windows.

Provide a friendly, concise, and professional recommendation.
Structure your answer like this:
1. **Top Recommendation**: State which number is best and why (e.g. cheapest, or best balance of availability & distance).
2. **Alternative Option**: Offer a backup option in case it gets full or lacks tracking.
3. **Driver Tips**: Highlight things like height limit, free parking hours, or walking routes.
Be highly practical and write in a helpful driver-centric tone. Keep it to 150-200 words.`;

    const prompt = `User's requested destination: "${destination}"
User's specific query (if any): "${query || 'Help me find the best parking lot near this area'}"

List of top 5 closest available carparks to destination:
${carparkDetailsContext}

Please advise me where I should park.`;

    // Resilient multi-model retry strategy to handle temporary 503 high demand
    const modelsToTry = ["gemini-3.1-flash-lite", "gemini-3.5-flash"];
    let responseText = "";
    let lastError: any = null;

    for (const modelName of modelsToTry) {
      try {
        console.log(`[Assistant] Attempting generation using model: ${modelName}`);
        const response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            systemInstruction,
            temperature: 0.7,
          },
        });
        if (response && response.text) {
          console.log(`[Assistant] Successfully generated response using model: ${modelName}`);
          responseText = response.text;
          break;
        }
      } catch (err: any) {
        console.warn(`[Assistant] Model ${modelName} failed:`, err.message || err);
        lastError = err;
      }
    }

    if (!responseText) {
      throw lastError || new Error("Failed to generate content with any Gemini model.");
    }

    res.json({ recommendation: responseText });
  } catch (error: any) {
    console.error("Gemini Assistant error:", error);
    res.status(500).json({ 
      error: "Assistant is currently resting. Please try again soon.",
      details: error.message || error.toString()
    });
  }
});

// Vite & Static file serving

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
