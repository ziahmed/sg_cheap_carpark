import React, { useState } from "react";
import { UserAlert, Carpark } from "../types.ts";
import { Bell, BellOff, AlertTriangle, CheckCircle, ShieldCheck, Play, Trash2, Clock } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface AlertManagerProps {
  alerts: UserAlert[];
  onAddAlert: (carpark: Carpark, threshold: number, priceChange: boolean) => void;
  onRemoveAlert: (id: string) => void;
  onTriggerAlertSimulated: (id: string, newLotsValue: number) => void;
  carparks: Carpark[];
}

export default function AlertManager({
  alerts,
  onAddAlert,
  onRemoveAlert,
  onTriggerAlertSimulated,
  carparks,
}: AlertManagerProps) {
  const [selectedCarparkNum, setSelectedCarparkNum] = useState("");
  const [thresholdLots, setThresholdLots] = useState(20);
  const [trackPrice, setTrackPrice] = useState(true);

  // Find carpark details for setting new alert
  const selectedCarpark = carparks.find((cp) => cp.carpark_number === selectedCarparkNum);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCarpark) return;
    onAddAlert(selectedCarpark, thresholdLots, trackPrice);
    setSelectedCarparkNum("");
  };

  return (
    <div className="bg-white flex flex-col flex-1 h-full text-gray-800 min-h-0">
      <div className="flex items-center gap-2 pb-3 border-b border-gray-100 p-4">
        <div className="bg-blue-50 p-2 rounded-xl border border-blue-100">
          <Bell className="w-4 h-4 text-blue-600 fill-blue-50" />
        </div>
        <div>
          <h3 className="font-bold text-xs text-gray-900 leading-tight">Price & Availability Alerts</h3>
          <p className="text-[11px] text-gray-500">Get notified when lots open up or rates change</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {/* Set Alert Form */}
        <form onSubmit={handleSubmit} className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-3.5">
          <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Configure New Smart Alert
          </h4>

          <div className="grid grid-cols-1 gap-3.5">
            {/* Carpark Selector */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Select Carpark
              </label>
              <select
                value={selectedCarparkNum}
                onChange={(e) => setSelectedCarparkNum(e.target.value)}
                className="w-full text-xs bg-white border border-slate-200 rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none font-medium"
                required
              >
                <option value="">-- Choose a Carpark --</option>
                {carparks.slice(0, 15).map((cp) => (
                  <option key={cp.carpark_number} value={cp.carpark_number}>
                    {cp.carpark_number} - {cp.address.slice(0, 30)}... ({cp.lots_available} free)
                  </option>
                ))}
              </select>
            </div>

            {/* Threshold Input */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Notify when available lots rise above
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={thresholdLots}
                  onChange={(e) => setThresholdLots(parseInt(e.target.value) || 10)}
                  className="w-full text-xs bg-white border border-slate-200 rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none font-mono font-bold"
                />
                <span className="text-xs text-slate-500 font-bold">lots</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1 gap-2">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={trackPrice}
                onChange={(e) => setTrackPrice(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
              />
              <span className="text-xs font-semibold text-slate-600">Track price changes</span>
            </label>

            <button
              type="submit"
              disabled={!selectedCarpark}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-100 disabled:text-gray-400 text-white font-bold text-xs py-2 px-4 rounded-xl shadow-md shadow-blue-100 transition-all flex items-center gap-1"
            >
              <Bell className="w-3.5 h-3.5" /> Enable Alert
            </button>
          </div>
        </form>

        {/* Active Alerts List */}
        <div className="space-y-2">
          <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex justify-between items-center">
            <span>Active Alerts ({alerts.length})</span>
            <span className="text-[10px] text-blue-600 font-medium font-sans">Clears when triggered</span>
          </h4>

          {alerts.length === 0 ? (
            <div className="text-center py-8 border border-dashed border-slate-200 rounded-2xl text-xs text-slate-400 space-y-1.5 bg-slate-50/50">
              <BellOff className="w-8 h-8 mx-auto text-slate-300" />
              <p className="font-semibold text-slate-500">No active alerts configured</p>
              <p className="text-[11px]">Select any carpark below and click "Track Lots Alert"</p>
            </div>
          ) : (
            <div className="space-y-2">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`p-3.5 rounded-2xl border text-xs flex justify-between items-start gap-2 transition-all ${
                    alert.is_triggered
                      ? "bg-amber-50 border-amber-200 text-amber-900"
                      : "bg-white border-slate-100 shadow-xs text-slate-700"
                  }`}
                >
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono bg-slate-100 text-slate-600 font-bold px-1.5 py-0.5 rounded text-[10px]">
                        {alert.carpark_number}
                      </span>
                      <span className="font-bold text-slate-800">{alert.carpark_address}</span>
                    </div>

                    <div className="text-[11px] text-slate-500 flex items-center gap-2 flex-wrap pt-0.5">
                      <span className="flex items-center gap-0.5">
                        🔔 Target: &gt; {alert.target_lots_available} lots
                      </span>
                      {alert.target_price_change && <span>| 💵 Price tracked</span>}
                      <span className="flex items-center gap-0.5 text-slate-400">
                        <Clock className="w-3 h-3" /> Set at {alert.current_lots_when_set} lots
                      </span>
                    </div>

                    {alert.is_triggered && (
                      <div className="mt-1.5 flex items-start gap-1 p-1.5 bg-amber-100/50 rounded-lg border border-amber-200 text-[11px] text-amber-800 leading-tight">
                        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 text-amber-600 mt-0.5" />
                        <div>
                          <strong>Triggered:</strong> {alert.triggered_reason}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions (Trigger Test and Delete) */}
                  <div className="flex items-center gap-1.5 self-center flex-shrink-0">
                    {!alert.is_triggered && (
                      <button
                        onClick={() => {
                          // Simulate lot count update to trigger this alert
                          onTriggerAlertSimulated(alert.id, alert.target_lots_available + 5);
                        }}
                        className="p-1.5 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-xl transition-all border border-amber-200 flex items-center gap-1 text-[10px] font-bold"
                        title="Dev preview only: simulate a lot release to test this alert (not a real vacancy update)"
                      >
                        <Play className="w-3 h-3 fill-amber-600 text-amber-600" />
                        Simulate (test)
                      </button>
                    )}
                    <button
                      onClick={() => onRemoveAlert(alert.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 rounded-xl transition-all hover:bg-red-50"
                      title="Delete Alert"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
