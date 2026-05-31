// Pure geo helpers (no network). Used by places.js and engine.js.

const R_KM = 6371;
const rad = (d) => (d * Math.PI) / 180;

// Great-circle distance in km between {lat,lng} points.
export function haversineKm(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const lat1 = rad(a.lat);
  const lat2 = rad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.sqrt(h));
}

// Rough walking time for a straight-line distance (5 km/h).
export function walkMinutes(km) {
  return Math.round((km / 5) * 60);
}

// Map OSM tags → our Stop/Candidate type.
export function tagToType(tags = {}) {
  const t = tags.tourism;
  if (tags.amenity && /restaurant|cafe|fast_food|bar|pub|food_court/.test(tags.amenity)) return "food";
  if (tags.leisure && /park|garden/.test(tags.leisure)) return "outdoor";
  if (t && /museum|gallery|artwork/.test(t)) return "indoor";
  if (t && /viewpoint/.test(t)) return "outdoor";
  if (t && /attraction|zoo|theme_park|aquarium/.test(t)) return "sight";
  if (tags.historic) return "sight";
  return "sight";
}

// Dedupe by lowercased name, drop nameless, cap to n.
export function trimCandidates(list, n = 20) {
  const seen = new Set();
  const out = [];
  for (const c of list) {
    const name = (c.name || "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
    if (out.length >= n) break;
  }
  return out;
}
