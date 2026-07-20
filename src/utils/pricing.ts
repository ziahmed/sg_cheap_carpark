import { Carpark } from "../types.ts";

/**
 * Gets the active parking rate for a carpark based on the current day and time.
 * Takes note of weekday vs weekend and day vs night.
 */
export function getActiveRate(carpark: Carpark): { rate: string; periodLabel: string } {
  if (carpark.agency !== "MALL" || !carpark.price_details) {
    if (carpark.agency === "HDB") {
      const now = new Date();
      const day = now.getDay(); // 0 = Sun, 6 = Sat
      const hour = now.getHours();
      const isCentral = carpark.is_central;

      if (isCentral) {
        // Mon-Sat 7am-5pm: $1.20/30m
        const isSunday = day === 0;
        const isDaytime = hour >= 7 && hour < 17;
        if (!isSunday && isDaytime) {
          return { rate: "$1.20 / 30m", periodLabel: "Mon-Sat Day" };
        } else {
          return { rate: "$0.60 / 30m", periodLabel: "Off-Peak Central" };
        }
      } else {
        return { rate: "$0.60 / 30m", periodLabel: "Standard Rate" };
      }
    }
    
    // Fallback/Default
    return { rate: carpark.price_rate || "Rates Only", periodLabel: "Standard Rate" };
  }

  // It's a Mall with price_details
  const now = new Date();
  const day = now.getDay(); // 0 = Sun, 6 = Sat
  const hour = now.getHours();

  const isWeekend = day === 0 || day === 6; // Sat or Sun
  
  // Malls usually switch night rates around 5 PM or 6 PM.
  // We'll use 5:00 PM (17:00) as the threshold.
  const isNightTime = hour >= 17 || hour < 7;

  const details = carpark.price_details;

  if (isWeekend) {
    if (isNightTime && details.weekend_night) {
      return { rate: details.weekend_night, periodLabel: "Weekend Night" };
    }
    return { rate: details.weekend_day || details.weekend_night || carpark.price_rate, periodLabel: "Weekend Day" };
  } else {
    if (isNightTime && details.weekday_night) {
      return { rate: details.weekday_night, periodLabel: "Weekday Night" };
    }
    return { rate: details.weekday_day || details.weekday_night || carpark.price_rate, periodLabel: "Weekday Day" };
  }
}

/**
 * Gets a shortened, highly compact version of the rate for badges / lists.
 */
export function getShortRateLabel(carpark: Carpark): string {
  if (carpark.agency === "HDB") {
    return carpark.is_central ? "$1.20/30m" : "$0.60/30m";
  }
  
  const active = getActiveRate(carpark);
  
  // Format long mall rates to be more compact
  let label = active.rate;
  
  // Common cleanups
  label = label.replace(/per hour/gi, "/hr");
  label = label.replace(/per hr/gi, "/hr");
  label = label.replace(/per 30 mins/gi, "/30m");
  label = label.replace(/per 30-mins/gi, "/30m");
  label = label.replace(/for first/gi, "1st");
  label = label.replace(/for 1st/gi, "1st");
  label = label.replace(/then/gi, "");
  label = label.replace(/per entry/gi, "/entry");
  label = label.replace(/flat rate/gi, "");
  label = label.replace(/after 5pm/gi, "");
  label = label.replace(/after 10pm/gi, "");
  
  // Truncate if still too long for inline preview
  if (label.length > 28) {
    return label.substring(0, 26) + "...";
  }
  
  return label;
}
