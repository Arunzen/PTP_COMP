import { describe, it, expect } from "vitest";
import {
  validatePlanBody,
  parseModelJson,
  ItinerarySchema,
  ModelPlanSchema,
} from "../lib/schema.js";

describe("validatePlanBody", () => {
  it("accepts a good body and applies defaults", () => {
    const b = validatePlanBody({ city: "Lisbon" });
    expect(b.city).toBe("Lisbon");
    expect(b.budget).toBe(2); // default
    expect(b.pace).toBe("balanced"); // default
  });

  it("throws on out-of-range budget", () => {
    expect(() => validatePlanBody({ city: "Lisbon", budget: 9 })).toThrow();
  });

  it("throws on empty city", () => {
    expect(() => validatePlanBody({ city: "" })).toThrow();
  });
});

describe("parseModelJson", () => {
  it("parses clean minified JSON", () => {
    expect(parseModelJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("parses ```json fenced output", () => {
    const fenced = '```json\n{"stops":[]}\n```';
    expect(parseModelJson(fenced)).toEqual({ stops: [] });
  });

  it("tolerates trailing prose after the object", () => {
    const messy = 'Here is your plan:\n{"ok":true}\nHope that helps!';
    expect(parseModelJson(messy)).toEqual({ ok: true });
  });

  it("throws on garbage with no JSON object", () => {
    expect(() => parseModelJson("no json here")).toThrow();
  });
});

describe("schemas reject malformed data", () => {
  it("ModelPlanSchema rejects a stop missing time", () => {
    const bad = { summary: "x", stops: [{ id: "s1", title: "X", type: "sight" }] };
    expect(() => ModelPlanSchema.parse(bad)).toThrow();
  });

  it("ItinerarySchema rejects a stop missing coordinates", () => {
    const bad = {
      city: "Lisbon",
      summary: "x",
      weather: { summary: "Dry", hourly: [] },
      stops: [{ id: "s1", time: "10:00", title: "X", type: "sight", why: "", cost: "free" }],
    };
    expect(() => ItinerarySchema.parse(bad)).toThrow(); // no lat/lng
  });

  it("ItinerarySchema accepts a fully-formed itinerary", () => {
    const good = {
      city: "Lisbon",
      summary: "A good day",
      weather: { summary: "Dry day", hourly: [{ hour: 9, rainProb: 10, tempC: 18 }] },
      stops: [
        {
          id: "s1",
          time: "10:00",
          title: "Jerónimos",
          type: "indoor",
          why: "history",
          cost: "€",
          lat: 38.6979,
          lng: -9.2065,
          durationMin: 75,
          travelFromPrevMin: 0,
        },
      ],
    };
    expect(() => ItinerarySchema.parse(good)).not.toThrow();
  });
});
