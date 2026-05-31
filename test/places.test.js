import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchPlaces } from "../lib/places.js";

afterEach(() => vi.unstubAllGlobals());

describe("fetchPlaces", () => {
  it("sends an Overpass query with around: and tag filters", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ elements: [] }) }));
    vi.stubGlobal("fetch", fetchMock);
    await fetchPlaces(38.7, -9.1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toContain("overpass-api.de/api/interpreter");
    const decoded = decodeURIComponent(opts.body);
    expect(decoded).toContain("around:3000,38.7,-9.1");
    expect(decoded).toContain('node["tourism"');
    expect(decoded).toContain('node["amenity"');
    expect(decoded).toContain('node["leisure"="park"]');
  });

  it("maps elements to candidates, dropping nameless ones", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          elements: [
            { type: "node", id: 1, lat: 38.7, lon: -9.1, tags: { name: "Museu", tourism: "museum" } },
            { type: "node", id: 2, lat: 38.71, lon: -9.11, tags: { name: "Café X", amenity: "cafe" } },
            { type: "node", id: 3, lat: 38.72, lon: -9.12, tags: { tourism: "museum" } }, // no name -> dropped
          ],
        }),
      })),
    );
    const out = await fetchPlaces(38.7, -9.1);
    expect(out).toHaveLength(2);
    expect(out.find((c) => c.id === "n1")).toMatchObject({ type: "indoor", name: "Museu" });
    expect(out.find((c) => c.id === "n2")).toMatchObject({ type: "food" });
  });

  it("throws on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) })));
    await expect(fetchPlaces(0, 0)).rejects.toThrow("overpass_failed");
  });
});
