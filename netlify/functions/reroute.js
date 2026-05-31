// POST /api/reroute -> RerouteResult. Thin handler: validate -> engine -> JSON.
import { reroute } from "../../lib/engine.js";
import { validateRerouteBody } from "../../lib/schema.js";

export default async (req) => {
  if (req.method !== "POST") return Response.json({ error: "POST only" }, { status: 405 });
  try {
    const body = validateRerouteBody(await req.json());
    const result = await reroute(body);
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: "reroute_failed", code: e?.code ?? "bad_request" }, { status: 400 });
  }
};

export const config = { path: "/api/reroute" };
