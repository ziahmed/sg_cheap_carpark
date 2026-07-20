import React, { useState, useEffect, useRef } from "react";
import { Carpark, AssistantMessage } from "../types.ts";
import { Sparkles, MessageSquare, Send, Bot, RefreshCw, Car, ThumbsUp, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface SmartAssistantProps {
  destinationName: string | null;
  nearbyCarparks: Carpark[];
  onSelectCarparkByNumber: (num: string) => void;
}

export default function SmartAssistant({
  destinationName,
  nearbyCarparks,
  onSelectCarparkByNumber,
}: SmartAssistantProps) {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // When destination changes, auto-generate initial greeting & recommend prompt
  useEffect(() => {
    if (destinationName) {
      setMessages([
        {
          role: "assistant",
          content: `Hello! I see you are planning a trip to **${destinationName}** in Singapore.
I have analyzed **${nearbyCarparks.length} nearby parking lots** and estimated their pricing, real-time vacancies, and heights.

Would you like me to analyze these options and recommend the smartest parking spot for your drive? Click the **"Ask Smart Assistant"** button below!`,
          timestamp: Date.now(),
        },
      ]);
    } else {
      setMessages([
        {
          role: "assistant",
          content: `Hi there! Enter a destination in Singapore above (like *Orchard Road*, *Marina Bay Sands*, or *VivoCity*), and I will help you find the closest, cheapest, and most vacant parking lot.
          
Once you search a location, I can compare rates, walking distances, and occupancy trends to find the ideal spot!`,
          timestamp: Date.now(),
        },
      ]);
    }
  }, [destinationName, nearbyCarparks.length]);

  const requestRecommendation = async (customQuery?: string) => {
    if (!destinationName || nearbyCarparks.length === 0) return;

    setLoading(true);
    setError(null);

    const userPrompt = customQuery || "Please analyze and suggest the absolute best parking lot for my trip.";

    // Add user message to log
    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        content: userPrompt,
        timestamp: Date.now(),
      },
    ]);

    try {
      const response = await fetch("/api/parking-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destination: destinationName,
          carparks: nearbyCarparks,
          query: userPrompt,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to consult parking assistant");
      }

      const data = await response.json();

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.recommendation || "I analyzed the options but couldn't form a detailed breakdown. Please try again.",
          timestamp: Date.now(),
        },
      ]);
    } catch (err: any) {
      console.error(err);
      setError("Failed to connect with smart advisor. Please try again in a moment.");
    } finally {
      setLoading(false);
    }
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || loading) return;

    requestRecommendation(inputMessage);
    setInputMessage("");
  };

  return (
    <div className="bg-white flex flex-col flex-1 h-full text-gray-800 min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-gray-100 p-4">
        <div className="flex items-center gap-2">
          <div className="bg-blue-50 p-2 rounded-xl border border-blue-100">
            <Sparkles className="w-4 h-4 text-blue-600 fill-blue-50" />
          </div>
          <div>
            <h3 className="font-bold text-xs text-gray-900 leading-tight flex items-center gap-1.5">
              AI Parking Assistant
              <span className="bg-blue-100 text-blue-800 text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase">
                AI Powered
              </span>
            </h3>
            <p className="text-[11px] text-gray-500">Intelligent rates & occupancy guidance</p>
          </div>
        </div>

        {destinationName && nearbyCarparks.length > 0 && (
          <button
            onClick={() => requestRecommendation()}
            disabled={loading}
            className="text-[11px] bg-blue-600 hover:bg-blue-700 disabled:bg-gray-100 disabled:text-gray-400 text-white font-bold py-1.5 px-3 rounded-xl flex items-center gap-1 shadow-xs transition-all flex-shrink-0"
          >
            <Bot className="w-3.5 h-3.5" /> Ask Smart Assistant
          </button>
        )}
      </div>

      {/* Messages Panel */}
      <div className="flex-1 overflow-y-auto py-3 space-y-3 min-h-0 pr-1 p-4">
        {messages.map((msg, idx) => {
          const isUser = msg.role === "user";
          return (
            <div
              key={idx}
              className={`flex gap-2.5 ${isUser ? "justify-end" : "justify-start"}`}
            >
              {!isUser && (
                <div className="w-7 h-7 rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center text-blue-600 flex-shrink-0 mt-0.5 shadow-xs">
                  <Bot className="w-4 h-4" />
                </div>
              )}
              <div
                className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed space-y-1.5 shadow-xs ${
                  isUser
                    ? "bg-blue-600 text-white rounded-br-none font-medium"
                    : "bg-gray-50 border border-gray-100 text-gray-700 rounded-bl-none"
                }`}
              >
                {/* Parse basic markdown format (bold and list items) safely */}
                <div className="whitespace-pre-wrap break-words">
                  {msg.content.split("\n").map((line, lIdx) => {
                    // Check for lists
                    let styledLine = line;
                    let isListItem = line.trim().startsWith("-") || line.trim().startsWith("*");
                    if (isListItem) {
                      styledLine = line.trim().substring(1).trim();
                    }

                    // Simple bold parse
                    const boldRegex = /\*\*(.*?)\*\*/g;
                    const parts = [];
                    let lastIndex = 0;
                    let match;

                    while ((match = boldRegex.exec(styledLine)) !== null) {
                      const textBefore = styledLine.substring(lastIndex, match.index);
                      if (textBefore) parts.push(textBefore);
                      parts.push(
                        <strong key={match.index} className={isUser ? "text-white" : "text-gray-900 font-bold"}>
                          {match[1]}
                        </strong>
                      );
                      lastIndex = boldRegex.lastIndex;
                    }
                    const textRemaining = styledLine.substring(lastIndex);
                    if (textRemaining) parts.push(textRemaining);

                    return (
                      <p key={lIdx} className={isListItem ? "pl-3 relative before:content-['•'] before:absolute before:left-0 before:text-blue-500 font-normal" : "font-normal"}>
                        {parts.length > 0 ? parts : styledLine}
                      </p>
                    );
                  })}
                </div>

                {/* Offer actionable buttons inside assistant answers */}
                {!isUser && idx > 0 && (
                  <div className="mt-2.5 pt-2 border-t border-gray-200/50 flex items-center gap-3 text-[10px] text-gray-400 font-medium">
                    <span className="flex items-center gap-0.5 text-blue-600 font-semibold">
                      <ThumbsUp className="w-3 h-3" /> helpful advice
                    </span>
                    <span>•</span>
                    <span>Matched with LTA real-time feed</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Loading Bubble */}
        {loading && (
          <div className="flex gap-2.5 justify-start">
            <div className="w-7 h-7 rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center text-blue-600 flex-shrink-0 animate-pulse">
              <Bot className="w-4 h-4" />
            </div>
            <div className="bg-gray-50 border border-gray-100 text-gray-700 max-w-[85%] rounded-xl rounded-bl-none px-4 py-3 text-xs flex items-center gap-2">
              <div className="flex space-x-1">
                <div className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce"></div>
                <div className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                <div className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce [animation-delay:0.4s]"></div>
              </div>
              <span className="font-semibold text-[11px] text-gray-400">Gemini is analyzing walking paths and prices...</span>
            </div>
          </div>
        )}

        {/* Error Notification */}
        {error && (
          <div className="bg-red-50 text-red-700 p-3 rounded-lg text-xs flex items-start gap-1.5 border border-red-200">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 text-red-500 mt-0.5" />
            <div>{error}</div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Input box */}
      <form onSubmit={handleSend} className="p-4 border-t border-gray-100 flex gap-2">
        <input
          type="text"
          placeholder={destinationName ? "Ask about height, free parking hours..." : "Select a destination to start chatting..."}
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          disabled={!destinationName || loading}
          className="flex-1 text-xs border border-gray-200 rounded-full px-4 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-400 shadow-xs"
        />
        <button
          type="submit"
          disabled={!destinationName || !inputMessage.trim() || loading}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-100 disabled:text-gray-400 text-white rounded-full p-2.5 transition-all shadow-xs flex-shrink-0 flex items-center justify-center"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
