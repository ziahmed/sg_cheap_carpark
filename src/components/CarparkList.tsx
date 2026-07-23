import React, { useState, useMemo } from "react";
import { Carpark } from "../types.ts";
import { Search, SlidersHorizontal, ArrowUpDown, Navigation, Bell, ShieldAlert, BadgeInfo, Sparkles, Check, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { getActiveRate, getShortRateLabel } from "../utils/pricing.ts";

interface CarparkListProps {
  carparks: Carpark[];
  selectedCarpark: Carpark | null;
  onSelectCarpark: (carpark: Carpark) => void;
  destinationName: string | null;
  onSetAlert: (carpark: Carpark) => void;
  trackedAlertCarparkNumbers: string[];
  searchRadiusMeters?: number;
  onExpandRadius?: () => void;
}

export default function CarparkList({
  carparks,
  selectedCarpark,
  onSelectCarpark,
  destinationName,
  onSetAlert,
  trackedAlertCarparkNumbers,
  searchRadiusMeters,
  onExpandRadius,
}: CarparkListProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<"distance" | "lots" | "price">("distance");
  const [filterAgency, setFilterAgency] = useState<"ALL" | "HDB" | "MALL" | "OFFICE" | "HOTEL" | "HOSPITAL" | "PRIVATE">("ALL");
  const [filterFreeParking, setFilterFreeParking] = useState(false);
  const [filterMinHeight, setFilterMinHeight] = useState<number>(0);
  const [showFilters, setShowFilters] = useState(false);

  // Filter & Sort Logic
  const processedCarparks = useMemo(() => {
    let result = [...carparks];

    // Filter by Search term (address or carpark number)
    if (searchTerm.trim() !== "") {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (cp) =>
          cp.address.toLowerCase().includes(term) ||
          cp.carpark_number.toLowerCase().includes(term)
      );
    }

    // Filter by Agency
    if (filterAgency !== "ALL") {
      result = result.filter((cp) => cp.agency === filterAgency);
    }

    // Filter by Free Parking
    if (filterFreeParking) {
      result = result.filter((cp) => cp.free_parking && cp.free_parking !== "NO");
    }

    // Filter by Height Limit
    if (filterMinHeight > 0) {
      result = result.filter((cp) => cp.gantry_height >= filterMinHeight || cp.gantry_height === 0);
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === "distance") {
        return (a.distance_meters || 0) - (b.distance_meters || 0);
      } else if (sortBy === "lots") {
        return b.lots_available - a.lots_available;
      } else if (sortBy === "price") {
        // HDB (cheaper) first, then malls
        const aVal = a.agency === "HDB" ? 1 : 2;
        const bVal = b.agency === "HDB" ? 1 : 2;
        if (aVal !== bVal) return aVal - bVal;
        return (a.distance_meters || 0) - (b.distance_meters || 0);
      }
      return 0;
    });

    return result;
  }, [carparks, searchTerm, sortBy, filterAgency, filterFreeParking, filterMinHeight]);

  return (
    <div className="flex flex-col h-full bg-white text-gray-800">
      {/* Search and Filters Toolbar */}
      <div className="p-3 border-b border-gray-100 bg-gray-50/50 space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search carparks by address or code..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          {/* Sort Toggles */}
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-1">
            <span className="text-xs text-gray-400 whitespace-nowrap flex items-center gap-0.5">
              <ArrowUpDown className="w-3.5 h-3.5" /> Sort:
            </span>
            <button
              onClick={() => setSortBy("distance")}
              className={`text-xs px-2.5 py-1 rounded-full font-medium transition-all whitespace-nowrap ${
                sortBy === "distance"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-white border border-gray-200 hover:bg-gray-100 text-gray-600"
              }`}
            >
              Nearest
            </button>
            <button
              onClick={() => setSortBy("lots")}
              className={`text-xs px-2.5 py-1 rounded-full font-medium transition-all whitespace-nowrap ${
                sortBy === "lots"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-white border border-gray-200 hover:bg-gray-100 text-gray-600"
              }`}
            >
              Available Lots
            </button>
            <button
              onClick={() => setSortBy("price")}
              className={`text-xs px-2.5 py-1 rounded-full font-medium transition-all whitespace-nowrap ${
                sortBy === "price"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-white border border-gray-200 hover:bg-gray-100 text-gray-600"
              }`}
            >
              Cheapest Rate
            </button>
          </div>

          {/* Toggle Filter Panel Button */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`p-1.5 rounded-lg border transition-all ${
              showFilters || filterAgency !== "ALL" || filterFreeParking || filterMinHeight > 0
                ? "bg-blue-50 border-blue-200 text-blue-600"
                : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
            }`}
            title="Toggle Filters"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>

        {/* Filter Drawer */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden border border-blue-100 bg-blue-50/20 rounded-lg p-3 space-y-3 mt-1"
            >
              {/* Filter Agency */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  Parking Type
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      { id: "ALL", label: "All" },
                      { id: "HDB", label: "HDB" },
                      { id: "MALL", label: "Malls & Retail" },
                      { id: "OFFICE", label: "Office Towers" },
                      { id: "HOTEL", label: "Hotels" },
                      { id: "HOSPITAL", label: "Hospitals" },
                      { id: "PRIVATE", label: "Private Operators" },
                    ] as const
                  ).map((ag) => (
                    <button
                      key={ag.id}
                      onClick={() => setFilterAgency(ag.id)}
                      className={`text-xs px-2.5 py-1 rounded-md border transition-all font-medium ${
                        filterAgency === ag.id
                          ? "bg-blue-600 border-blue-600 text-white shadow-xs"
                          : "bg-white border-gray-200 hover:bg-gray-100 text-gray-600"
                      }`}
                    >
                      {ag.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Free Parking and Height toggles in columns */}
              <div className="grid grid-cols-2 gap-3 pt-1 border-t border-blue-100/30">
                <div className="flex flex-col justify-center">
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={filterFreeParking}
                      onChange={(e) => setFilterFreeParking(e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                    />
                    <span className="text-xs font-semibold text-gray-700">🎁 Sun/PH Free</span>
                  </label>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">
                    Height Limit (&ge;)
                  </label>
                  <select
                    value={filterMinHeight}
                    onChange={(e) => setFilterMinHeight(parseFloat(e.target.value))}
                    className="w-full text-xs bg-white border border-gray-200 rounded p-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value={0}>Any Height</option>
                    <option value={1.8}>1.8m (Cars)</option>
                    <option value={1.9}>1.9m (SUVs)</option>
                    <option value={2.0}>2.0m (Vans)</option>
                    <option value={2.1}>2.1m (Large Vans)</option>
                  </select>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Results Count & Destination indicator */}
      <div className="px-4 py-2 bg-blue-50/50 flex justify-between items-center border-b border-gray-100">
        <span className="text-xs font-semibold text-blue-800">
          {processedCarparks.length} spots found
          {destinationName ? ` near "${destinationName}"` : " nearby"}
          {searchRadiusMeters ? ` (within ${(searchRadiusMeters / 1000).toFixed(1)}km)` : ""}
        </span>
        {searchTerm || filterAgency !== "ALL" || filterFreeParking || filterMinHeight > 0 ? (
          <button
            onClick={() => {
              setSearchTerm("");
              setFilterAgency("ALL");
              setFilterFreeParking(false);
              setFilterMinHeight(0);
            }}
            className="text-[10px] text-blue-600 font-bold uppercase hover:underline"
          >
            Clear Filters
          </button>
        ) : null}
      </div>

      {/* Carpark Scrollable List */}
      <div className="flex-1 overflow-y-auto divide-y divide-gray-100 min-h-0">
        {processedCarparks.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <ShieldAlert className="w-10 h-10 text-gray-300 mx-auto" />
            <h5 className="font-bold text-gray-700">No Carparks Match Your Filters</h5>
            <p className="text-xs text-gray-500 max-w-[220px] mx-auto">
              {searchTerm || filterAgency !== "ALL" || filterFreeParking || filterMinHeight > 0
                ? "Try removing some search parameters or broadening your location view."
                : `Nothing found within ${searchRadiusMeters ? (searchRadiusMeters / 1000).toFixed(1) : "1.5"}km of this destination.`}
            </p>
            {!searchTerm && filterAgency === "ALL" && !filterFreeParking && filterMinHeight === 0 && onExpandRadius && (searchRadiusMeters ?? 0) < 6000 && (
              <button
                onClick={onExpandRadius}
                className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold px-3.5 py-2 rounded-full transition-all mt-1"
              >
                Widen search to {((searchRadiusMeters ?? 1500) + 1500) / 1000}km
              </button>
            )}
          </div>
        ) : (
          processedCarparks.map((cp) => {
            const isSelected = selectedCarpark?.carpark_number === cp.carpark_number;
            const hasLiveAvailability = cp.total_lots > 0 && cp.lots_available >= 0;
            const percentage = hasLiveAvailability ? (cp.lots_available / cp.total_lots) * 100 : 0;
            const isAlertTracked = trackedAlertCarparkNumbers.includes(cp.carpark_number);

            let statusColor = "text-emerald-600 bg-emerald-50";
            let lotsProgressColor = "bg-emerald-500";
            if (!hasLiveAvailability) {
              statusColor = "text-slate-500 bg-slate-100";
              lotsProgressColor = "bg-slate-300";
            } else if (cp.lots_available === 0) {
              statusColor = "text-red-600 bg-red-50";
              lotsProgressColor = "bg-red-500";
            } else if (cp.lots_available < 15 || percentage < 15) {
              statusColor = "text-orange-600 bg-orange-50";
              lotsProgressColor = "bg-orange-500";
            }

            return (
              <div
                key={cp.carpark_number}
                className={`p-3.5 transition-all cursor-pointer border-l-4 ${
                  isSelected
                    ? "bg-blue-50/20 border-blue-600"
                    : "border-transparent hover:bg-slate-50/75"
                }`}
                onClick={() => onSelectCarpark(cp)}
              >
                <div className="flex justify-between items-start gap-1">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-mono bg-gray-100 text-gray-600 font-bold px-1.5 py-0.5 rounded">
                        {cp.carpark_number}
                      </span>
                      <span className="text-[10px] font-bold bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded-full uppercase">
                        {cp.agency}
                      </span>
                      {cp.is_central && (
                        <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full uppercase">
                          Central
                        </span>
                      )}
                    </div>
                    <h4 className="font-bold text-sm leading-tight text-gray-900 pr-2">
                      {cp.address}
                    </h4>
                  </div>

                  {/* Lot Availability Badge */}
                  <div className={`px-2.5 py-1.5 rounded-lg text-center min-w-[75px] ${statusColor}`}>
                    {hasLiveAvailability ? (
                      <>
                        <div className="text-lg font-mono font-bold leading-none">
                          {cp.lots_available}
                        </div>
                        <div className="text-[9px] font-bold uppercase tracking-wider">
                          lots free
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-xs font-bold leading-none py-0.5">
                          Rates Only
                        </div>
                        <div className="text-[8px] font-bold opacity-60 uppercase tracking-wider">
                          no live feed
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Lot occupancy visualization bar */}
                <div className="w-full bg-gray-100 rounded-full h-1 mt-2.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${lotsProgressColor}`}
                    style={{ width: `${hasLiveAvailability ? Math.min(percentage, 100) : 100}%` }}
                  ></div>
                </div>

                {/* Sub info panel */}
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 text-xs text-gray-500 mt-2.5 font-medium">
                  {cp.distance_meters !== undefined && (
                    <span className="text-blue-700 font-bold bg-blue-50 px-1.5 py-0.5 rounded">
                      📍 {cp.distance_meters >= 1000 
                        ? `${(cp.distance_meters / 1000).toFixed(2)} km` 
                        : `${cp.distance_meters.toFixed(0)}m`}
                    </span>
                  )}
                  <span>💵 {getShortRateLabel(cp)}</span>
                  {cp.free_parking && cp.free_parking !== "NO" && (
                    <span className="text-blue-600">🎁 Free Sun/PH</span>
                  )}
                  {cp.gantry_height > 0 && (
                    <span>⚠️ {cp.gantry_height}m limit</span>
                  )}
                </div>

                {/* Expanded Selected Details & Quick Actions */}
                {isSelected && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    transition={{ duration: 0.15 }}
                    className="mt-3.5 pt-3.5 border-t border-gray-100 space-y-3"
                  >
                    {/* Full Rate Display */}
                    <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-100 text-xs text-gray-600 space-y-1">
                      <p className="font-bold text-gray-800 flex items-center gap-1 text-[11px] uppercase tracking-wider">
                        <BadgeInfo className="w-3.5 h-3.5 text-blue-600" /> Full Pricing & Rules
                      </p>
                      <p className="whitespace-pre-line leading-relaxed">{cp.price_rate}</p>
                      
                      {cp.price_details && (
                        <div className="bg-blue-50/70 p-2 rounded-lg border border-blue-100 text-[11px] space-y-1 mt-2 text-blue-900 font-medium">
                          <p className="font-bold flex items-center gap-1 text-[10px] uppercase text-blue-800 tracking-wider">
                            <Sparkles className="w-3 h-3 text-blue-600 animate-pulse" /> Active Rate Right Now
                          </p>
                          <p className="flex justify-between font-semibold">
                            <span>{getActiveRate(cp).periodLabel}:</span>
                            <span className="font-mono text-blue-700 font-bold">{getActiveRate(cp).rate}</span>
                          </p>
                        </div>
                      )}

                      <p className="text-[10px] text-gray-400 pt-1">
                        System: {cp.type_of_parking_system} | Base: {cp.car_park_type}
                      </p>
                    </div>

                    {/* Action buttons */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (hasLiveAvailability) {
                            onSetAlert(cp);
                          }
                        }}
                        disabled={!hasLiveAvailability}
                        className={`py-1.5 px-3 text-xs rounded-lg font-bold flex items-center justify-center gap-1.5 transition-all border ${
                          !hasLiveAvailability
                            ? "bg-gray-50 border-gray-100 text-gray-400 cursor-not-allowed"
                            : isAlertTracked
                            ? "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
                            : "bg-white border-gray-200 hover:bg-gray-50 text-gray-600"
                        }`}
                      >
                        <Bell className={`w-3.5 h-3.5 ${isAlertTracked ? "fill-amber-500 text-amber-600" : ""}`} />
                        {!hasLiveAvailability ? "No Live Tracking" : isAlertTracked ? "Alert Configured" : "Track Lots Alert"}
                      </button>

                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${cp.lat},${cp.lng}`}
                        target="_blank"
                        rel="noreferrer noopener"
                        onClick={(e) => e.stopPropagation()}
                        className="py-1.5 px-3 text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all shadow-sm"
                      >
                        <Navigation className="w-3.5 h-3.5" />
                        External Navigate
                      </a>
                    </div>
                  </motion.div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
