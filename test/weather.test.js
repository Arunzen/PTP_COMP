import { describe, it, expect, vi, afterEach } from "vitest";
import { geocode, forecast } from "../lib/weather.js";

afterEach(() => vi.unstubAllGlobals());

function stubFetch(payload, ok = true) {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok, json: async () => payload })));
}

describe("geocode", () => {
  it("returns lat/lng/name from results[0]", async () => {
    stubFetch({ results: [{ latitude: 38.72, longitude: -9.14, name: "Lisbon" }] });
    const r = await geocode("Lisbon");
    expect(r).toEqual({ lat: 38.72, lng: -9.14, name: "Lisbon" });
  });
  it("throws geocode_failed when no results", async () => {
    stubFetch({ results: [] });
    await expect(geocode("Nowhereville")).rejects.toThrow("geocode_failed");
  });
});

describe("forecast", () => {
  function dayPayload(rainyHours = []) {
    const time = [];
    const precipitation_probability = [];
    const temperature_2m = [];
    for (let h = 0; h < 24; h++) {
      time.push(`2026-05-31T${String(h).padStart(2, "0")}:00`);
      precipitation_probability.push(rainyHours.includes(h) ? 80 : 10);
      temperature_2m.push(20);
    }
    return { hourly: { time, precipitation_probability, temperature_2m } };
  }

  it("maps 24 hourly entries", async () => {
    stubFetch(dayPayload());
    const w = await forecast(38.7, -9.1);
    expect(w.hourly).toHaveLength(24);
    expect(w.hourly[14]).toEqual({ hour: 14, rainProb: 10, tempC: 20 });
  });

  it("summary names the rainy window", async () => {
    stubFetch(dayPayload([14, 15, 16]));
    const w = await forecast(38.7, -9.1);
    expect(w.summary).toMatch(/Rain likely 14:00–17:00/);
  });

  it("summary is 'Dry day' when no rain", async () => {
    stubFetch(dayPayload());
    const w = await forecast(38.7, -9.1);
    expect(w.summary).toBe("Dry day");
  });
});
