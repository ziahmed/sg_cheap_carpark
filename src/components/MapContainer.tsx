import React, { useEffect, useRef, useState } from "react";
import { Map, AdvancedMarker, Pin, InfoWindow, useMap, useMapsLibrary, useAdvancedMarkerRef } from "@vis.gl/react-google-maps";
import { Carpark } from "../types.ts";
import { MapPin, Navigation, Info, Car } from "lucide-react";

interface MapContainerProps {
  userLocation: { lat: number; lng: number };
  destination: { lat: number; lng: number; name: string } | null;
  carparks: Carpark[];
  selectedCarpark: Carpark | null;
  onSelectCarpark: (carpark: Carpark) => void;
  showRoute: boolean;
  onRouteComputed?: (info: { distance: string; duration: string }) => void;
}

// Sub-component to compute and display route polylines using modern Routes API
function RouteDisplay({
  origin,
  destination,
  onRouteComputed,
}: {
  origin: google.maps.LatLngLiteral;
  destination: google.maps.LatLngLiteral;
  onRouteComputed?: (info: { distance: string; duration: string }) => void;
}) {
  const map = useMap();
  const routesLib = useMapsLibrary("routes");
  const polylinesRef = useRef<google.maps.Polyline[]>([]);

  useEffect(() => {
    if (!routesLib || !map || !origin || !destination) return;

    // Clear previous routes
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];

    routesLib.Route.computeRoutes({
      origin,
      destination,
      travelMode: "DRIVING",
      fields: ["path", "distanceMeters", "durationMillis", "viewport"],
    })
      .then(({ routes }) => {
        if (routes?.[0]) {
          const newPolylines = routes[0].createPolylines();
          newPolylines.forEach((p) => {
            // Style the route line beautifully
            p.setOptions({
              strokeColor: "#2563eb", // Blue 600
              strokeOpacity: 0.85,
              strokeWeight: 6,
            });
            p.setMap(map);
          });
          polylinesRef.current = newPolylines;

          // Compute readable distance and duration
          const distanceMeters = routes[0].distanceMeters || 0;
          const durationMillis = typeof routes[0].durationMillis === "number"
            ? routes[0].durationMillis
            : parseInt(routes[0].durationMillis as any) || 0;

          const distanceStr = distanceMeters >= 1000 
            ? `${(distanceMeters / 1000).toFixed(1)} km` 
            : `${distanceMeters} m`;
          
          const durationMinutes = Math.ceil(durationMillis / 60000);
          const durationStr = `${durationMinutes} mins`;

          if (onRouteComputed) {
            onRouteComputed({ distance: distanceStr, duration: durationStr });
          }

          if (routes[0].viewport) {
            map.fitBounds(routes[0].viewport);
          }
        }
      })
      .catch((err) => {
        console.error("Error computing route: ", err);
      });

    return () => {
      polylinesRef.current.forEach((p) => p.setMap(null));
    };
  }, [routesLib, map, origin, destination]);

  return null;
}

// Marker with InfoWindow
interface CarparkMarkerProps {
  key?: string;
  carpark: Carpark;
  isSelected: boolean;
  onSelect: () => void;
}

