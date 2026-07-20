import React, { useMemo } from "react";
import { Carpark } from "../types.ts";
import { Car, MapPin, WifiOff } from "lucide-react";

interface OfflineMapPreviewProps {
  userLocation: { lat: number; lng: number };
  destination: { lat: number; lng: number; name: string } | null;
  carparks: Carpark[];
  selectedCarpark: Carpark | null;
  onSelectCarpark: (carpark: Carpark) => void;
}

// Rough Singapore-wide bounding box used to project lat/lng onto a schematic canvas.
// This isn't a real map — it's a lightweight, honest fallback that works without a Maps API key.
const SG_BOUNDS = { minLat: 1.20, maxLat: 1.47, minLng: 103.60, maxLng: 104.05 };

function project(lat: number, lng: number, width: number, height: number) {
  const x = ((lng - SG_BOUNDS.minLng) / (SG_BOUNDS.maxLng - SG_BOUNDS.minLng)) * width;
  const y = height - ((lat - SG_BOUNDS.minLat) / (SG_BOUNDS.maxLat - SG_BOUNDS.minLat)) * height;
  return { x, y };
}

export default function OfflineMapPreview({
  userLocation,
  destination,
  carparks,
  selectedCarpark,
  onSelectCarpark,
}: OfflineMapPreviewProps) {
  const width = 600;
  const height = 500;

  const userPos = useMemo(() => project(userLocation.lat, userLocation.lng, width, height), [userLocation]);
  const destPos = useMemo(
    () => (destination ? project(destination.lat, destination.lng, width, height) : null),
    [destination]
  );
  const carparkPositions = useMemo(
    () => carparks.map((cp) => ({ cp, pos: project(cp.lat, cp.lng, width, height) })),
    [carparks]
  );

  return (
    <div className="w-full h-full relative bg-slate-100 flex flex-col">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border-b border-amber-200 text-amber-800 text-xs font-semibold flex-shrink-0">
        <WifiOff className="w-3.5 h-3.5 flex-shrink-0" />
        Offline schematic preview — approximate positions only, no live imagery or routing. Add a Google Maps key for the real map.
      </div>

      <div className="flex-1 relative overflow-hidden">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
          <rect width={width} height={height} fill="#e2e8f0" />
          {/* Faint grid to suggest a map without pretending to be one */}
          {Array.from({ length: 10 }).map((_, i) => (
            <line key={`v${i}`} x1={(i * width) / 10} y1={0} x2={(i * width) / 10} y2={height} stroke="#cbd5e1" strokeWidth={1} />
          ))}
          {Array.from({ length: 8 }).map((_, i) => (
            <line key={`h${i}`} x1={0} y1={(i * height) / 8} x2={width} y2={(i * height) / 8} stroke="#cbd5e1" strokeWidth={1} />
          ))}

          {/* Carpark pins */}
          {carparkPositions.map(({ cp, pos }) => {
            const isSelected = selectedCarpark?.carpark_number === cp.carpark_number;
            const hasLiveAvailability = cp.total_lots > 0 && cp.lots_available >= 0;
            const percentage = hasLiveAvailability ? (cp.lots_available / cp.total_lots) * 100 : 0;
            
            let fill = "#10b981";
            if (!hasLiveAvailability) fill = "#64748b";
            else if (cp.lots_available === 0) fill = "#ef4444";
            else if (cp.lots_available < 15 || percentage < 15) fill = "#f97316";

            return (
              <g
                key={cp.carpark_number}
                transform={`translate(${pos.x}, ${pos.y})`}
                onClick={() => onSelectCarpark(cp)}
                className="cursor-pointer"
              >
                <circle r={isSelected ? 9 : 7} fill={fill} stroke="#fff" strokeWidth={2} />
                <text y={-12} textAnchor="middle" fontSize={9} fontWeight={700} fill="#1e293b">
                  {hasLiveAvailability ? cp.lots_available : "$"}
                </text>
              </g>
            );
          })}

          {/* Destination pin */}
          {destPos && (
            <g transform={`translate(${destPos.x}, ${destPos.y})`}>
              <circle r={10} fill="#e11d48" stroke="#fff" strokeWidth={2} />
              <circle r={16} fill="none" stroke="#e11d48" strokeWidth={1.5} opacity={0.5} />
            </g>
          )}

          {/* User location pin */}
          <g transform={`translate(${userPos.x}, ${userPos.y})`}>
            <circle r={9} fill="#2563eb" stroke="#fff" strokeWidth={2} />
          </g>
        </svg>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-md px-3 py-2.5 rounded-lg shadow-md text-xs font-medium space-y-1.5 border border-gray-100 z-10">
        <div className="flex items-center gap-2">
          <Car className="w-3 h-3 text-blue-600" /> <span>Your location</span>
        </div>
        {destination && (
          <div className="flex items-center gap-2">
            <MapPin className="w-3 h-3 text-rose-600" /> <span>{destination.name}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> <span>Carpark, lots free</span>
        </div>
      </div>
    </div>
  );
}
