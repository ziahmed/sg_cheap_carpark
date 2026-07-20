import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { SVY21 } from "./src/utils/svy21.ts";
import { Carpark } from "./src/types.ts";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

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

// In-memory cache for HDB carpark static metadata
let hdbCarparkMetadataCache: Record<string, any> = {};
let cacheLoaded = false;

// Predefined coordinates and info for popular shopping malls and non-HDB locations returned by LTA
const MALL_COORDINATES: Record<string, { lat: number; lng: number; name: string; price: string; system: string }> = {
  "vivocity": { lat: 1.2646, lng: 103.8207, name: "VivoCity", price: "$1.40 1st hr, $0.70/30m after", system: "Electronic" },
  "suntec city": { lat: 1.2935, lng: 103.8572, name: "Suntec City Mall", price: "$2.20/hr (Mon-Fri Day), $2.40/entry after 5pm", system: "Electronic" },
  "marina bay sands": { lat: 1.2828, lng: 103.8590, name: "Marina Bay Sands", price: "$9.00 1st hr, $1.10/30m after (Capped $32/day)", system: "Electronic" },
  "ion orchard": { lat: 1.3040, lng: 103.8318, name: "ION Orchard", price: "$2.56 1st hr, $1.88/hr after (Mon-Fri)", system: "Electronic" },
  "plaza singapura": { lat: 1.3007, lng: 103.8447, name: "Plaza Singapura", price: "$1.95 1st hr, $0.55/15m after (Mon-Fri 12am-6pm)", system: "Electronic" },
  "ngee ann city": { lat: 1.3023, lng: 103.8348, name: "Ngee Ann City / Takashimaya", price: "$1.82 per 30 mins (Mon-Fri 12am-12pm)", system: "Electronic" },
  "bugis junction": { lat: 1.3002, lng: 103.8561, name: "Bugis Junction", price: "$1.95 1st hr, $0.55/15m after (Mon-Fri 12am-5pm)", system: "Electronic" },
  "raffles city": { lat: 1.2941, lng: 103.8525, name: "Raffles City Shopping Centre", price: "$2.20 1st hr, $0.55/15m after", system: "Electronic" },
  "wisma atria": { lat: 1.3036, lng: 103.8331, name: "Wisma Atria", price: "$2.50 1st hr, $1.50/30m after (Mon-Fri)", system: "Electronic" },
  "tampines mall": { lat: 1.3527, lng: 103.9452, name: "Tampines Mall", price: "$1.80 1st hr, $0.50/15m after", system: "Electronic" },
  "jurong point": { lat: 1.3396, lng: 103.7067, name: "Jurong Point", price: "$1.31/hr (7am-10pm), Free Parking (12pm-2pm Mon-Thu)", system: "Electronic" },
  "nex": { lat: 1.3506, lng: 103.8728, name: "NEX Mall", price: "$1.60 1st hr, $0.50/15m after (Mon-Fri Day)", system: "Electronic" },
  "orchard central": { lat: 1.3008, lng: 103.8396, name: "Orchard Central", price: "$2.60 1st hr, $1.80/hr after", system: "Electronic" },
  "313@somerset": { lat: 1.3013, lng: 103.8383, name: "313@Somerset", price: "$2.40 1st hr, $1.60/hr after", system: "Electronic" },
  "orchard point": { lat: 1.3014, lng: 103.8402, name: "Orchard Point", price: "$2.35 1st hr, $1.50/30m after", system: "Electronic" },
  "harbourfront centre": { lat: 1.2642, lng: 103.8215, name: "HarbourFront Centre", price: "$1.60/hr (Mon-Fri 7am-6pm)", system: "Electronic" },
};

// Start background task to fetch and compile Singapore's carpark metadata
async function loadCarparkMetadata() {
  try {
    console.log("Loading Singapore carpark static database from GitHub...");
    const response = await fetch(
      "https://raw.githubusercontent.com/MarkFull/sg-parking/master/data/raw/hdb.json"
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
  } catch (error) {
    console.error("Failed to load Singapore carpark metadata: ", error);
    console.log("Falling back to local generated HDB database for basic services.");
  }
}

loadCarparkMetadata();

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
  res.json({ status: "ok", cacheLoaded });
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
          enrichedCarparks.push({
            carpark_number: cpNum,
            address: mall.name,
            lat: mall.lat,
            lng: mall.lng,
            total_lots: totalLots,
            lots_available: lotsAvail,
            lot_type: lotType,
            update_datetime: updateTime,
            car_park_type: "MALL CAR PARK",
            type_of_parking_system: mall.system + " PARKING SYSTEM",
            short_term_parking: "MALL HOURS",
            free_parking: "NO",
            night_parking: "MALL HOURS",
            gantry_height: 2.1,
            car_park_basement: "Y",
            agency: "MALL",
            price_rate: mall.price,
            is_central: true,
          });
        }
      }
    }

    res.json(enrichedCarparks);
  } catch (error: any) {
    console.error("Error in /api/carparks:", error);
    // Return empty array or fallback standard set in case of APIs errors
    res.status(500).json({ error: error.message || "Failed to retrieve real-time carpark list" });
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
          return `[${idx + 1}] ${cp.address} (${cp.carpark_number})
  - Distance from destination: ${distanceStr}
  - Available Lots: ${cp.lots_available} / ${cp.total_lots} (${Math.round((cp.lots_available / cp.total_lots) * 100) || 0}% available)
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
2. Availability / Occupancy rate (avoid lots with 0 or very few available lots).
3. Price (HDB non-central is $0.60/30m, which is very cheap compared to malls).
4. Height limits and free parking windows.

Provide a friendly, concise, and professional recommendation.
Structure your answer like this:
1. **Top Recommendation**: State which number is best and why (e.g. cheapest, or best balance of availability & distance).
2. **Alternative Option**: Offer a backup option in case it gets full.
3. **Driver Tips**: Highlight things like height limit, free parking hours, or walking routes.
Be highly practical and write in a helpful driver-centric tone. Keep it to 150-200 words.`;

    const prompt = `User's requested destination: "${destination}"
User's specific query (if any): "${query || 'Help me find the best parking lot near this area'}"

List of top 5 closest available carparks to destination:
${carparkDetailsContext}

Please advise me where I should park.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.7,
      },
    });

    res.json({ recommendation: response.text });
  } catch (error: any) {
    console.error("Gemini Assistant error:", error);
    res.status(500).json({ error: "Assistant is currently resting. Please try again soon." });
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
