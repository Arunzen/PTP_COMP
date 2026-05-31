// Curated safety net (Backend.md §6/§8). When live data or the LLM fails,
// the engine returns one of these so the demo NEVER dies. Always degraded:true.
// Ported from the v1 deterministic engine; coordinates are real so the map renders.

const CURATED = {
  lisbon: {
    city: "Lisbon",
    summary: "A classic Lisbon day, rain or shine",
    stops: [
      { id: "f1", time: "09:30", title: "Jerónimos Monastery", type: "indoor", why: "Manueline cloisters before crowds", cost: "€", lat: 38.6979, lng: -9.2065, durationMin: 75, travelFromPrevMin: 0 },
      { id: "f2", time: "11:30", title: "Pastéis de Belém", type: "food", why: "the original 1837 custard tarts", cost: "€", lat: 38.6975, lng: -9.2032, durationMin: 45, travelFromPrevMin: 8 },
      { id: "f3", time: "13:30", title: "Time Out Market", type: "food", why: "the city's best cooks under one roof", cost: "€€", lat: 38.7068, lng: -9.1459, durationMin: 75, travelFromPrevMin: 22 },
      { id: "f4", time: "15:30", title: "Alfama Walk", type: "outdoor", why: "tiled lanes of the oldest quarter", cost: "free", lat: 38.7128, lng: -9.1277, durationMin: 60, travelFromPrevMin: 15 },
      { id: "f5", time: "19:30", title: "Cervejaria Ramiro", type: "food", why: "legendary beer-hall seafood", cost: "€€€", lat: 38.7223, lng: -9.1356, durationMin: 90, travelFromPrevMin: 18 },
    ],
  },
  kyoto: {
    city: "Kyoto",
    summary: "Temples, market, and a riverside dinner",
    stops: [
      { id: "f1", time: "09:30", title: "Kiyomizu-dera", type: "outdoor", why: "hillside temple stage at opening", cost: "€", lat: 34.9949, lng: 135.785, durationMin: 75, travelFromPrevMin: 0 },
      { id: "f2", time: "11:30", title: "Gion District Walk", type: "outdoor", why: "wooden teahouse lanes", cost: "free", lat: 35.0037, lng: 135.7752, durationMin: 60, travelFromPrevMin: 15 },
      { id: "f3", time: "13:30", title: "Nishiki Market", type: "food", why: "“Kyoto's Kitchen” for lunch", cost: "€€", lat: 35.005, lng: 135.7649, durationMin: 60, travelFromPrevMin: 12 },
      { id: "f4", time: "15:30", title: "Nijo Castle", type: "indoor", why: "shogun's castle, nightingale floors", cost: "€", lat: 35.0142, lng: 135.7481, durationMin: 75, travelFromPrevMin: 18 },
      { id: "f5", time: "19:30", title: "Pontocho Alley", type: "food", why: "lantern-lit dining over the river", cost: "€€€", lat: 35.0048, lng: 135.7706, durationMin: 90, travelFromPrevMin: 20 },
    ],
  },
};

// Synthesize a neutral 24-hour forecast so the ConditionsStrip has something to show.
function neutralWeather() {
  const hourly = [];
  for (let h = 0; h < 24; h++) {
    hourly.push({ hour: h, rainProb: 10, tempC: h < 7 || h > 20 ? 15 : 21 });
  }
  return { summary: "Live weather unavailable — showing a curated plan.", hourly };
}

function normalizeCity(city) {
  const c = String(city || "").toLowerCase();
  if (c.includes("kyoto") || c.includes("japan")) return "kyoto";
  return "lisbon"; // default
}

// Returns a valid Itinerary (degraded:true). `prefs` is accepted for signature
// parity with the live engine but the curated plan is intentionally fixed.
export function fallbackItinerary(city /*, prefs */) {
  const key = normalizeCity(city);
  const base = CURATED[key];
  return {
    city: base.city,
    summary: base.summary,
    weather: neutralWeather(),
    stops: base.stops.map((s) => ({ ...s })),
    degraded: true,
  };
}

// Reroute fallback: keep the curated stops, add a generic-but-honest explanation.
export function fallbackReroute(city, disruption) {
  const it = fallbackItinerary(city);
  const msg = {
    rain: "Live re-planning is unavailable, so I've kept a rain-friendly curated plan.",
    closed: "Live re-planning is unavailable — showing a curated plan instead.",
    behind: "Live re-planning is unavailable — here's a curated plan that still ends with dinner.",
    weather: "Live weather re-planning is unavailable — showing a curated plan.",
  };
  return {
    ...it,
    change_summary: msg[disruption] || msg.closed,
    changed_ids: [],
  };
}
