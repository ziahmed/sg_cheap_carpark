import React, { useEffect, useRef, useState } from "react";
import { Map, Marker, Popup, NavigationControl, GeolocateControl, Source, Layer } from "react-map-gl/maplibre";
import type { MapRef } from "react-map-gl/maplibre";
import { Carpark } from "../types.ts";
import { MapPin, Navigation, Car } from "lucide-react";
import { getShortRateLabel, getActiveRate } from "../utils/pricing.ts";

interface MapContainerProps {
  userLocation: { lat: number; lng: number };
  destination: { lat: number; lng: number; name: string } | null;
  carparks: Carpark[];
  selectedCarpark: Carpark | null;
  onSelectCarpark: (carpark: Carpark) => void;
  showRoute: boolean;
  onRouteComputed?: (info: { distance: string; duration: string }) => void;
}

// Free, no-signup vector tile style from OpenFreeMap (OpenStreetMap-based).
// No API key or billing account required. See https://openfreemap.org
const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

interface CarparkMarkerProps {
  key?: string;
  carpark: Carpark;
  isSelected: boolean;
  onSelect: () => void;
}

function CarparkMarker({ carpark, isSelected, onSelect }: CarparkMarkerProps) {
  const [infoOpen, setInfoOpen] = useState(false);

  useEffect(() => {
    setInfoOpen(isSelected);
  }, [isSelected]);

  // total_lots/lots_available are -1 when this carpark has no live availability
  // feed (many private mall carparks aren't part of data.gov.sg's real-time API)
  // — in that case we still show it, but as a rates-only pin.
  const hasLiveAvailability = carpark.total_lots > 0 && carpark.lots_available >= 0;
  const percentage = hasLiveAvailability ? (carpark.lots_available / carpark.total_lots) * 100 : 0;

  let pinColor = "#10b981"; // Green (high availability)
  if (!hasLiveAvailability) {
    pinColor = "#64748b"; // Slate (rates only, no live feed)
  } else if (carpark.lots_available === 0) {
    pinColor = "#ef4444"; // Red (Full)
  } else if (carpark.lots_available < 15 || percentage < 15) {
    pinColor = "#f97316"; // Orange (Filling fast)
  }

  return (
    <>
      <Marker
        longitude={carpark.lng}
        latitude={carpark.lat}
        anchor="bottom"
        onClick={(e) => {
          e.originalEvent.stopPropagation();
          onSelect();
          setInfoOpen(true);
        }}
      >
        <div
          className="cursor-pointer flex flex-col items-center transition-transform"
          style={{ transform: isSelected ? "scale(1.2)" : "scale(1)" }}
        >
          <div
            className="rounded-full border-2 border-white shadow-lg flex items-center justify-center text-[10px] font-mono font-bold text-white px-1.5 py-1"
            style={{ backgroundColor: pinColor, minWidth: 26 }}
          >
            {hasLiveAvailability ? carpark.lots_available : "$"}
          </div>
          <div
            className="w-0 h-0"
            style={{
              borderLeft: "5px solid transparent",
              borderRight: "5px solid transparent",
              borderTop: `7px solid ${pinColor}`,
              marginTop: -1,
            }}
          />
        </div>
      </Marker>

      {infoOpen && (
        <Popup
          longitude={carpark.lng}
          latitude={carpark.lat}
          anchor="bottom"
          offset={30}
          closeOnClick={false}
          onClose={() => setInfoOpen(false)}
        >
          <div className="p-1 max-w-[230px] text-gray-800">
            <h4 className="font-bold text-sm leading-tight text-gray-900 border-b pb-1 mb-1 flex items-center gap-1">
              <Car className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
              {carpark.address}
            </h4>
            <div className="space-y-1 text-xs">
              <p className="flex justify-between gap-2">
                <span className="text-gray-500">Available Lots:</span>
                <span className="font-mono font-bold text-blue-600">
                  {hasLiveAvailability ? `${carpark.lots_available} / ${carpark.total_lots}` : "Live N/A (Rates Only)"}
                </span>
              </p>
              <p className="flex justify-between gap-1">
                <span className="text-gray-500">Rate:</span>
                <span className="font-semibold text-right text-slate-700">{getShortRateLabel(carpark)}</span>
              </p>
              {carpark.agency === "MALL" && (
                <p className="text-[10px] text-blue-600 bg-blue-50 px-1 py-0.5 rounded text-center font-semibold">
                  Active Now: {getActiveRate(carpark).periodLabel}
                </p>
              )}
              {carpark.free_parking && carpark.free_parking !== "NO" && (
                <p className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-medium mt-1 inline-block">
                  🎁 Free Sun/PH: {carpark.free_parking}
                </p>
              )}
              {carpark.gantry_height > 0 && (
                <p className="text-[10px] text-gray-500">⚠️ Height limit: {carpark.gantry_height}m</p>
              )}
            </div>
            <button
              onClick={() => {
                onSelect();
                setInfoOpen(false);
              }}
              className="mt-2.5 w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold text-[11px] py-1.5 px-2.5 rounded-xl flex items-center justify-center gap-1 shadow-sm transition-all"
            >
              <Navigation className="w-3 h-3" /> Select for Navigation
            </button>
          </div>
        </Popup>
      )}
    </>
  );
}

