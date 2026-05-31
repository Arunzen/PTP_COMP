import { describe, it, expect } from "vitest";
import { haversineKm, walkMinutes, tagToType, trimCandidates } from "../lib/geo.js";

describe("haversineKm", () => {
  it("Lisbon→Porto ≈ 274 km", () => {
    const lis = { lat: 38.7223, lng: -9.1393 };
    const por = { lat: 41.1579, lng: -8.6291 };
    expect(haversineKm(lis, por)).toBeGreaterThan(269);
    expect(haversineKm(lis, por)).toBeLessThan(279);
  });
  it("zero distance for same point", () => {
    expect(haversineKm({ lat: 1, lng: 1 }, { lat: 1, lng: 1 })).toBe(0);
  });
});

describe("walkMinutes", () => {
  it("1 km ≈ 12 min at 5 km/h", () => {
    expect(walkMinutes(1)).toBe(12);
  });
});

describe("tagToType", () => {
  it("maps tags to our types", () => {
    expect(tagToType({ tourism: "museum" })).toBe("indoor");
    expect(tagToType({ leisure: "park" })).toBe("outdoor");
    expect(tagToType({ amenity: "restaurant" })).toBe("food");
    expect(tagToType({ tourism: "viewpoint" })).toBe("outdoor");
    expect(tagToType({ tourism: "attraction" })).toBe("sight");
    expect(tagToType({})).toBe("sight");
  });
});

describe("trimCandidates", () => {
  it("dedupes by name, drops nameless, caps length", () => {
    const list = [
      { name: "A" },
      { name: "a" }, // dup (case-insensitive)
      { name: "" }, // nameless
      { name: "B" },
      { name: "C" },
    ];
    const out = trimCandidates(list, 2);
    expect(out.map((x) => x.name)).toEqual(["A", "B"]);
  });
});
