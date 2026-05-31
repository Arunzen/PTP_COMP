// POST /api/plan -> Itinerary. Thin handler: validate -> engine -> JSON.
import { plan } from "../../lib/engine.js";
import { validatePlanBody } from "../../lib/schema.js";

export default async (req) => {
  if (req.method !== "POST") return Response.json({ error: "POST only" }, { status: 405 });
  try {
    const body = validatePlanBody(await req.json());
    const itinerary = await plan(body);
    return Response.json(itinerary);
  } catch (e) {
    return Response.json({ error: "plan_failed", code: e?.code ?? "bad_request" }, { status: 400 });
  }
};

export const config = { path: "/api/plan" };
