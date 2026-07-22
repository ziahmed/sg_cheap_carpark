import React, { useState, useEffect, useMemo, useRef, Suspense, lazy } from "react";
import { Carpark, UserAlert } from "./types.ts";
import { apiUrl } from "./utils/api.ts";
const MapContainer = lazy(() => import("./components/MapContainer.tsx"));
const OfflineMapPreview = lazy(() => import("./components/OfflineMapPreview.tsx"));
import CarparkList from "./components/CarparkList.tsx";
import AlertManager from "./components/AlertManager.tsx";
import SmartAssistant from "./components/SmartAssistant.tsx";
import ReferenceGuide from "./components/ReferenceGuide.tsx";
import { MapPin, Navigation, Car, RefreshCw, AlertCircle, Volume2, VolumeX, Sparkles, Bell, HelpCircle, Compass, Check } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// 15 Key Singapore landmarks/hotspots for instant responsive searching and testing
const HOTSPOTS = [
  { name: "Orchard Road (Ngee Ann City)", lat: 1.3024, lng: 103.8348, desc: "Prime shopping belt in central area" },
  { name: "Marina Bay Sands (MBS)", lat: 1.2828, lng: 103.8590, desc: "Tourist hub & financial district" },
  { name: "VivoCity Mall", lat: 1.2646, lng: 103.8207, desc: "Gateway to Sentosa & HarbourFront" },
  { name: "Suntec City Mall", lat: 1.2935, lng: 103.8572, desc: "Marina Centre commercial hub" },
  { name: "Bugis Junction", lat: 1.3002, lng: 103.8561, desc: "Bustling downtown retail zone" },
  { name: "Tampines Mall (East)", lat: 1.3527, lng: 103.9452, desc: "Regional commercial hub in the East" },
  { name: "Jurong Point (West)", lat: 1.3396, lng: 103.7067, desc: "Massive retail hub in Boon Lay" },
  { name: "NEX Serangoon (Northeast)", lat: 1.3506, lng: 103.8728, desc: "Densely populated northeast hub" },
  { name: "Chinatown Point", lat: 1.2848, lng: 103.8433, desc: "Historic town with cheap food & parking" },
  { name: "Clarke Quay", lat: 1.2913, lng: 103.8454, desc: "Nightlife, dining & central parking" },
  { name: "Mustafa Centre (Little India)", lat: 1.3096, lng: 103.8558, desc: "24-hour shopping landmark" },
  { name: "Ang Mo Kio Hub (North)", lat: 1.3694, lng: 103.8485, desc: "Central heartland commercial node" },
  { name: "Woodlands Civic Centre (North)", lat: 1.4359, lng: 103.7869, desc: "Northern gateway near checkpoint" },
  { name: "Jewel Changi Airport", lat: 1.3602, lng: 103.9898, desc: "World class lifestyle & transport dome" },
  { name: "Raffles Place (CBD)", lat: 1.2841, lng: 103.8510, desc: "Downtown corporate financial hub" },
];

