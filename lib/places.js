// OSM Overpass place candidates. No API key. Used by engine.js.
import { tagToType, trimCandidates } from "./geo.js";

const ENDPOINT = "https://overpass-api.de/api/interpreter";
const HEADERS = {
  "User-Agent": "tp-engine/2.0",
  "Content-Type": "application/x-www-form-urlencoded",
};

function buildQuery(lat, lng) {
  return (
    `[out:json][timeout:25];` +
    `( node["tourism"~"museum|gallery|attraction|viewpoint"](around:3000,${lat},${lng});` +
    ` node["amenity"~"restaurant|cafe"](around:3000,${lat},${lng});` +
    ` node["leisure"="park"](around:3000,${lat},${lng}); );` +
    `out body 40;`
  );
}

// lat,lng -> Candidate[] = { id, name, type, lat, lng }. Throws on Overpass error.
export async function fetchPlaces(lat, lng, interests = []) {
  const body = "data=" + encodeURIComponent(buildQuery(lat, lng));
  const res = await fetch(ENDPOINT, { method: "POST", headers: HEADERS, body });
  if (!res.ok) throw new Error("overpass_failed");
  const json = await res.json();
  const mapped = (json.elements || []).map((el) => ({
    id: "n" + el.id,
    name: el.tags?.name,
    type: tagToType(el.tags || {}),
    lat: el.lat,
    lng: el.lon,
  }));
  // light bias: stops whose type matches a stated interest float up (stable)
  const want = new Set(
    interests.flatMap((i) =>
      i === "art" || i === "history" ? ["indoor", "sight"] : i === "nature" ? ["outdoor"] : i === "food" ? ["food"] : [],
    ),
  );
  const ranked = mapped
    .map((c, idx) => ({ c, idx, hit: want.has(c.type) ? 0 : 1 }))
    .sort((a, b) => a.hit - b.hit || a.idx - b.idx)
    .map((x) => x.c);
  return trimCandidates(ranked, 20);
}
