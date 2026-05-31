// Orchestration pipeline (Backend.md §4). Thin handlers call plan()/reroute();
// all the real work — geocode → forecast → places → Gemini → enrich — lives here.
// Any failure anywhere collapses to the curated FALLBACK (degraded:true) so the
// demo never dies.
import { geocode, forecast } from "./weather.js";
import { fetchPlaces } from "./places.js";
import { sequenceDay, rerouteDay } from "./llm.js";
import { haversineKm, walkMinutes } from "./geo.js";
import { fallbackItinerary, fallbackReroute } from "./fallback.js";
import { ItinerarySchema, RerouteResultSchema } from "./schema.js";

const DEFAULT_DURATION = { food: 75, indoor: 75, sight: 60, outdoor: 45 };

// crude interest extraction from free-text prefs (used only to bias place fetch)
function deriveInterests(prefs = "") {
  const t = String(prefs).toLowerCase();
  const map = {
    art: /art|museum|gallery/,
    food: /food|eat|foodie|restaurant|cuisine/,
    history: /history|historic|old|temple|castle|monument/,
    nature: /nature|park|garden|outdoor|walk|scenic/,
    shopping: /shop|market/,
  };
  return Object.keys(map).filter((k) => map[k].test(t));
}

// Turn model stops ({id,time,title,type,why,cost}) into RichStops by attaching
// coordinates from a {id -> {lat,lng,durationMin}} index and computing walking
// gaps. Stops whose id isn't in the index are dropped (can't place on the map).
function enrichStops(modelStops, coordIndex) {
  const kept = [];
  let prev = null;
  for (const s of modelStops) {
    const coords = coordIndex.get(s.id);
    if (!coords) continue;
    const durationMin = coords.durationMin ?? DEFAULT_DURATION[s.type] ?? 60;
    const travelFromPrevMin = prev
      ? walkMinutes(haversineKm(prev, coords))
      : 0;
    const rich = {
      id: s.id,
      time: s.time,
      title: s.title,
      type: s.type,
      why: s.why ?? "",
      cost: s.cost ?? "free",
      lat: coords.lat,
      lng: coords.lng,
      durationMin,
      travelFromPrevMin,
    };
    kept.push(rich);
    prev = coords;
  }
  return kept;
}

function rainyHours(weather) {
  return (weather?.hourly || [])
    .filter((h) => h.rainProb >= 50)
    .map((h) => h.hour);
}

export async function plan(body) {
  const { city, prefs = "", budget = 2, pace = "balanced", date } = body;
  try {
    const { lat, lng } = await geocode(city);
    const weather = await forecast(lat, lng, date);
    const candidates = await fetchPlaces(lat, lng, deriveInterests(prefs));
    if (!candidates || candidates.length < 4) throw new Error("too_few_candidates");

    const model = await sequenceDay({ city, candidates, weather, prefs, budget, pace });

    const coordIndex = new Map(candidates.map((c) => [c.id, { lat: c.lat, lng: c.lng }]));
    const stops = enrichStops(model.stops, coordIndex);
    if (stops.length < 3) throw new Error("too_few_stops");

    const itinerary = {
      city,
      summary: model.summary || `A day in ${city}`,
      weather,
      stops,
      degraded: false,
    };
    return ItinerarySchema.parse(itinerary);
  } catch (e) {
    return fallbackItinerary(city, prefs);
  }
}

export async function reroute(body) {
  const { itinerary, disruption, now, closedId } = body;
  const city = itinerary.city;
  try {
    const { lat, lng } = await geocode(city);
    const weather =
      disruption === "weather" ? await forecast(lat, lng) : itinerary.weather;
    const candidates = await fetchPlaces(lat, lng, []);

    const model = await rerouteDay({
      city,
      itinerary,
      disruption,
      weather,
      now,
      closedId,
      candidates,
      rainyHours: rainyHours(weather),
    });

    // coords come from BOTH the existing itinerary (kept stops) and the candidate pool (new stops)
    const coordIndex = new Map();
    for (const c of candidates) coordIndex.set(c.id, { lat: c.lat, lng: c.lng });
    for (const s of itinerary.stops)
      coordIndex.set(s.id, { lat: s.lat, lng: s.lng, durationMin: s.durationMin });

    const stops = enrichStops(model.stops, coordIndex);
    if (stops.length < 3) throw new Error("too_few_stops");

    const result = {
      city,
      summary: itinerary.summary,
      weather,
      stops,
      degraded: false,
      change_summary: model.change_summary || "Updated your remaining stops.",
      changed_ids: model.changed_ids || [],
    };
    return RerouteResultSchema.parse(result);
  } catch (e) {
    return fallbackReroute(city, disruption);
  }
}
