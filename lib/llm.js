// Gemini sequencing + reroute (Backend.md §4/§5, adapted from Anthropic → Gemini).
// The ONLY place prompts are built. Output is parsed defensively + zod-validated;
// any failure throws so engine.js falls back to the curated itinerary.
import { GoogleGenAI } from "@google/genai";
import { parseModelJson, ModelPlanSchema, ModelRerouteSchema } from "./schema.js";

const MODEL = () => process.env.GEMINI_MODEL || "gemini-2.0-flash";
const GEN_CONFIG = {
  responseMimeType: "application/json",
  temperature: 0.4,
  maxOutputTokens: 1200,
};

function client() {
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

function candidateLines(candidates = []) {
  return candidates.map((c) => `${c.id} | ${c.name} | ${c.type}`).join("\n");
}
function rainyHoursList(weather) {
  const hrs = (weather?.hourly || []).filter((h) => h.rainProb >= 50).map((h) => h.hour);
  return hrs.length ? hrs.join(", ") : "none";
}

export function PLAN_PROMPT({ city, candidates, weather, prefs, budget, pace }) {
  return `You are a travel-planning engine for a SOLO traveler with ONE day in ${city}.
Traveler notes: ${prefs || "(none)"}
Budget tier: ${budget} (1=cheap,2=mid,3=splurge)   Pace: ${pace}
Weather today: ${weather?.summary || "unknown"}. Forecast-rainy hours (24h): ${rainyHoursList(weather)}.

Candidate places (choose ONLY from these, by id):
${candidateLines(candidates)}

Rules:
- Build EXACTLY 5 stops, ordered by time from morning to night.
- Use ONLY candidate ids above. Do not invent places.
- Prefer indoor-type stops during the forecast-rainy hours.
- Respect realistic travel time and typical opening hours; mix indoor and outdoor.
- Include exactly one food stop around midday and end with a food/dinner stop.

Return JSON ONLY, no markdown:
{"summary":"<=12 words","stops":[{"id":"<candidate id>","time":"HH:MM","title":"<name>","type":"sight|indoor|food|outdoor","why":"<=12 words","cost":"free|€|€€|€€€"}]}`;
}

export function REROUTE_PROMPT({ city, itinerary, disruption, weather, now, candidates }) {
  const current = (itinerary?.stops || [])
    .map((s) => `${s.id} | ${s.time} | ${s.title} | ${s.type}`)
    .join("\n");
  const disruptionText = {
    rain: "Rain has started now — replace remaining OUTDOOR stops with indoor ones.",
    closed: "A stop just closed — remove it and slot in a similar nearby alternative.",
    behind: "The traveler is ~90 minutes behind — drop the lowest-value remaining stop and keep dinner.",
    weather: "The forecast changed — re-plan remaining stops around the new rainy hours.",
  }[disruption] || "Re-plan the remaining stops.";

  return `You are re-planning a solo traveler's day in ${city}. Current time: ${now || "afternoon"}.
Disruption: ${disruptionText}
Updated weather: ${weather?.summary || "unknown"}. Rainy hours: ${rainyHoursList(weather)}.

Current itinerary:
${current}

Candidate places you may add (choose ONLY from these ids):
${candidateLines(candidates)}

Rules:
- Keep stops already in the PAST. Only change stops at/after the current time.
- Keep ~5 stops total and keep the dinner/last food stop.
- New stops must use candidate ids above; kept stops keep their existing ids.

Return JSON ONLY, no markdown:
{"stops":[{"id":"...","time":"HH:MM","title":"...","type":"sight|indoor|food|outdoor","why":"<=12 words","cost":"free|€|€€|€€€"}],"change_summary":"<=30 words, what changed and WHY","changed_ids":["<ids added or moved>"]}`;
}

export async function sequenceDay(args) {
  const res = await client().models.generateContent({
    model: MODEL(),
    contents: PLAN_PROMPT(args),
    config: GEN_CONFIG,
  });
  return ModelPlanSchema.parse(parseModelJson(res.text));
}

export async function rerouteDay(args) {
  const res = await client().models.generateContent({
    model: MODEL(),
    contents: REROUTE_PROMPT(args),
    config: GEN_CONFIG,
  });
  return ModelRerouteSchema.parse(parseModelJson(res.text));
}
