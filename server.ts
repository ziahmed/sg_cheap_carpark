import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { SVY21 } from "./src/utils/svy21.ts";
import { Carpark } from "./src/types.ts";
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

// In-memory cache for HDB carpark static metadata
let hdbCarparkMetadataCache: Record<string, any> = {};
let cacheLoaded = false;

// Predefined coordinates and info for popular shopping malls and non-HDB locations returned by LTA
const MALL_COORDINATES: Record<
  string,
  {
    lat: number;
    lng: number;
    name: string;
    price: string;
    system: string;
    price_details?: {
      weekday_day?: string;
      weekday_night?: string;
      weekend_day?: string;
      weekend_night?: string;
    };
  }
> = {
  "vivocity": {
    lat: 1.2646,
    lng: 103.8207,
    name: "VivoCity",
    price: "Mon-Fri (7am-6pm): $1.40 1st hr, $0.70/30m after; (6pm-4am): $3.00/entry. Sat-Sun/PH: $1.60 1st hr, $0.80/30m after.",
    system: "Electronic",
    price_details: {
      weekday_day: "$1.40 1st hr, then $0.70 per 30 mins",
      weekday_night: "$3.00 per entry",
      weekend_day: "$1.60 1st hr, then $0.80 per 30 mins",
      weekend_night: "$1.60 1st hr, then $0.80 per 30 mins (until 6pm, then $3.00/entry)",
    },
  },
  "suntec city": {
    lat: 1.2935,
    lng: 103.8572,
    name: "Suntec City Mall",
    price: "Mon-Fri (7am-5pm): $2.20/hr. Weekdays (5pm-7am): $2.40/entry. Sat-Sun/PH (7am-7am): $2.40/entry (for first 4 hrs, then $1.10/hr).",
    system: "Electronic",
    price_details: {
      weekday_day: "$2.20 per hour",
      weekday_night: "$2.40 per entry",
      weekend_day: "$2.40 per entry (for first 4 hrs, then $1.10/hr)",
      weekend_night: "$2.40 per entry (for first 4 hrs, then $1.10/hr)",
    },
  },
  "marina bay sands": {
    lat: 1.2828,
    lng: 103.8590,
    name: "Marina Bay Sands",
    price: "Mon-Thu (7am-5pm): $9.00 1st hr, $1.10/30m after. (5pm-7am): $9.00/entry. Fri-Sun/PH: $12.00 1st hr, $1.50/30m after.",
    system: "Electronic",
    price_details: {
      weekday_day: "$9.00 1st hr, then $1.10 per 30 mins",
      weekday_night: "$9.00 per entry (flat rate after 5pm)",
      weekend_day: "$12.00 1st hr, then $1.50 per 30 mins",
      weekend_night: "$12.00 1st hr, then $1.50 per 30 mins (until 5pm, then $12.00/entry)",
    },
  },
  "ion orchard": {
    lat: 1.3040,
    lng: 103.8318,
    name: "ION Orchard",
    price: "Mon-Thu (8am-5pm): $2.68 1st hr, $1.28/30m after; (5pm-12am): $3.00/entry. Fri-Sun/PH (8am-5pm): $3.21 1st hr, $1.60/30m after; (5pm-12am): $3.74/entry.",
    system: "Electronic",
    price_details: {
      weekday_day: "$2.68 1st hr, then $1.28 per 30 mins",
      weekday_night: "$3.00 per entry (after 5pm)",
      weekend_day: "$3.21 1st hr, then $1.60 per 30 mins",
      weekend_night: "$3.74 per entry (after 5pm)",
    },
  },
  "plaza singapura": {
    lat: 1.3007,
    lng: 103.8447,
    name: "Plaza Singapura",
    price: "Mon-Fri (12am-6pm): $1.95 1st hr, $0.55/15m after. (6pm-12am): $3.25/entry. Sat-Sun/PH (all day): $3.25 for 1st 2 hrs, $0.55/15m after.",
    system: "Electronic",
    price_details: {
      weekday_day: "$1.95 1st hr, then $0.55 per 15 mins",
      weekday_night: "$3.25 per entry",
      weekend_day: "$3.25 for 1st 2 hrs, then $0.55 per 15 mins",
      weekend_night: "$3.25 for 1st 2 hrs, then $0.55 per 15 mins",
    },
  },
  "ngee ann city": {
    lat: 1.3023,
    lng: 103.8348,
    name: "Ngee Ann City / Takashimaya",
    price: "Mon-Fri (12am-12pm): $1.82/30m; (12pm-5pm): $2.57/30m; (5pm-12am): $3.64/entry. Sat-Sun/PH (12am-5pm): $2.57/30m; (5pm-12am): $3.64/entry.",
    system: "Electronic",
    price_details: {
      weekday_day: "$1.82 per 30 mins (until 12pm, then $2.57 per 30 mins)",
      weekday_night: "$3.64 per entry (after 5pm)",
      weekend_day: "$2.57 per 30 mins",
      weekend_night: "$3.64 per entry (after 5pm)",
    },
  },
  "bugis junction": {
    lat: 1.3002,
    lng: 103.8561,
    name: "Bugis Junction",
    price: "Mon-Fri (8am-6pm): $2.20 1st hr, $0.60/15m after; (6pm-8am): $3.30/entry. Sat-Sun/PH: $3.30 for 1st 2 hrs, $0.60/15m after.",
    system: "Electronic",
    price_details: {
      weekday_day: "$2.20 1st hr, then $0.60 per 15 mins",
      weekday_night: "$3.30 per entry",
      weekend_day: "$3.30 for 1st 2 hrs, then $0.60 per 15 mins",
      weekend_night: "$3.30 for 1st 2 hrs, then $0.60 per 15 mins",
    },
  },
  "raffles city": {
    lat: 1.2941,
    lng: 103.8525,
    name: "Raffles City Shopping Centre",
    price: "Mon-Fri (8am-6pm): $2.20 1st hr, $0.55/15m after; (6pm-8am): $3.30/entry. Sat-Sun/PH (all day): $2.40 for 1st 2 hrs, $0.60/15m after.",
    system: "Electronic",
    price_details: {
      weekday_day: "$2.20 1st hr, then $0.55 per 15 mins",
      weekday_night: "$3.30 per entry",
      weekend_day: "$2.40 for 1st 2 hrs, then $0.60 per 15 mins",
      weekend_night: "$2.40 for 1st 2 hrs, then $0.60 per 15 mins",
    },
  },
  "wisma atria": {
    lat: 1.3036,
    lng: 103.8331,
    name: "Wisma Atria",
    price: "Mon-Fri (12am-5pm): $2.50 1st hr, $1.50/30m after; (5pm-12am): $3.50/entry. Sat-Sun/PH (12am-5pm): $3.00 1st hr, $1.80/30m after; (5pm-12am): $3.50/entry.",
    system: "Electronic",
    price_details: {
      weekday_day: "$2.50 1st hr, then $1.50 per 30 mins",
      weekday_night: "$3.50 per entry (after 5pm)",
      weekend_day: "$3.00 1st hr, then $1.80 per 30 mins",
      weekend_night: "$3.50 per entry (after 5pm)",
    },
  },
  "tampines mall": {
    lat: 1.3527,
    lng: 103.9452,
    name: "Tampines Mall",
    price: "Mon-Fri (6am-6pm): $1.80 1st hr, $0.50/15m after; (6pm-6am): $2.40/entry. Sat-Sun/PH: $2.00 1st hr, $0.60/15m after.",
    system: "Electronic",
    price_details: {
      weekday_day: "$1.80 1st hr, then $0.50 per 15 mins",
      weekday_night: "$2.40 per entry",
      weekend_day: "$2.00 1st hr, then $0.60 per 15 mins",
      weekend_night: "$2.00 1st hr, then $0.60 per 15 mins",
    },
  },
  "jurong point": {
    lat: 1.3396,
    lng: 103.7067,
    name: "Jurong Point",
    price: "Mon-Fri: $1.31/hr (7am-10pm); Free Parking 12pm-2pm Mon-Thu. Flat $1.50/entry after 10pm. Sat-Sun/PH: $1.50/hr for 1st 2 hrs, $1.00/hr after.",
    system: "Electronic",
    price_details: {
      weekday_day: "$1.31 per hr (Free 12pm-2pm Mon-Thu)",
      weekday_night: "$1.50 per entry (after 10pm)",
      weekend_day: "$1.50 per hr for 1st 2 hrs, then $1.00 per hr",
      weekend_night: "$1.50 per hr for 1st 2 hrs, then $1.00 per hr",
    },
  },
  "nex": {
    lat: 1.3506,
    lng: 103.8728,
    name: "NEX Mall",
    price: "Mon-Fri (7am-5pm): $1.60 1st hr, $0.50/15m after; (5pm-7am): $2.50/entry. Sat-Sun/PH (all day): $1.80 1st hr, $0.60/15m after.",
    system: "Electronic",
    price_details: {
      weekday_day: "$1.60 1st hr, then $0.50 per 15 mins",
      weekday_night: "$2.50 per entry",
      weekend_day: "$1.80 1st hr, then $0.60 per 15 mins",
      weekend_night: "$1.80 1st hr, then $0.60 per 15 mins",
    },
  },
  "orchard central": {
    lat: 1.3008,
    lng: 103.8396,
    name: "Orchard Central",
    price: "Mon-Fri (12am-6pm): $2.60 1st hr, $1.80/hr after; (6pm-12am): $3.50/entry. Sat-Sun/PH: $3.50 for 1st 2 hrs, $2.00/hr after.",
    system: "Electronic",
    price_details: {
      weekday_day: "$2.60 1st hr, then $1.80 per hour",
      weekday_night: "$3.50 per entry",
      weekend_day: "$3.50 for 1st 2 hrs, then $2.00 per hour",
      weekend_night: "$3.50 for 1st 2 hrs, then $2.00 per hour",
    },
  },
  "313@somerset": {
    lat: 1.3013,
    lng: 103.8383,
    name: "313@Somerset",
    price: "Mon-Fri (12am-6pm): $2.40 1st hr, $1.60/hr after; (6pm-12am): $3.20/entry. Sat-Sun/PH: $3.20 for 1st 2 hrs, $1.80/hr after.",
    system: "Electronic",
    price_details: {
      weekday_day: "$2.40 1st hr, then $1.60 per hour",
      weekday_night: "$3.20 per entry",
      weekend_day: "$3.20 for 1st 2 hrs, then $1.80 per hour",
      weekend_night: "$3.20 for 1st 2 hrs, then $1.80 per hour",
    },
  },
  "orchard point": {
    lat: 1.3014,
    lng: 103.8402,
    name: "Orchard Point",
    price: "Mon-Fri (12am-6pm): $2.35 1st hr, $1.50/30m after; (6pm-12am): $3.50/entry. Sat-Sun/PH: $2.50 1st hr, $1.80/30m after.",
    system: "Electronic",
    price_details: {
      weekday_day: "$2.35 1st hr, then $1.50 per 30 mins",
      weekday_night: "$3.50 per entry",
      weekend_day: "$2.50 1st hr, then $1.80 per 30 mins",
      weekend_night: "$2.50 1st hr, then $1.80 per 30 mins",
    },
  },
  "harbourfront centre": {
    lat: 1.2642,
    lng: 103.8215,
    name: "HarbourFront Centre",
    price: "Mon-Fri (7am-6pm): $1.60/hr; (6pm-7am): $2.50/entry. Sat-Sun/PH (7am-6pm): $1.80/hr; (6pm-7am): $3.00/entry.",
    system: "Electronic",
    price_details: {
      weekday_day: "$1.60 per hour",
      weekday_night: "$2.50 per entry",
      weekend_day: "$1.80 per hour",
      weekend_night: "$3.00 per entry",
    },
  },
  "paragon": {
    lat: 1.3036,
    lng: 103.8351,
    name: "Paragon Shopping Centre",
    price: "Mon-Sat (3am-5pm): $2.90 for 1st hr, $1.50/30m after; (5pm-3am): $3.30/entry. Sun/PH (all day): $3.30 for 1st hr, $1.50/30m after.",
    system: "Electronic",
    price_details: {
      weekday_day: "$2.90 1st hr, then $1.50 per 30 mins",
      weekday_night: "$3.30 per entry",
      weekend_day: "$3.30 1st hr, then $1.50 per 30 mins",
      weekend_night: "$3.30 per entry (after 5pm)",
    },
  },
  "jewel changi": {
    lat: 1.3602,
    lng: 103.9898,
    name: "Jewel Changi Airport",
    price: "Daily: $0.04/min ($2.40/hr) for general slots; B2M premium slots are $0.06/min for 1st 90 mins, then $5.00/hr.",
    system: "Electronic",
    price_details: {
      weekday_day: "$2.40 per hour ($0.04/min)",
      weekday_night: "$2.40 per hour ($0.04/min)",
      weekend_day: "$2.40 per hour ($0.04/min)",
      weekend_night: "$2.40 per hour ($0.04/min)",
    },
  },
  "funan": {
    lat: 1.2914,
    lng: 103.8500,
    name: "Funan Mall",
    price: "Mon-Fri (12am-6pm): $2.20 1st hr, $0.60/15m after; (6pm-12am): $3.00/entry. Sat-Sun/PH: $2.50 1st hr, $0.70/15m after.",
    system: "Electronic",
    price_details: {
      weekday_day: "$2.20 1st hr, then $0.60 per 15 mins",
      weekday_night: "$3.00 per entry",
      weekend_day: "$2.50 1st hr, then $0.70 per 15 mins",
      weekend_night: "$2.50 1st hr, then $0.70 per 15 mins",
    },
  },
  "marina square": {
    lat: 1.2913,
    lng: 103.8585,
    name: "Marina Square",
    price: "Mon-Fri (7am-5pm): $2.40 per hour; (5pm-7am): $2.40/entry. Sat-Sun/PH (7am-2am): $2.40 per hour for 1st 2 hrs, then $1.20 per 30 mins.",
    system: "Electronic",
    price_details: {
      weekday_day: "$2.40 per hour",
      weekday_night: "$2.40 per entry",
      weekend_day: "$2.40 per hr for 1st 2 hrs, then $1.20 per 30 mins",
      weekend_night: "$2.40 per hr for 1st 2 hrs, then $1.20 per 30 mins",
    },
  },
  "millenia walk": {
    lat: 1.2925,
    lng: 103.8598,
    name: "Millenia Walk",
    price: "Mon-Fri (7am-6pm): $2.20 1st hr, $0.55/15m after; (6pm-7am): $2.20/entry. Sat-Sun/PH: $2.20 for first 2 hrs, then $0.55 per 15 mins.",
    system: "Electronic",
    price_details: {
      weekday_day: "$2.20 1st hr, then $0.55 per 15 mins",
      weekday_night: "$2.20 per entry",
      weekend_day: "$2.20 for 1st 2 hrs, then $0.55 per 15 mins",
      weekend_night: "$2.20 for 1st 2 hrs, then $0.55 per 15 mins",
    },
  },
  "clarke quay central": {
    lat: 1.2891,
    lng: 103.8465,
    name: "Clarke Quay Central",
    price: "Mon-Fri (6am-6pm): $2.50/hr; (6pm-6am): $3.50/entry. Sat-Sun/PH: $2.50 per hour for 1st 2 hrs, then $1.50 per hour after.",
    system: "Electronic",
    price_details: {
      weekday_day: "$2.50 per hour",
      weekday_night: "$3.50 per entry",
      weekend_day: "$2.50 per hr for 1st 2 hrs, then $1.50 per hour",
      weekend_night: "$2.50 per hr for 1st 2 hrs, then $1.50 per hour",
    },
  },
  "great world city": {
    lat: 1.2932,
    lng: 103.8320,
    name: "Great World City",
    price: "Mon-Fri (8am-5pm): $1.85 1st hr, $0.45/15m after; (5pm-8am): $3.00/entry. Sat-Sun/PH: $2.20 1st hr, $0.50/15m after.",
    system: "Electronic",
    price_details: {
      weekday_day: "$1.85 1st hr, then $0.45 per 15 mins",
      weekday_night: "$3.00 per entry",
      weekend_day: "$2.20 1st hr, then $0.50 per 15 mins",
      weekend_night: "$2.20 1st hr, then $0.50 per 15 mins",
    },
  },
  "parkway parade": {
    lat: 1.3015,
    lng: 103.9052,
    name: "Parkway Parade",
    price: "Mon-Fri (8am-6pm): $1.80 1st hr, $0.55/15m after; (6pm-8am): $2.50/entry. Sat-Sun/PH: $2.00 1st hr, $0.60/15m after.",
    system: "Electronic",
    price_details: {
      weekday_day: "$1.80 1st hr, then $0.55 per 15 mins",
      weekday_night: "$2.50 per entry",
      weekend_day: "$2.00 1st hr, then $0.60 per 15 mins",
      weekend_night: "$2.00 1st hr, then $0.60 per 15 mins",
    },
  },
  "waterway point": {
    lat: 1.3612,
    lng: 103.9019,
    name: "Waterway Point",
    price: "Mon-Fri (6am-6pm): $1.40 1st hr, $0.70/30m after; (6pm-6am): $2.00/entry. Sat-Sun/PH: $1.60 1st hr, $0.80/30m after.",
    system: "Electronic",
    price_details: {
      weekday_day: "$1.40 1st hr, then $0.70 per 30 mins",
      weekday_night: "$2.00 per entry",
      weekend_day: "$1.60 1st hr, then $0.80 per 30 mins",
      weekend_night: "$1.60 1st hr, then $0.80 per 30 mins",
    },
  },
  "novena square": {
    lat: 1.3202,
    lng: 103.8439,
    name: "Velocity @ Novena Square",
    price: "Mon-Fri (6am-6pm): $1.80 1st hr, $0.60/20m after; (6pm-6am): $2.50/entry. Sat-Sun/PH: $2.00 1st hr, $0.70/20m after.",
    system: "Electronic",
    price_details: {
      weekday_day: "$1.80 1st hr, then $0.60 per 20 mins",
      weekday_night: "$2.50 per entry",
      weekend_day: "$2.00 1st hr, then $0.70 per 20 mins",
      weekend_night: "$2.00 1st hr, then $0.70 per 20 mins",
    },
  },
  "city square mall": {
    lat: 1.3113,
    lng: 103.8566,
    name: "City Square Mall",
    price: "Mon-Fri (6am-6pm): $1.80 1st hr, $0.60/20m after; (6pm-6am): $3.00/entry. Sat-Sun/PH: $2.00 1st hr, $0.70/20m after.",
    system: "Electronic",
    price_details: {
      weekday_day: "$1.80 1st hr, then $0.60 per 20 mins",
      weekday_night: "$3.00 per entry",
      weekend_day: "$2.00 1st hr, then $0.70 per 20 mins",
      weekend_night: "$2.00 1st hr, then $0.70 per 20 mins",
    },
  },
  "mustafa centre": {
    lat: 1.3096,
    lng: 103.8558,
    name: "Mustafa Centre",
    price: "Daily: 1st hr FREE, then $2.00 per hour or part thereof. Highly convenient for overnight shopping.",
    system: "Electronic",
    price_details: {
      weekday_day: "1st hr FREE, then $2.00 per hour",
      weekday_night: "1st hr FREE, then $2.00 per hour",
      weekend_day: "1st hr FREE, then $2.00 per hour",
      weekend_night: "1st hr FREE, then $2.00 per hour",
    },
  },
  "chinatown point": {
    lat: 1.2848,
    lng: 103.8433,
    name: "Chinatown Point",
    price: "Mon-Fri (7am-5pm): $2.20 1st hr, $0.80/30m after; (5pm-7am): $3.00/entry. Sat-Sun/PH: $2.50 1st hr, $1.00/30m after.",
    system: "Electronic",
    price_details: {
      weekday_day: "$2.20 1st hr, then $0.80 per 30 mins",
      weekday_night: "$3.00 per entry",
      weekend_day: "$2.50 1st hr, then $1.00 per 30 mins",
      weekend_night: "$2.50 1st hr, then $1.00 per 30 mins",
    },
  },
  "bugis+": {
    lat: 1.3011,
    lng: 103.8562,
    name: "Bugis+ Mall",
    price: "Mon-Fri (12am-5pm): $1.95 1st hr, $0.55/15m after; (5pm-12am): $3.00/entry. Sat-Sun/PH: $3.00 for first 2 hrs, then $0.55 per 15 mins.",
    system: "Electronic",
    price_details: {
      weekday_day: "$1.95 1st hr, then $0.55 per 15 mins",
      weekday_night: "$3.00 per entry",
      weekend_day: "$3.00 for 1st 2 hrs, then $0.55 per 15 mins",
      weekend_night: "$3.00 for 1st 2 hrs, then $0.55 per 15 mins",
    },
  },
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
            car_park_type: "MALL CAR PARK",
            type_of_parking_system: mall.system + " PARKING SYSTEM",
            short_term_parking: "MALL HOURS",
            free_parking: "NO",
            night_parking: "MALL HOURS",
            gantry_height: 2.1,
            car_park_basement: "Y",
            agency: "MALL",
            price_rate: mall.price,
            price_details: mall.price_details,
            is_central: true,
          });
        }
      }
    }

    // 3. Append remaining predefined malls without real-time data
    for (const [key, mall] of Object.entries(MALL_COORDINATES)) {
      if (!matchedMalls.has(key)) {
        enrichedCarparks.push({
          carpark_number: `MALL-${key.toUpperCase().replace(/\s+/g, "-")}`,
          address: mall.name,
          lat: mall.lat,
          lng: mall.lng,
          total_lots: -1,       // Sentinel indicating no live data
          lots_available: -1,   // Sentinel indicating no live data
          lot_type: "C",
          update_datetime: new Date().toISOString(),
          car_park_type: "MALL CAR PARK",
          type_of_parking_system: mall.system + " PARKING SYSTEM",
          short_term_parking: "MALL HOURS",
          free_parking: "NO",
          night_parking: "MALL HOURS",
          gantry_height: 2.1,
          car_park_basement: "Y",
          agency: "MALL",
          price_rate: mall.price,
          price_details: mall.price_details,
          is_central: true,
        });
      }
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

// GET /api/geocode?q=<free text query, or a 6-digit Singapore postal code>
// Proxies OpenStreetMap Nominatim so the browser doesn't need to set a custom
// User-Agent (which browsers block) and so we can respect Nominatim's usage
// policy (max ~1 req/sec, identify the app) from a single server process.
let lastNominatimCallAt = 0;
app.get("/api/geocode", async (req, res) => {
  const query = (req.query.q as string || "").trim();
  if (!query) {
    return res.status(400).json({ error: "Query parameter 'q' is required" });
  }

  // Simple in-process throttle to stay within Nominatim's fair-use policy
  const now = Date.now();
  const waitMs = Math.max(0, 1100 - (now - lastNominatimCallAt));
  if (waitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  lastNominatimCallAt = Date.now();

  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "5");
    url.searchParams.set("countrycodes", "sg");
    url.searchParams.set("addressdetails", "1");

    // Singapore postal codes are exactly 6 digits. Nominatim's free-text
    // search resolves these poorly/inconsistently, so route bare postal
    // codes through the structured `postalcode` param instead, which is
    // far more reliable for this specific case.
    const isPostalCode = /^\d{6}$/.test(query);
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
      // For an exact postal code search, only trust results whose own
      // postcode field actually matches what was typed — otherwise a
      // "closest guess" match (or, worse, the whole country) can slip
      // through as if it were the real address.
      const exactMatches = results.filter((r) => r.address?.postcode === query);
      results = exactMatches.length > 0 ? exactMatches : results.filter((r) => !isOverlyBroadResult(r));

      // Structured postcode search occasionally returns nothing for postal
      // codes with sparse OSM tagging — fall back to a free-text search
      // (e.g. "530123 Singapore") before giving up entirely.
      if (results.length === 0) {
        const fallbackUrl = new URL("https://nominatim.openstreetmap.org/search");
        fallbackUrl.searchParams.set("format", "jsonv2");
        fallbackUrl.searchParams.set("limit", "5");
        fallbackUrl.searchParams.set("countrycodes", "sg");
        fallbackUrl.searchParams.set("addressdetails", "1");
        fallbackUrl.searchParams.set("q", `${query} Singapore`);
        fallbackUrl.searchParams.set("viewbox", "103.55,1.50,104.15,1.15");
        fallbackUrl.searchParams.set("bounded", "1");

        const fallbackResponse = await fetch(fallbackUrl.toString(), {
          headers: {
            "User-Agent": `sg-cheap-carpark/1.0 (${process.env.APP_URL || "https://github.com/ziahmed/sg_cheap_carpark"})`,
          },
        });
        if (fallbackResponse.ok) {
          const fallbackResults: any[] = await fallbackResponse.json();
          // Same guard here — reject a fallback match that's just "Singapore"
          // the country/city rather than the actual postal code location.
          const exactFallbackMatches = fallbackResults.filter((r) => r.address?.postcode === query);
          results = exactFallbackMatches.length > 0
            ? exactFallbackMatches
            : fallbackResults.filter((r) => !isOverlyBroadResult(r));
        }
      }
    } else {
      // Free-text address/landmark searches also shouldn't resolve to the
      // whole country as a "match" — filter the same way, just without the
      // exact-postcode requirement (which doesn't apply to non-postcode text).
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
