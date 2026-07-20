import React from "react";
import { motion } from "motion/react";
import { X, Layers, CreditCard, Tag, Database, HelpCircle, ShieldCheck, Landmark } from "lucide-react";

interface ReferenceGuideProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ReferenceGuide({ isOpen, onClose }: ReferenceGuideProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-md"
      />

      {/* Modal Container */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ type: "spring", duration: 0.4 }}
        className="relative bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col z-10"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600/10 p-2.5 rounded-2xl text-blue-600 shadow-sm">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-800 uppercase tracking-tight">
                SG Carpark Reference Guide
              </h2>
              <p className="text-[11px] text-slate-500 font-medium">
                Official classifications, systems & live data sources
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-all"
            title="Close Guide"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Grid Layout for Sections */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Section 1: Carpark Types */}
            <div className="bg-slate-50/50 border border-slate-100 p-5 rounded-2xl space-y-4">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-600" />
                Carpark Types
              </h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3 text-xs">
                  <span className="font-bold bg-blue-100/60 text-blue-800 px-2.5 py-0.5 rounded-lg text-[10px] uppercase font-mono mt-0.5">
                    Surface
                  </span>
                  <div>
                    <h4 className="font-semibold text-slate-700">Open-air</h4>
                    <p className="text-[11px] text-slate-500">Parking at ground level without vertical structures.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 text-xs">
                  <span className="font-bold bg-blue-100/60 text-blue-800 px-2.5 py-0.5 rounded-lg text-[10px] uppercase font-mono mt-0.5">
                    Multi-Storey
                  </span>
                  <div>
                    <h4 className="font-semibold text-slate-700">Multi-level</h4>
                    <p className="text-[11px] text-slate-500">Dedicated parking buildings with multiple levels, common in HDB estates.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 text-xs">
                  <span className="font-bold bg-blue-100/60 text-blue-800 px-2.5 py-0.5 rounded-lg text-[10px] uppercase font-mono mt-0.5">
                    Basement
                  </span>
                  <div>
                    <h4 className="font-semibold text-slate-700">Underground</h4>
                    <p className="text-[11px] text-slate-500">Subterranean facilities below buildings, completely sheltered.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 text-xs">
                  <span className="font-bold bg-blue-100/60 text-blue-800 px-2.5 py-0.5 rounded-lg text-[10px] uppercase font-mono mt-0.5">
                    Covered
                  </span>
                  <div>
                    <h4 className="font-semibold text-slate-700">Sheltered</h4>
                    <p className="text-[11px] text-slate-500">Roofed parking spots that are not fully enclosed buildings.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 text-xs">
                  <span className="font-bold bg-blue-100/60 text-blue-800 px-2.5 py-0.5 rounded-lg text-[10px] uppercase font-mono mt-0.5">
                    Mechanised
                  </span>
                  <div>
                    <h4 className="font-semibold text-slate-700">Automated</h4>
                    <p className="text-[11px] text-slate-500">High-density computerized system that moves cars via lifts/pallets.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Section 2: Parking Systems */}
            <div className="bg-slate-50/50 border border-slate-100 p-5 rounded-2xl space-y-4">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-blue-600" />
                Parking Systems
              </h3>
              <div className="space-y-4">
                <div className="flex items-start gap-3 text-xs">
                  <span className="font-bold bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-lg text-[10px] uppercase font-mono mt-0.5 whitespace-nowrap">
                    Electronic
                  </span>
                  <div>
                    <h4 className="font-semibold text-slate-700">Cashless ERP / EPS</h4>
                    <p className="text-[11px] text-slate-500 leading-normal">
                      Uses automated cashless reader systems (In-Vehicle Unit / ERP) with CashCard, Autopass, or Parking Apps. Charges are calculated dynamically per minute.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 text-xs">
                  <span className="font-bold bg-purple-100 text-purple-800 px-2.5 py-0.5 rounded-lg text-[10px] uppercase font-mono mt-0.5 whitespace-nowrap">
                    Coupon
                  </span>
                  <div>
                    <h4 className="font-semibold text-slate-700">Physical Coupons</h4>
                    <p className="text-[11px] text-slate-500 leading-normal">
                      Requires paper parking coupons purchased in advance from authorized agents. Drivers tear tabs representing exact date, hour, and duration.
                    </p>
                  </div>
                </div>
              </div>

              {/* Lot Types Section within right column */}
              <div className="pt-4 border-t border-slate-100 space-y-3.5">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <Tag className="w-4 h-4 text-blue-600" />
                  Lot Classifications
                </h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-2 p-2 bg-white rounded-xl border border-slate-100">
                    <span className="font-bold bg-slate-100 text-slate-700 w-6 h-6 rounded-lg flex items-center justify-center font-mono text-[11px]">
                      C
                    </span>
                    <span className="font-medium text-slate-600">Standard Cars</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 bg-white rounded-xl border border-slate-100">
                    <span className="font-bold bg-slate-100 text-slate-700 w-6 h-6 rounded-lg flex items-center justify-center font-mono text-[11px]">
                      M
                    </span>
                    <span className="font-medium text-slate-600">Motorcycles</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 bg-white rounded-xl border border-slate-100">
                    <span className="font-bold bg-slate-100 text-slate-700 w-6 h-6 rounded-lg flex items-center justify-center font-mono text-[11px]">
                      H
                    </span>
                    <span className="font-medium text-slate-600">Heavy Vehicles</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 bg-white rounded-xl border border-slate-100">
                    <span className="font-bold bg-slate-100 text-slate-700 w-6 h-6 rounded-lg flex items-center justify-center font-mono text-[11px]">
                      Y
                    </span>
                    <span className="font-medium text-slate-600">Short Term</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 bg-white rounded-xl border border-slate-100 col-span-2">
                    <span className="font-bold bg-slate-100 text-slate-700 w-6 h-6 rounded-lg flex items-center justify-center font-mono text-[11px] flex-shrink-0">
                      L
                    </span>
                    <span className="font-medium text-slate-600">Whole Day Parking Available</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Data Sources Section */}
          <div className="bg-blue-50/30 border border-blue-100/50 p-5 rounded-2xl space-y-4">
            <h3 className="text-xs font-bold text-blue-900 uppercase tracking-wider flex items-center gap-2">
              <Database className="w-4 h-4 text-blue-600" />
              Singapore Government Open Data Sources
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  Carpark Information API
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Provides comprehensive static metadata about all parking facilities in Singapore, including address, gantry height limits, coordinates, and parking system specifications. (Converts SVY21 coordinate projections to standard WGS84 GPS).
                </p>
                <div className="pt-1.5">
                  <a
                    href="https://data.gov.sg"
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-[10px] text-blue-600 font-bold uppercase hover:underline inline-flex items-center gap-1"
                  >
                    <Landmark className="w-3 h-3" /> data.gov.sg portal
                  </a>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  Carpark Availability API
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Fetches live occupancy and space metrics updated every 1 minute. Sourced directly from the Singapore Land Transport Authority (LTA) and Housing & Development Board (HDB) sensors.
                </p>
                <div className="pt-1.5">
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-lg font-bold">
                    Updated Every 1m
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 p-5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 font-medium">
          <span>SG Carpark Finder © 2026</span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            Real-time Sensor Feed Online
          </span>
        </div>
      </motion.div>
    </div>
  );
}
