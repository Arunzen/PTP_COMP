import { describe, it, expect, vi, beforeEach } from "vitest";

const plan = vi.hoisted(() => vi.fn());
const reroute = vi.hoisted(() => vi.fn());
vi.mock("../lib/engine.js", () => ({ plan, reroute }));

import healthHandler from "../netlify/functions/health.js";
import planHandler from "../netlify/functions/plan.js";
import rerouteHandler from "../netlify/functions/reroute.js";

function postReq(body) {
  return { method: "POST", json: async () => body };
}

beforeEach(() => {
  plan.mockReset();
  reroute.mockReset();
});

describe("health", () => {
  it("returns { ok: true }", async () => {
    const res = await healthHandler();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("plan handler", () => {
  it("200s with the engine itinerary for a good body", async () => {
    plan.mockResolvedValue({ city: "Lisbon", summary: "x", weather: { summary: "Dry", hourly: [] }, stops: [] });
    const res = await planHandler(postReq({ city: "Lisbon" }));
    expect(res.status).toBe(200);
    expect((await res.json()).city).toBe("Lisbon");
    expect(plan).toHaveBeenCalledOnce();
  });

  it("400s on an invalid body (empty city)", async () => {
    const res = await planHandler(postReq({ city: "" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("plan_failed");
    expect(plan).not.toHaveBeenCalled();
  });

  it("405s on non-POST", async () => {
    const res = await planHandler({ method: "GET" });
    expect(res.status).toBe(405);
  });
});

describe("reroute handler", () => {
  it("405s on non-POST", async () => {
    const res = await rerouteHandler({ method: "GET" });
    expect(res.status).toBe(405);
  });
});
