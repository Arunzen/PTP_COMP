// Shared contracts for TP Engine v2.
// zod validates BOTH request bodies AND the model's JSON output (Backend.md §8).
// Every lib module and handler imports types/validators from here — single source of truth.
import { z } from "zod";

/* ----------------------------- primitives ----------------------------- */
export const StopType = z.enum(["sight", "indoor", "food", "outdoor"]);
export const Cost = z.enum(["free", "€", "€€", "€€€"]);
export const Pace = z.enum(["relaxed", "balanced", "packed"]);
export const Budget = z.number().int().min(1).max(3);
// "9:30" or "09:30" or "14:00"
const Time = z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, "time must be HH:MM");

/* ------------------------------ requests ------------------------------ */
export const PlanBodySchema = z.object({
  city: z.string().trim().min(1).max(60),
  prefs: z.string().max(400).default(""),
  budget: Budget.default(2),
  pace: Pace.default("balanced"),
  date: z.string().max(20).optional(),
});

/* ------------------------------ weather ------------------------------- */
export const HourSchema = z.object({
  hour: z.number().int().min(0).max(23),
  rainProb: z.number().int().min(0).max(100),
  tempC: z.number(),
});
export const WeatherSchema = z.object({
  summary: z.string(),
  hourly: z.array(HourSchema),
});

/* ----------------------- stops (model + enriched) --------------------- */
// Raw stop as produced by the model.
export const StopSchema = z.object({
  id: z.string().min(1),
  time: Time,
  title: z.string().min(1),
  type: StopType,
  why: z.string().default(""),
  cost: Cost.default("free"),
});
// Stop after engine enriches it with coordinates + travel time.
export const RichStopSchema = StopSchema.extend({
  lat: z.number(),
  lng: z.number(),
  durationMin: z.number().int().nonnegative().default(60),
  travelFromPrevMin: z.number().int().nonnegative().default(0),
});

/* ----------------------------- itineraries ---------------------------- */
export const ItinerarySchema = z.object({
  city: z.string(),
  summary: z.string(),
  weather: WeatherSchema,
  stops: z.array(RichStopSchema),
  degraded: z.boolean().optional(),
});
export const RerouteResultSchema = ItinerarySchema.extend({
  change_summary: z.string(),
  changed_ids: z.array(z.string()),
});

export const RerouteBodySchema = z.object({
  itinerary: ItinerarySchema,
  disruption: z.enum(["rain", "closed", "behind", "weather"]),
  now: z.string().max(20).optional(),
  closedId: z.string().optional(),
});

/* -------------------- raw model-output (pre-enrich) ------------------- */
// What lib/llm.js expects back from Gemini before the engine enriches it.
export const ModelPlanSchema = z.object({
  summary: z.string().default(""),
  stops: z.array(StopSchema).min(1),
});
export const ModelRerouteSchema = z.object({
  stops: z.array(StopSchema).min(1),
  change_summary: z.string().default(""),
  changed_ids: z.array(z.string()).default([]),
});

/* ------------------------------ helpers ------------------------------- */
export function validatePlanBody(body) {
  return PlanBodySchema.parse(body);
}
export function validateRerouteBody(body) {
  return RerouteBodySchema.parse(body);
}

// Defensive parse of model output: strip ``` fences, slice to the outermost
// object, JSON.parse. Throws on anything unparseable so callers fall back.
export function parseModelJson(text) {
  const cleaned = String(text)
    .replace(/```json\s*|\s*```/g, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) throw new Error("no_json");
  return JSON.parse(cleaned.slice(start, end + 1));
}