export default function MapContainer({
  userLocation,
  destination,
  carparks,
  selectedCarpark,
  onSelectCarpark,
  showRoute,
  onRouteComputed,
}: MapContainerProps) {
  const mapRef = useRef<MapRef>(null);
  const [routeGeometry, setRouteGeometry] = useState<any | null>(null);
  const [routeError, setRouteError] = useState(false);

  // Adjust bounds when destination or list of carparks changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (destination) {
      const lats = [destination.lat, userLocation.lat, ...carparks.slice(0, 3).map((cp) => cp.lat)];
      const lngs = [destination.lng, userLocation.lng, ...carparks.slice(0, 3).map((cp) => cp.lng)];
      const bounds: [[number, number], [number, number]] = [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ];
      map.fitBounds(bounds, { padding: 60, duration: 600 });
    } else {
      map.flyTo({ center: [userLocation.lng, userLocation.lat], zoom: 14, duration: 600 });
    }
  }, [destination, userLocation, carparks]);

  // Fetch a real driving route (GeoJSON) from our server proxy (ORS, falling back to OSRM demo)
  useEffect(() => {
    setRouteError(false);
    if (!showRoute || !selectedCarpark) {
      setRouteGeometry(null);
      return;
    }

    let cancelled = false;
    const params = new URLSearchParams({
      originLat: String(userLocation.lat),
      originLng: String(userLocation.lng),
      destLat: String(selectedCarpark.lat),
      destLng: String(selectedCarpark.lng),
    });

    fetch(`/api/route?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error("Route request failed");
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setRouteGeometry(data.geometry);

        const distanceMeters = data.distanceMeters || 0;
        const distanceStr =
          distanceMeters >= 1000 ? `${(distanceMeters / 1000).toFixed(1)} km` : `${Math.round(distanceMeters)} m`;
        const durationMinutes = Math.ceil((data.durationSeconds || 0) / 60);
        const durationStr = `${durationMinutes} mins`;

        onRouteComputed?.({ distance: distanceStr, duration: durationStr });
      })
      .catch((err) => {
        console.error("Error fetching route: ", err);
        if (!cancelled) setRouteError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [showRoute, selectedCarpark, userLocation]);

  return (
    <div className="w-full h-full relative" id="maplibre-carpark-map">
      <Map
        ref={mapRef}
        initialViewState={{ longitude: userLocation.lng, latitude: userLocation.lat, zoom: 14 }}
        mapStyle={MAP_STYLE}
        style={{ width: "100%", height: "100%" }}
        attributionControl={{ compact: true }}
      >
        <NavigationControl position="top-right" />
        <GeolocateControl position="top-right" />

        {/* User Current Location Marker */}
        <Marker longitude={userLocation.lng} latitude={userLocation.lat} anchor="center">
          <div className="relative flex items-center justify-center">
            <span className="absolute inline-flex h-6 w-6 rounded-full bg-blue-400 opacity-75 animate-ping"></span>
            <div className="relative bg-blue-600 border-2 border-white rounded-full p-2 text-white shadow-lg">
              <Car className="w-4 h-4" />
            </div>
          </div>
        </Marker>

        {/* Selected Destination Marker */}
        {destination && (
          <Marker longitude={destination.lng} latitude={destination.lat} anchor="bottom">
            <div className="bg-rose-600 border border-rose-500 text-white rounded-lg px-2.5 py-1.5 shadow-xl flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-white fill-current" />
              <span className="text-xs font-bold whitespace-nowrap">{destination.name}</span>
            </div>
          </Marker>
        )}

        {/* Carparks Markers */}
        {carparks.map((cp) => (
          <CarparkMarker
            key={cp.carpark_number}
            carpark={cp}
            isSelected={selectedCarpark?.carpark_number === cp.carpark_number}
            onSelect={() => onSelectCarpark(cp)}
          />
        ))}

        {/* Route Polyline Overlay */}
        {routeGeometry && (
          <Source id="route" type="geojson" data={{ type: "Feature", properties: {}, geometry: routeGeometry }}>
            <Layer
              id="route-line"
              type="line"
              layout={{ "line-cap": "round", "line-join": "round" }}
              paint={{ "line-color": "#2563eb", "line-width": 6, "line-opacity": 0.85 }}
            />
          </Source>
        )}
      </Map>

      {/* Route fetch error notice */}
      {routeError && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold px-3 py-2 rounded-lg shadow-md z-20">
          Couldn't load driving directions right now. You can still navigate via the "External Navigate" link.
        </div>
      )}

      {/* Live Availability Legend on Map */}
      <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-md px-3 py-2.5 rounded-lg shadow-md text-xs font-medium space-y-1.5 border border-gray-100 z-10 max-w-[150px]">
        <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">Lots Available</div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block border border-white"></span>
          <span>High (&gt; 40%)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-orange-500 inline-block border border-white"></span>
          <span>Moderate (&lt; 40%)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-red-500 inline-block border border-white"></span>
          <span>Full / Very Low</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-slate-500 inline-block border border-white"></span>
          <span>Rates only, no feed</span>
        </div>
      </div>
    </div>
  );
}