export default function App() {
  const [userLocation, setUserLocation] = useState({ lat: 1.2930, lng: 103.8520 }); // Defaults to City Hall
  const [destination, setDestination] = useState<{ lat: number; lng: number; name: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showHotspotDropdown, setShowHotspotDropdown] = useState(false);
  const searchWrapperRef = useRef<HTMLDivElement>(null);
  
  // Real-time API carpark lists
  const [allCarparks, setAllCarparks] = useState<Carpark[]>([]);
  const [loadingCarparks, setLoadingCarparks] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Selected carpark and directions
  const [selectedCarpark, setSelectedCarpark] = useState<Carpark | null>(null);
  const [showRoute, setShowRoute] = useState(false);
  const [routeInfo, setRouteInfo] = useState<{ distance: string; duration: string } | null>(null);
  const [searchRadiusMeters, setSearchRadiusMeters] = useState(1500);

  // Active user alert subscriptions (persisted in localStorage)
  const [alerts, setAlerts] = useState<UserAlert[]>(() => {
    const saved = localStorage.getItem("sg_carpark_alerts");
    return saved ? JSON.parse(saved) : [];
  });

  // Client-side Toast notification manager
  const [toasts, setToasts] = useState<{ id: string; message: string; type: "alert" | "success" | "info" }[]>([]);
  const [activeTab, setActiveTab] = useState<"list" | "assistant" | "alerts">("list");
  // On narrow/mobile viewports, the sidebar and map can't sit side-by-side
  // (no horizontal room), so instead of stacking them vertically — which
  // let the sidebar's carpark list push the map fully off-screen with no
  // way back to it — mobile gets an explicit full-screen toggle between the
  // two. Desktop/tablet (md breakpoint and up) ignores this and always
  // shows both panels side by side, as before.
  const [mobileView, setMobileView] = useState<"list" | "map">("list");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [offlineMode, setOfflineMode] = useState(false);

  // Fetch real-time carpark availability data from our Express server proxy
  const fetchCarparkData = async () => {
    setLoadingCarparks(true);
    setFetchError(null);
    try {
      const res = await fetch(apiUrl("/api/carparks"));
      if (!res.ok) {
        throw new Error(`Failed to load parking feed: ${res.statusText}`);
      }
      const data = await res.json();
      setAllCarparks(data);
      setLastRefreshed(new Date());

      // Check if any untriggered alert is now satisfied by the new data
      setAlerts((prevAlerts) => {
        let changed = false;
        const updated = prevAlerts.map((alert) => {
          if (alert.is_triggered) return alert;

          // Find this carpark in the newly fetched data
          const currentCp = data.find((cp: Carpark) => cp.carpark_number === alert.carpark_number);
          if (currentCp) {
            // Check condition: rose above threshold
            if (currentCp.lots_available >= alert.target_lots_available) {
              changed = true;
              addToast(
                `🚨 Alert Triggered! Carpark ${alert.carpark_number} (${alert.carpark_address}) now has ${currentCp.lots_available} available lots!`,
                "alert"
              );
              
              if (soundEnabled) {
                playAlertSound();
              }

              return {
                ...alert,
                is_triggered: true,
                triggered_reason: `Available lots rose to ${currentCp.lots_available}, exceeding your threshold of ${alert.target_lots_available}!`,
              };
            }
          }
          return alert;
        });

        if (changed) {
          localStorage.setItem("sg_carpark_alerts", JSON.stringify(updated));
        }
        return updated;
      });

    } catch (err: any) {
      console.error(err);
      setFetchError("Data.gov.sg parking API is currently busy. Displaying cached metadata.");
    } finally {
      setLoadingCarparks(false);
    }
  };

  // Periodic polling every 30 seconds
  useEffect(() => {
    fetchCarparkData();
    const interval = setInterval(fetchCarparkData, 30000);
    return () => clearInterval(interval);
  }, []);

  // Save alerts to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem("sg_carpark_alerts", JSON.stringify(alerts));
  }, [alerts]);

  // Close the hotspot dropdown when clicking anywhere outside the search box
  useEffect(() => {
    if (!showHotspotDropdown) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (searchWrapperRef.current && !searchWrapperRef.current.contains(e.target as Node)) {
        setShowHotspotDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showHotspotDropdown]);

  // Try to get actual user geolocation on load (fallback to City Hall if denied)
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserLocation({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
          addToast("📍 Device GPS coordinates loaded successfully.", "info");
        },
        (err) => {
          console.log("Geolocation permission not granted. Defaulting to Central City Hall, Singapore.");
        }
      );
    }
  }, []);

  // Custom Toast adder helper
  const addToast = (message: string, type: "alert" | "success" | "info" = "info") => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 6000);
  };

  // Simulating sound alert for visual fidelity
  const playAlertSound = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
      oscillator.frequency.setValueAtTime(1200, audioCtx.currentTime + 0.15); // Higher note
      
      gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.4);
    } catch (e) {
      console.log("Audio alert playback failed or context blocked: ", e);
    }
  };

  // Haversine formula to compute distance in meters on the client
  function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // meters
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // in meters
  }

  // Filter & calculate distances for carparks near selected destination or current location
  const processedNearbyCarparks = useMemo(() => {
    const origin = destination || userLocation;
    return allCarparks
      .map((cp) => {
        const dist = getDistance(origin.lat, origin.lng, cp.lat, cp.lng);
        return {
          ...cp,
          distance_meters: dist,
        };
      })
      .filter((cp) => cp.distance_meters <= searchRadiusMeters)
      .sort((a, b) => (a.distance_meters || 0) - (b.distance_meters || 0));
  }, [allCarparks, destination, userLocation, searchRadiusMeters]);

  // Handle setting a Hotspot
  const handleSelectHotspot = (hotspot: typeof HOTSPOTS[0]) => {
    setDestination({
      lat: hotspot.lat,
      lng: hotspot.lng,
      name: hotspot.name,
    });
    setSearchQuery(hotspot.name);
    setShowHotspotDropdown(false);
    setSelectedCarpark(null);
    setShowRoute(false);
    setRouteInfo(null);
    setSearchRadiusMeters(1500);
    setActiveTab("list");
    addToast(`📍 Destination set: ${hotspot.name}. Analyzing nearby carparks.`, "success");
  };

  // Handle typing custom coordinates, landmark search, or a free-text address (via Nominatim)
  const [isGeocoding, setIsGeocoding] = useState(false);
  const handleCustomSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || isGeocoding) return;

    // Direct match against hotspots list
    const match = HOTSPOTS.find((h) => h.name.toLowerCase().includes(searchQuery.toLowerCase()));
    if (match) {
      handleSelectHotspot(match);
      return;
    }

    // Try custom GPS coordinate search if formatted as "lat, lng"
    const coordPattern = /^[-+]?([1-9]?\d(\.\d+)?|90(\.0+)?),\s*[-+]?(180(\.0+)?|((1[0-7]\d)|([1-9]?\d))(\.\d+)?)$/;
    if (coordPattern.test(searchQuery.trim())) {
      const [latStr, lngStr] = searchQuery.split(",");
      const lat = parseFloat(latStr);
      const lng = parseFloat(lngStr);
      if (!isNaN(lat) && !isNaN(lng)) {
        setDestination({
          lat,
          lng,
          name: `Custom Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
        });
        setSelectedCarpark(null);
        setShowRoute(false);
        setRouteInfo(null);
        setSearchRadiusMeters(1500);
        setActiveTab("list");
        addToast(`📍 Navigated to custom coordinates.`, "success");
        return;
      }
    }

    // Fall back to free-text address search via our Nominatim proxy
    setIsGeocoding(true);
    setShowHotspotDropdown(false);
    try {
      const res = await fetch(apiUrl(`/api/geocode?q=${encodeURIComponent(searchQuery.trim())}`));
      if (!res.ok) throw new Error("Geocoding request failed");
      const results: { name: string; lat: number; lng: number }[] = await res.json();

      if (results.length > 0) {
        const best = results[0];
        setDestination({ lat: best.lat, lng: best.lng, name: best.name });
        setSearchQuery(best.name);
        setSelectedCarpark(null);
        setShowRoute(false);
        setRouteInfo(null);
        setSearchRadiusMeters(1500);
        setActiveTab("list");
        addToast(`📍 Found "${best.name}". Analyzing nearby carparks.`, "success");
      } else {
        addToast(`🔍 No address found for "${searchQuery}". Try a more specific address, or pick a landmark below.`, "info");
        setShowHotspotDropdown(true);
      }
    } catch (err) {
      console.error(err);
      addToast(`⚠️ Address search is temporarily unavailable. Pick a landmark below, or paste coordinates as "lat, lng".`, "info");
      setShowHotspotDropdown(true);
    } finally {
      setIsGeocoding(false);
    }
  };


  // Setup Alert Subscription
  const handleAddAlert = (carpark: Carpark, threshold: number, priceChange: boolean) => {
    // Check if duplicate
    if (alerts.some((a) => a.carpark_number === carpark.carpark_number && !a.is_triggered)) {
      addToast(`⚠️ You already have an active alert configured for ${carpark.carpark_number}!`, "info");
      return;
    }

    const newAlert: UserAlert = {
      id: Math.random().toString(36).substring(2, 9),
      carpark_number: carpark.carpark_number,
      carpark_address: carpark.address,
      target_lots_available: threshold,
      target_price_change: priceChange,
      current_lots_when_set: carpark.lots_available,
      is_triggered: false,
      created_at: Date.now(),
    };

    setAlerts((prev) => [newAlert, ...prev]);
    addToast(`🔔 Smart alert set for Carpark ${carpark.carpark_number}!`, "success");
  };

  // Quick toggle alert directly from the carpark list action
  const handleToggleListAlert = (carpark: Carpark) => {
    const existingIndex = alerts.findIndex((a) => a.carpark_number === carpark.carpark_number && !a.is_triggered);
    if (existingIndex > -1) {
      // Remove
      const alertId = alerts[existingIndex].id;
      handleRemoveAlert(alertId);
    } else {
      // Add default alert: triggers when lots go above 15
      handleAddAlert(carpark, 15, true);
    }
  };

  // Remove Alert
  const handleRemoveAlert = (id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    addToast("🔔 Alert subscription cancelled.", "info");
  };

  // Simulated alert trigger (extremely helpful for developer testing and user evaluation in iframe!)
  const handleTriggerAlertSimulated = (id: string, newLotsValue: number) => {
    setAlerts((prevAlerts) => {
      return prevAlerts.map((alert) => {
        if (alert.id === id) {
          addToast(
            `🚨 SIMULATED TRIGGER: Carpark ${alert.carpark_number} lots increased to ${newLotsValue}!`,
            "alert"
          );
          if (soundEnabled) {
            playAlertSound();
          }
          return {
            ...alert,
            is_triggered: true,
            triggered_reason: `[Simulated] Carpark lot release detected. Available spaces rose to ${newLotsValue}!`,
          };
        }
        return alert;
      });
    });
  };

  // Mock driving down CTE simulator to make preview feel alive and active
  const handleSimulateDrive = () => {
    // Pick a hotspot at random and set location near it
    const randomSpot = HOTSPOTS[Math.floor(Math.random() * HOTSPOTS.length)];
    // Add minor offset to simulate driver is slightly away from it
    const simulatedLat = randomSpot.lat - 0.005 + Math.random() * 0.01;
    const simulatedLng = randomSpot.lng - 0.005 + Math.random() * 0.01;

    setUserLocation({ lat: simulatedLat, lng: simulatedLng });
    setDestination({
      lat: randomSpot.lat,
      lng: randomSpot.lng,
      name: randomSpot.name,
    });
    setSearchQuery(randomSpot.name);
    setSelectedCarpark(null);
    setShowRoute(false);
    setRouteInfo(null);
    setSearchRadiusMeters(1500);
    addToast(`🚗 Simulated Driving: Position updated near ${randomSpot.name}!`, "info");
  };

  const trackedAlertNumbers = useMemo(() => {
    return alerts.filter((a) => !a.is_triggered).map((a) => a.carpark_number);
  }, [alerts]);

  // Handle checking if API key is provided


  return (
    <div className="flex flex-col h-screen h-[100dvh] w-screen bg-slate-50 font-sans overflow-hidden text-slate-900">
      {/* Top Navigation Bar */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between flex-shrink-0 z-30 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2.5 rounded-xl text-white shadow-lg shadow-blue-200">
            <Car className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-black tracking-tight text-slate-800 flex items-center gap-1.5 uppercase">
              SG Carpark Finder
              <span className="bg-blue-500/10 text-blue-600 text-[10px] font-bold px-2 py-0.5 rounded border border-blue-500/20">
                LIVE FEED
              </span>
            </h1>
            <p className="text-[10px] text-slate-500 font-medium">Real-time vacancies, pricing & AI recommendation</p>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3">
          {/* Last Refreshed Time indicator */}
          <div className="hidden sm:flex flex-col items-end text-right">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
              Data.gov.sg Status
            </span>
            <span className="text-[11px] text-blue-600 font-mono font-medium flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-600 inline-block animate-pulse"></span>
              {lastRefreshed ? `Updated ${lastRefreshed.toLocaleTimeString()}` : "Synchronizing..."}
            </span>
          </div>

          <button
            onClick={fetchCarparkData}
            disabled={loadingCarparks}
            className="p-2 bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-800 rounded-xl transition-all hover:bg-slate-200 disabled:opacity-50"
            title="Force refresh parking data"
            aria-label="Refresh parking data"
          >
            <RefreshCw className={`w-4 h-4 ${loadingCarparks ? "animate-spin text-blue-600" : ""}`} />
          </button>

          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-2 bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-800 rounded-xl transition-all hover:bg-slate-200"
            title={soundEnabled ? "Mute alert audio" : "Unmute alert audio"}
            aria-label={soundEnabled ? "Mute alert audio" : "Unmute alert audio"}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-blue-600" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
          </button>

          <button
            onClick={() => setShowHelpModal(true)}
            className="p-2 bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-800 rounded-xl transition-all hover:bg-slate-200 flex items-center gap-1.5"
            title="Reference Guide"
            aria-label="Open reference guide"
          >
            <HelpCircle className="w-4 h-4 text-blue-600 animate-pulse" />
            <span className="hidden sm:inline text-xs font-bold px-0.5">Reference Guide</span>
          </button>

          <button
            onClick={handleSimulateDrive}
            aria-label="Simulate driving to a random landmark"
            title="Simulate Driving"
            className="flex text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-2.5 md:px-4 rounded-xl shadow-md shadow-blue-200 transition-all items-center gap-1.5"
          >
            <Compass className="w-4 h-4" /> <span className="hidden md:inline">Simulate Driving</span>
          </button>
        </div>
      </header>

      {/* Live data fetch error banner */}
      {fetchError && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-800 text-xs font-semibold px-4 py-2 flex items-center justify-between gap-2 flex-shrink-0 z-30">
          <span className="flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {fetchError}
          </span>
          <button
            onClick={fetchCarparkData}
            className="text-amber-900 underline underline-offset-2 hover:text-amber-950 flex-shrink-0"
          >
            Retry now
          </button>
        </div>
      )}

      {/* Main Content Dashboard */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0 relative">

        {/* Mobile-only floating toggle between List and Map full-screen views.
            Hidden from md breakpoint up, where both panels sit side by side
            and there's nothing to toggle between. */}
        <button
          onClick={() => setMobileView((v) => (v === "list" ? "map" : "list"))}
          aria-label={mobileView === "list" ? "Show map" : "Show carpark list"}
          className="md:hidden fixed bottom-5 left-1/2 -translate-x-1/2 z-40 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-5 py-3 rounded-full shadow-lg shadow-blue-900/30 flex items-center gap-2"
        >
          {mobileView === "list" ? (
            <>
              <MapPin className="w-4 h-4" /> View Map
            </>
          ) : (
            <>
              <Car className="w-4 h-4" /> View List
            </>
          )}
        </button>
        
        {/* Sidebar Panel */}
        <aside
          className={`${mobileView === "list" ? "flex" : "hidden"} md:flex w-full md:w-[420px] bg-white flex-col border-r border-slate-200 flex-shrink-0 z-20 min-h-0`}
        >
          
          {/* Main search input for places in Singapore */}
          <div className="p-4 border-b border-slate-100 bg-white/90 backdrop-blur-md space-y-3" ref={searchWrapperRef}>
            <form onSubmit={handleCustomSearchSubmit} className="relative">
              <div className="relative">
                <MapPin className="absolute left-3.5 top-3.5 h-4 w-4 text-blue-600" />
                <input
                  type="text"
                  placeholder="Search address, landmark, or postal code (e.g. 238859)..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShowHotspotDropdown(true);
                  }}
                  onFocus={() => setShowHotspotDropdown(true)}
                  disabled={isGeocoding}
                  className="w-full pl-10 pr-10 py-3 text-xs bg-slate-100 border-none text-slate-800 placeholder-slate-400 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all shadow-sm font-medium disabled:opacity-60"
                />
                {isGeocoding ? (
                  <RefreshCw className="absolute right-3 top-3.5 h-4 w-4 text-blue-600 animate-spin" />
                ) : searchQuery ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      setDestination(null);
                      setSelectedCarpark(null);
                      setShowRoute(false);
                      setRouteInfo(null);
                    }}
                    aria-label="Clear search"
                    className="absolute right-3 top-3.5 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                ) : null}
              </div>

              {/* Hotspots Dropdown */}
              <AnimatePresence>
                {showHotspotDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="absolute left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 max-h-[250px] overflow-y-auto divide-y divide-slate-100"
                  >
                    <div className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50 flex justify-between items-center rounded-t-2xl">
                      <span>Popular Driving Hotspots</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowHotspotDropdown(false);
                        }}
                        className="text-slate-400 hover:text-slate-600 font-sans text-xs font-normal"
                      >
                        Close
                      </button>
                    </div>
                    {HOTSPOTS.filter(
                      (h) =>
                        searchQuery === "" ||
                        h.name.toLowerCase().includes(searchQuery.toLowerCase())
                    ).map((hotspot) => (
                      <button
                        key={hotspot.name}
                        type="button"
                        onClick={() => handleSelectHotspot(hotspot)}
                        className="w-full text-left px-4 py-3 hover:bg-blue-50/65 text-xs transition-all flex flex-col gap-0.5"
                      >
                        <span className="font-bold text-slate-800">{hotspot.name}</span>
                        <span className="text-[10px] text-slate-500">{hotspot.desc}</span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </form>

            {/* Quick Helper presets row */}
            {!destination && (
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Quick start:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {HOTSPOTS.slice(0, 4).map((h) => (
                    <button
                      key={h.name}
                      onClick={() => handleSelectHotspot(h)}
                      className="text-[10px] bg-slate-100 border-none text-slate-600 hover:text-slate-800 hover:bg-slate-200 px-3 py-1.5 rounded-full transition-all font-semibold"
                    >
                      {h.name.split(" ")[0]}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sub Navigation Panel Tabs */}
          <div className="grid grid-cols-3 border-b border-slate-200 bg-slate-50 text-xs flex-shrink-0">
            <button
              onClick={() => setActiveTab("list")}
              className={`py-3.5 text-center font-bold tracking-tight border-b-2 uppercase transition-all ${
                activeTab === "list"
                  ? "border-blue-600 text-blue-600 bg-white"
                  : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-white/50"
              }`}
            >
              🚗 Park Spots
            </button>
            <button
              onClick={() => setActiveTab("assistant")}
              className={`py-3.5 text-center font-bold tracking-tight border-b-2 uppercase transition-all flex items-center justify-center gap-1 ${
                activeTab === "assistant"
                  ? "border-blue-600 text-blue-600 bg-white"
                  : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-white/50"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 fill-current text-blue-600" /> AI Advisor
            </button>
            <button
              onClick={() => setActiveTab("alerts")}
              className={`py-3.5 text-center font-bold tracking-tight border-b-2 uppercase transition-all flex items-center justify-center gap-1 ${
                activeTab === "alerts"
                  ? "border-blue-600 text-blue-600 bg-white"
                  : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-white/50"
              }`}
            >
              🔔 Alerts ({alerts.filter(a => !a.is_triggered).length})
            </button>
          </div>

          {/* Tab Content Panel (Scrollable) */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {activeTab === "list" ? (
              <CarparkList
                carparks={processedNearbyCarparks}
                selectedCarpark={selectedCarpark}
                onSelectCarpark={(cp) => {
                  setSelectedCarpark(cp);
                  setShowRoute(true);
                  setRouteInfo(null);
                  setMobileView("map");
                }}
                destinationName={destination ? destination.name : null}
                onSetAlert={handleToggleListAlert}
                trackedAlertCarparkNumbers={trackedAlertNumbers}
                searchRadiusMeters={searchRadiusMeters}
                onExpandRadius={() => setSearchRadiusMeters((r) => Math.min(r + 1500, 6000))}
              />
            ) : activeTab === "assistant" ? (
              <SmartAssistant
                destinationName={destination ? destination.name : null}
                nearbyCarparks={processedNearbyCarparks}
                onSelectCarparkByNumber={(num) => {
                  const match = allCarparks.find((cp) => cp.carpark_number === num);
                  if (match) {
                    setSelectedCarpark(match);
                    setShowRoute(true);
                    setActiveTab("list");
                    setMobileView("map");
                    addToast(`Selected ${match.address} for navigation.`, "info");
                  }
                }}
              />
            ) : (
              <div className="p-3">
                <AlertManager
                  alerts={alerts}
                  onAddAlert={handleAddAlert}
                  onRemoveAlert={handleRemoveAlert}
                  onTriggerAlertSimulated={handleTriggerAlertSimulated}
                  carparks={allCarparks}
                />
              </div>
            )}
          </div>
        </aside>

        {/* Map Stage Panel */}
        <main className={`${mobileView === "map" ? "block" : "hidden"} md:block flex-1 h-full relative z-10`}>
          <Suspense
            fallback={
              <div className="w-full h-full bg-slate-100 flex flex-col items-center justify-center gap-3 text-slate-400">
                <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
                <span className="text-xs font-semibold">Loading map…</span>
              </div>
            }
          >
            {offlineMode ? (
              <OfflineMapPreview
                userLocation={userLocation}
                destination={destination}
                carparks={processedNearbyCarparks}
                selectedCarpark={selectedCarpark}
                onSelectCarpark={(cp) => {
                  setSelectedCarpark(cp);
                  setShowRoute(true);
                  setRouteInfo(null);
                }}
              />
            ) : (
              <MapContainer
                userLocation={userLocation}
                destination={destination}
                carparks={processedNearbyCarparks}
                selectedCarpark={selectedCarpark}
                onSelectCarpark={(cp) => {
                  setSelectedCarpark(cp);
                  setShowRoute(true);
                  setRouteInfo(null);
                }}
                showRoute={showRoute}
                onRouteComputed={(info) => setRouteInfo(info)}
              />
            )}
          </Suspense>

          {/* Manual toggle between the live map and the lightweight offline schematic —
              useful when tiles/routing are unreachable (e.g. no internet), since MapLibre
              still needs network access to load tiles even though it needs no API key. */}
          <button
            onClick={() => {
              setOfflineMode((prev) => !prev);
              addToast(
                offlineMode
                  ? "🗺️ Switched back to the live map."
                  : "🗺️ Offline schematic preview activated — approximate positions, no live map imagery.",
                "info"
              );
            }}
            className="absolute top-4 right-4 z-20 bg-white/95 backdrop-blur-md border border-slate-200 shadow-md text-[10px] font-bold text-slate-600 hover:text-slate-800 hover:bg-white px-2.5 py-1.5 rounded-lg transition-all"
          >
            {offlineMode ? "Switch to Live Map" : "Offline Schematic View"}
          </button>

          {/* Active Directions Summary Overlay Card */}
          {selectedCarpark && showRoute && routeInfo && (
            <div className="absolute top-4 left-4 right-4 sm:left-auto sm:right-4 bg-white/95 backdrop-blur-md p-4 rounded-2xl border border-slate-200 shadow-xl z-30 max-w-sm text-slate-800">
              <div className="flex items-start justify-between gap-2.5">
                <div className="space-y-1">
                  <div className="text-[9px] font-black uppercase tracking-wider text-blue-600 flex items-center gap-1">
                    <Navigation className="w-3 h-3 text-blue-600 animate-pulse" /> Live Driving Directions
                  </div>
                  <h4 className="font-bold text-sm leading-tight text-slate-800">
                    Route to {selectedCarpark.address}
                  </h4>
                  <div className="flex items-center gap-3 pt-1.5">
                    <div className="bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-100">
                      <p className="text-[9px] font-bold text-slate-400 uppercase">Driving Duration</p>
                      <p className="text-sm font-mono font-bold text-blue-600 leading-none mt-0.5">
                        {routeInfo.duration}
                      </p>
                    </div>
                    <div className="bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-100">
                      <p className="text-[9px] font-bold text-slate-400 uppercase">Driving Distance</p>
                      <p className="text-sm font-mono font-bold text-blue-600 leading-none mt-0.5">
                        {routeInfo.distance}
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setSelectedCarpark(null);
                    setShowRoute(false);
                    setRouteInfo(null);
                  }}
                  className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Reference Guide Modal */}
      <AnimatePresence>
        {showHelpModal && (
          <ReferenceGuide isOpen={showHelpModal} onClose={() => setShowHelpModal(false)} />
        )}
      </AnimatePresence>

      {/* Real-time Floating Alert Toast Container */}
      <div className="absolute top-16 right-4 flex flex-col gap-2 z-50 pointer-events-none max-w-sm w-full">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 20, y: -10 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className={`p-3.5 rounded-xl shadow-xl border flex items-start gap-2.5 pointer-events-auto leading-normal ${
                t.type === "alert"
                  ? "bg-amber-50 border-amber-200 text-amber-900"
                  : t.type === "success"
                  ? "bg-blue-50 border-blue-200 text-blue-900"
                  : "bg-slate-50 border-slate-200 text-slate-900"
              }`}
            >
              {t.type === "alert" ? (
                <Bell className="w-5 h-5 text-amber-400 animate-bounce flex-shrink-0 mt-0.5" />
              ) : t.type === "success" ? (
                <Check className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
              ) : (
                <Info className="w-5 h-5 text-sky-400 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1 text-xs font-semibold">{t.message}</div>
              <button
                onClick={() => setToasts((prev) => prev.filter((toast) => toast.id !== t.id))}
                aria-label="Dismiss notification"
                className="text-gray-400 hover:text-gray-700 text-xs font-bold font-sans self-center"
              >
                ✕
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

// Inline standard components for close button to satisfy icons compile
function X(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  );
}

function Info(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="12" y1="16" x2="12" y2="12"></line>
      <line x1="12" y1="8" x2="12.01" y2="8"></line>
    </svg>
  );
}