function CarparkMarker({
  carpark,
  isSelected,
  onSelect,
}: CarparkMarkerProps) {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const [infoOpen, setInfoOpen] = useState(false);

  // Close info window when selected states change or when clicking on other items
  useEffect(() => {
    if (isSelected) {
      setInfoOpen(true);
    } else {
      setInfoOpen(false);
    }
  }, [isSelected]);

  // Determine Pin Colors based on real-time lot availability
  const percentage = (carpark.lots_available / carpark.total_lots) * 100;
  let pinColor = "#10b981"; // Green (high availability)
  let glyphColor = "#ffffff";

  if (carpark.lots_available === 0) {
    pinColor = "#ef4444"; // Red (Full)
  } else if (carpark.lots_available < 15 || percentage < 15) {
    pinColor = "#f97316"; // Orange (Filling fast)
  }

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: carpark.lat, lng: carpark.lng }}
        onClick={() => {
          onSelect();
          setInfoOpen(true);
        }}
      >
        <Pin background={pinColor} glyphColor={glyphColor} scale={isSelected ? 1.2 : 1.0}>
          <div className="text-[10px] font-mono font-bold text-white px-1">
            {carpark.lots_available}
          </div>
        </Pin>
      </AdvancedMarker>

      {infoOpen && (
        <InfoWindow
          anchor={marker}
          onCloseClick={() => setInfoOpen(false)}
          headerDisabled={false}
        >
          <div className="p-1 max-w-[220px] text-gray-800">
            <h4 className="font-bold text-sm leading-tight text-gray-900 border-b pb-1 mb-1 flex items-center gap-1">
              <Car className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
              {carpark.address}
            </h4>
            <div className="space-y-1 text-xs">
              <p className="flex justify-between">
                <span className="text-gray-500">Available Lots:</span>
                <span className="font-mono font-bold text-blue-600">
                  {carpark.lots_available} / {carpark.total_lots}
                </span>
              </p>
              <p className="flex justify-between">
                <span className="text-gray-500">Rate:</span>
                <span className="font-semibold text-right">
                  {carpark.agency === "MALL" ? "Mall Rates" : carpark.is_central ? "Central ($1.20/30m)" : "$0.60/30m"}
                </span>
              </p>
              {carpark.free_parking && carpark.free_parking !== "NO" && (
                <p className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-medium mt-1 inline-block">
                  🎁 Free Sun/PH: {carpark.free_parking}
                </p>
              )}
              {carpark.gantry_height > 0 && (
                <p className="text-[10px] text-gray-500">
                  ⚠️ Height limit: {carpark.gantry_height}m
                </p>
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
        </InfoWindow>
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
  const map = useMap();

  // Adjust bounds when destination or list of carparks changes
  useEffect(() => {
    if (!map) return;

    if (destination) {
      // Fit around destination and nearby carparks
      const bounds = new google.maps.LatLngBounds();
      bounds.extend(destination);
      bounds.extend(userLocation);
      
      // Extend map bounds to include top 3 closest carparks
      carparks.slice(0, 3).forEach((cp) => {
        bounds.extend({ lat: cp.lat, lng: cp.lng });
      });

      map.fitBounds(bounds, 50); // padding
    } else {
      // Zoom out or centre back to user's location
      map.setCenter(userLocation);
      map.setZoom(14);
    }
  }, [map, destination, userLocation, carparks]);

  return (
    <div className="w-full h-full relative" id="gmp-carpark-map">
      <Map
        defaultCenter={userLocation}
        defaultZoom={14}
        mapId="DEMO_MAP_ID"
        internalUsageAttributionIds={["gmp_mcp_codeassist_v1_aistudio"]}
        style={{ width: "100%", height: "100%" }}
        gestureHandling="greedy"
        disableDefaultUI={false}
      >
        {/* User Current Location Marker */}
        <AdvancedMarker position={userLocation}>
          <div className="relative flex items-center justify-center">
            <span className="absolute inline-flex h-6 w-6 rounded-full bg-blue-400 opacity-75 animate-ping"></span>
            <div className="relative bg-blue-600 border-2 border-white rounded-full p-2 text-white shadow-lg">
              <Car className="w-4 h-4" />
            </div>
          </div>
        </AdvancedMarker>

        {/* Selected Destination Marker */}
        {destination && (
          <AdvancedMarker position={{ lat: destination.lat, lng: destination.lng }}>
            <div className="bg-rose-600 border border-rose-500 text-white rounded-lg px-2.5 py-1.5 shadow-xl flex items-center gap-1.5 transform -translate-y-full">
              <MapPin className="w-4 h-4 text-white fill-current" />
              <span className="text-xs font-bold whitespace-nowrap">{destination.name}</span>
            </div>
          </AdvancedMarker>
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
        {showRoute && selectedCarpark && (
          <RouteDisplay
            origin={userLocation}
            destination={{ lat: selectedCarpark.lat, lng: selectedCarpark.lng }}
            onRouteComputed={onRouteComputed}
          />
        )}
      </Map>

      {/* Live Availability Legend on Map */}
      <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-md px-3 py-2.5 rounded-lg shadow-md text-xs font-medium space-y-1.5 border border-gray-100 z-10 max-w-[150px]">
        <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">
          Lots Available
        </div>
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
      </div>
    </div>
  );
}
