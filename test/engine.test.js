import { describe, it, expect, vi, beforeEach } from "vitest";

const geocode = vi.hoisted(() => vi.fn());
const forecast = vi.hoisted(() => vi.fn());
const fetchPlaces = vi.hoisted(() => vi.fn());
const sequenceDay = vi.hoisted(() => vi.fn());
const rerouteDay = vi.hoisted(() => vi.fn());

vi.mock("../lib/weather.js", () => ({ geocode, forecast }));
vi.mock("../lib/places.js", () => ({ fetchPlaces }));
vi.mock("../lib/llm.js", () => ({ sequenceDay, rerouteDay }));

import { plan, reroute } from "../lib/engine.js";
import { ItinerarySchema, RerouteResultSchema } from "../lib/schema.js";

const candidates = [
  { id: "n1", name: "Museu", type: "indoor", lat: 38.70, lng: -9.10 },
  { id: "n2", name: "Park", type: "outdoor", lat: 38.71, lng: -9.11 },
  { id: "n3", name: "Café", type: "food", lat: 38.72, lng: -9.12 },
  { id: "n4", name: "View", type: "outdoor", lat: 38.73, lng: -9.13 },
  { id: "n5", name: "Tasca", type: "food", lat: 38.74, lng: -9.14 },
];
const weather = { summary: "Dry day", hourly: [{ hour: 9, rainProb: 10, tempC: 20 }] };
const modelStops = [
  { id: "n1", time: "09:30", title: "Museu", type: "indoor", why: "art", cost: "€" },
  { id: "n2", time: "11:30", title: "Park", type: "outdoor", why: "green", cost: "free" },
  { id: "n3", time: "13:30", title: "Café", type: "food", why: "lunch", cost: "€€" },
  { id: "n4", time: "15:30", title: "View", type: "outdoor", why: "vista", cost: "free" },
  { id: "n5", time: "19:30", title: "Tasca", type: "food", why: "dinner", cost: "€€€" },
];

beforeEach(() => {
  for (const m of [geocode, forecast, fetchPlaces, sequenceDay, rerouteDay]) m.mockReset();
});

describe("plan", () => {
  it("builds an enriched, valid itinerary on the happy path", async () => {
    geocode.mockResolvedValue({ lat: 38.7, lng: -9.1 });
    forecast.mockResolvedValue(weather);
    fetchPlaces.mockResolvedValue(candidates);
    sequenceDay.mockResolvedValue({ summary: "A good day", stops: modelStops });

    const it = await plan({ city: "Lisbon", prefs: "art", budget: 2, pace: "balanced" });
    expect(() => ItinerarySchema.parse(it)).not.toThrow();
    expect(it.degraded).toBe(false);
    expect(it.stops).toHaveLength(5);
    expect(it.stops[0]).toMatchObject({ id: "n1", lat: 38.7, lng: -9.1 }); // enriched coords
    expect(it.stops[0].travelFromPrevMin).toBe(0);
    expect(it.stops[1].travelFromPrevMin).toBeGreaterThan(0); // walking gap computed
  });

  it("drops model stops whose id is not a candidate", async () => {
    geocode.mockResolvedValue({ lat: 38.7, lng: -9.1 });
    forecast.mockResolvedValue(weather);
    fetchPlaces.mockResolvedValue(candidates);
    sequenceDay.mockResolvedValue({
      summary: "x",
      stops: [...modelStops, { id: "ghost", time: "20:00", title: "Nope", type: "sight", why: "", cost: "free" }],
    });
    const it = await plan({ city: "Lisbon" });
    expect(it.stops.find((s) => s.id === "ghost")).toBeUndefined();
    expect(it.stops).toHaveLength(5);
  });

  it("falls back (degraded) when an integration throws", async () => {
    geocode.mockResolvedValue({ lat: 38.7, lng: -9.1 });
    forecast.mockResolvedValue(weather);
    fetchPlaces.mockRejectedValue(new Error("overpass_failed"));
    const it = await plan({ city: "Lisbon" });
    expect(it.degraded).toBe(true);
    expect(() => ItinerarySchema.parse(it)).not.toThrow();
  });

  it("falls back when too few candidates", async () => {
    geocode.mockResolvedValue({ lat: 38.7, lng: -9.1 });
    forecast.mockResolvedValue(weather);
    fetchPlaces.mockResolvedValue([candidates[0]]); // < 4
    const it = await plan({ city: "Lisbon" });
    expect(it.degraded).toBe(true);
  });
});

describe("reroute", () => {
  const itinerary = {
    city: "Lisbon",
    summary: "A good day",
    weather,
    stops: modelStops.map((s, i) => ({
      ...s,
      lat: candidates[i].lat,
      lng: candidates[i].lng,
      durationMin: 60,
      travelFromPrevMin: i === 0 ? 0 : 15,
    })),
  };

  it("returns a valid RerouteResult on the happy path", async () => {
    geocode.mockResolvedValue({ lat: 38.7, lng: -9.1 });
    fetchPlaces.mockResolvedValue(candidates);
    rerouteDay.mockResolvedValue({
      stops: modelStops,
      change_summary: "Swapped the outdoor view for an indoor museum due to rain.",
      changed_ids: ["n1"],
    });
    const r = await reroute({ itinerary, disruption: "rain" });
    expect(() => RerouteResultSchema.parse(r)).not.toThrow();
    expect(r.changed_ids).toContain("n1");
    expect(r.degraded).toBe(false);
  });

  it("falls back (degraded) when the model throws", async () => {
    geocode.mockResolvedValue({ lat: 38.7, lng: -9.1 });
    fetchPlaces.mockResolvedValue(candidates);
    rerouteDay.mockRejectedValue(new Error("api_down"));
    const r = await reroute({ itinerary, disruption: "closed" });
    expect(r.degraded).toBe(true);
    expect(() => RerouteResultSchema.parse(r)).not.toThrow();
  });
});
