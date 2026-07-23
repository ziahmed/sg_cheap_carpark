export interface Carpark {
  carpark_number: string;
  address: string;
  lat: number;
  lng: number;
  total_lots: number;
  lots_available: number;
  lot_type: string;
  update_datetime: string;
  car_park_type: string;
  type_of_parking_system: string;
  short_term_parking: string;
  free_parking: string;
  night_parking: string;
  gantry_height: number;
  car_park_basement: string;
  agency: 'HDB' | 'LTA' | 'URA' | 'MALL' | 'OSM' | 'OFFICE' | 'HOTEL' | 'HOSPITAL' | 'PRIVATE';
  price_rate: string;
  price_details?: {
    weekday_day?: string;
    weekday_night?: string;
    weekend_day?: string;
    weekend_night?: string;
  };
  is_central: boolean;
  distance_meters?: number; // optionally computed on-demand
}

export interface UserAlert {
  id: string;
  carpark_number: string;
  carpark_address: string;
  target_lots_available: number;
  target_price_change: boolean;
  created_at: number;
  is_triggered: boolean;
  triggered_reason?: string;
  current_lots_when_set: number;
  current_lots_now?: number;
}

export interface SearchHistory {
  id: string;
  query: string;
  lat: number;
  lng: number;
  timestamp: number;
}

export interface AssistantMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}
