import { describe, it, expect } from "vitest";
import { fallbackItinerary, fallbackReroute } from "../lib/fallback.js";
import { ItinerarySchema, RerouteResultSchema } from "../lib/schema.js";

describe("fallbackItinerary", () => {
  it("returns a valid, degraded Lisbon itinerary", () => {
    const it = fallbackItinerary("Lisbon");
    expect(() => ItinerarySchema.parse(it)).not.toThrow();
    expect(it.degraded).toBe(true);
    expect(it.stops.length).toBeGreaterThanOrEqual(4);
    expect(it.stops.length).toBeLessThanOrEqual(6);
    expect(it.weather.summary).toBeTruthy();
    expect(it.stops.every((s) => typeof s.lat === "number" && typeof s.lng === "number")).toBe(true);
    expect(it.stops.some((s) => s.type === "food")).toBe(true); // has a meal
  });

  it("routes Kyoto requests to the Kyoto set", () => {
    const it = fallbackItinerary("Kyoto, Japan");
    expect(it.city).toBe("Kyoto");
    expect(() => ItinerarySchema.parse(it)).not.toThrow();
  });

  it("defaults unknown cities to a valid plan", () => {
    const it = fallbackItinerary("Atlantis");
    expect(() => ItinerarySchema.parse(it)).not.toThrow();
  });
});

describe("fallbackReroute", () => {
  it("returns a valid RerouteResult with an explanation", () => {
    const r = fallbackReroute("Lisbon", "rain");
    expect(() => RerouteResultSchema.parse(r)).not.toThrow();
    expect(r.change_summary).toBeTruthy();
    expect(Array.isArray(r.changed_ids)).toBe(true);
  });
});
