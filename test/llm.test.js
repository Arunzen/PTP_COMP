import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Gemini client's generateContent via injectable client factory.
const generateContent = vi.hoisted(() => vi.fn());

import { sequenceDay, rerouteDay, PLAN_PROMPT, __setClientFactory } from "../lib/llm.js";

const goodPlan = {
  summary: "A classic Lisbon day",
  stops: [
    { id: "n1", time: "09:30", title: "Museu", type: "indoor", why: "art", cost: "€" },
    { id: "n2", time: "11:30", title: "Park", type: "outdoor", why: "green", cost: "free" },
    { id: "n3", time: "13:30", title: "Café", type: "food", why: "lunch", cost: "€€" },
    { id: "n4", time: "15:30", title: "View", type: "outdoor", why: "vista", cost: "free" },
    { id: "n5", time: "19:30", title: "Tasca", type: "food", why: "dinner", cost: "€€€" },
  ],
};

const args = {
  city: "Lisbon",
  candidates: [{ id: "n1", name: "Museu", type: "indoor", lat: 38.7, lng: -9.1 }],
  weather: { summary: "Dry day", hourly: [] },
  prefs: "art and food",
  budget: 2,
  pace: "balanced",
};

beforeEach(() => {
  generateContent.mockReset();
  // Inject a client whose models.generateContent is our mocked fn.
  __setClientFactory(async () => ({ models: { generateContent } }));
});

describe("sequenceDay", () => {
  it("returns 5 schema-valid stops from clean JSON", async () => {
    generateContent.mockResolvedValue({ text: JSON.stringify(goodPlan) });
    const out = await sequenceDay(args);
    expect(out.stops).toHaveLength(5);
    expect(out.summary).toBeTruthy();
  });

  it("parses ```json fenced output (parseModelJson is applied)", async () => {
    generateContent.mockResolvedValue({ text: "```json\n" + JSON.stringify(goodPlan) + "\n```" });
    const out = await sequenceDay(args);
    expect(out.stops[0].id).toBe("n1");
  });

  it("rejects when the SDK throws", async () => {
    generateContent.mockRejectedValue(new Error("api_down"));
    try {
      await sequenceDay(args);
      throw new Error("Expected sequenceDay to reject");
    } catch (err) {
      expect(err).toMatchObject({ message: "api_down" });
    }
  });

  it("rejects on unparseable output", async () => {
    generateContent.mockResolvedValue({ text: "sorry, no json" });
    await expect(sequenceDay(args)).rejects.toThrow();
  });
});

describe("rerouteDay", () => {
  it("returns stops + change_summary + changed_ids", async () => {
    const reroute = {
      stops: goodPlan.stops,
      change_summary: "Swapped the outdoor walk for an indoor museum because of rain.",
      changed_ids: ["n1"],
    };
    generateContent.mockResolvedValue({ text: JSON.stringify(reroute) });
    const out = await rerouteDay({
      city: "Lisbon",
      itinerary: { stops: goodPlan.stops },
      disruption: "rain",
      weather: { summary: "Rain likely 14:00–17:00", hourly: [] },
      candidates: args.candidates,
    });
    expect(out.changed_ids).toContain("n1");
    expect(out.change_summary).toBeTruthy();
  });
});

describe("PLAN_PROMPT", () => {
  it("bakes in the rules and lists candidate ids", () => {
    const p = PLAN_PROMPT(args);
    expect(p).toContain("EXACTLY 5 stops");
    expect(p).toContain("n1");
    expect(p).toContain("JSON ONLY");
  });
});
