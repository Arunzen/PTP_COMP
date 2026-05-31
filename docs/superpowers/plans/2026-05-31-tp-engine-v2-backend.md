# TP Engine v2 — Backend + Live-Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a single Netlify deploy where a React frontend calls serverless functions that fetch **real weather (Open-Meteo)** and **real places (OSM Overpass)** — no API keys for data — and **Gemini** sequences a feasible, weather-aware day and re-plans live on disruption, always falling back to a curated itinerary so the demo never dies.

**Architecture:** Frontend (Vite + React) → same-origin `/api/*` Netlify Functions (thin handlers) → shared `lib/` orchestration (`engine` calls `geo` → `weather` → `places` → `llm`). All secrets server-side. zod validates inputs and model output. A curated `FALLBACK` covers any integration/LLM failure (`degraded: true`).

**Tech Stack:** Vite, React 18, Leaflet (react-leaflet), Netlify Functions 2.0 (Node ESM), `@google/genai` (Gemini `gemini-2.0-flash`), zod, vitest, Open-Meteo, OSM Overpass.

---

## LLM note (Gemini, not Anthropic)

Backend.md was written for Anthropic. We use **Gemini**:
- SDK: `@google/genai`. Key from `process.env.GEMINI_API_KEY` (server-only, gitignored `.env`, never `VITE_`-prefixed).
- Model from `process.env.GEMINI_MODEL` (default `gemini-2.0-flash`).
- Use **structured output**: pass `config.responseMimeType="application/json"` + a `responseSchema`. Still parse defensively (strip ``` fences → `JSON.parse` in try/catch) and zod-validate, then `FALLBACK` on any failure.

Canonical call (used by `lib/llm.js`):
```js
import { GoogleGenAI } from "@google/genai";
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const res = await ai.models.generateContent({
  model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
  contents: prompt,
  config: { responseMimeType: "application/json", temperature: 0.4, maxOutputTokens: 1200 },
});
const text = res.text; // JSON string
```

---

## File Structure

```
PTP_COMP/
├── package.json                # scripts: dev, build, test, format, lint
├── netlify.toml                # build (publish dist, functions dir) + security headers
├── vite.config.js
├── index.html                  # Vite entry (replaces the v1 standalone file)
├── .env / .env.example         # GEMINI_API_KEY, GEMINI_MODEL  (.env gitignored)
├── src/                        # FRONTEND (dumb renderers, no business logic)
│   ├── main.jsx                # React root
│   ├── App.jsx                 # state owner: calls api.js, holds itinerary, wires components
│   ├── api.js                  # fetch wrappers: plan(), reroute(), health()
│   ├── styles.css              # one stylesheet, editorial-travel aesthetic
│   └── components/
│       ├── SetupPanel.jsx      # NL intake + city/budget/pace/date → onPlan(body)
│       ├── ConditionsStrip.jsx # weather summary ("Rain likely 2–5pm")
│       ├── MapView.jsx         # Leaflet: numbered markers + connecting line
│       ├── Timeline.jsx        # <ol> of Stop, travel-gap chips
│       ├── Stop.jsx            # one <li>; highlight when changed
│       └── ChangeBanner.jsx    # aria-live="polite" reroute explanation
├── lib/                        # BACKEND logic (bundled into functions, unit-tested)
│   ├── schema.js               # zod: request bodies + model-output shapes + parse helpers
│   ├── geo.js                  # haversine, tagToType, trimCandidates
│   ├── weather.js              # Open-Meteo geocode + hourly forecast
│   ├── places.js               # Overpass query + map to candidates
│   ├── llm.js                  # Gemini call + defensive JSON parse + zod validate
│   ├── engine.js               # plan()/reroute() orchestration pipeline
│   └── fallback.js             # curated per-city itineraries (ported from v1 engine)
├── netlify/functions/          # THIN handlers (validate → call lib → Response.json)
│   ├── health.js
│   ├── plan.js
│   └── reroute.js
└── test/                       # vitest (mock integrations; offline + fast)
    ├── schema.test.js
    ├── geo.test.js
    ├── weather.test.js
    ├── places.test.js
    ├── llm.test.js
    └── handlers.test.js
```

**v1 disposition:** the current standalone `index.html` engine + Lisbon/Kyoto dataset is **ported into `lib/fallback.js`** (curated safety net) and `test/` regression intent is preserved. `_verify.mjs` is removed once `lib/fallback.js` tests cover it.

---

## Shared contracts (every task depends on these — do not diverge)

```js
// Request bodies
PlanBody   = { city:string(1..60), prefs:string(0..400), budget:1|2|3, pace:"relaxed"|"balanced"|"packed", date?:string }
RerouteBody= { itinerary:Itinerary, disruption:"rain"|"closed"|"behind"|"weather", now?:string, closedId?:string }

// Internal candidate (from places.js)
Candidate  = { id, name, type:"sight"|"indoor"|"food"|"outdoor", lat:number, lng:number }

// Model output stop (validated by zod)
Stop       = { id, time:"HH:MM", title, type:"sight"|"indoor"|"food"|"outdoor", why, cost:"free"|"€"|"€€"|"€€€" }

// Enriched stop (after engine adds coords + travel)
RichStop   = Stop & { lat:number, lng:number, durationMin:number, travelFromPrevMin:number }

// Responses
Weather    = { summary:string, hourly:[{ hour:int 0..23, rainProb:int, tempC:number }] }
Itinerary  = { city, summary, weather:Weather, stops:RichStop[], degraded?:boolean }
RerouteResult = Itinerary & { change_summary:string, changed_ids:string[] }
```

---

## Parallelization (agent dispatch graph)

- **Phase 0 (foundation — main session, sequential):** Tasks 1–3. Creates the scaffold + the shared contracts (`schema.js`, `fallback.js`) everything else imports. **Must finish before agents start.**
- **Phase 1 (parallel agents — independent, depend only on Phase 0):**
  - Agent A → **Task 4** `lib/geo.js`
  - Agent B → **Task 5** `lib/weather.js`
  - Agent C → **Task 6** `lib/places.js`
  - Agent D → **Task 7** `lib/llm.js`
- **Phase 2 (main session, after A–D merge):** Task 8 `lib/engine.js` + Task 9 functions/handlers (depend on all lib modules).
- **Phase 3 (parallel with Phase 2, depends only on API shapes):** Agent E → Tasks 10–11 frontend (`api.js`, components, App, Leaflet, styles).
- **Phase 4 (main session):** Task 12 wire-up, `netlify dev` smoke, deploy + README.

Each agent gets: this plan, the Shared Contracts block, its task only, and "TDD: write the vitest first, mock all `fetch`/SDK, run offline."

---

## Task 1: Project scaffold + tooling

**Files:** Create `package.json`, `vite.config.js`, `netlify.toml`, `src/main.jsx`, rewrite `index.html`.

- [ ] **Step 1:** `package.json` (ESM, scripts):
```json
{
  "name": "tp-engine",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "netlify dev",
    "dev:fe": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "format": "prettier --write .",
    "lint": "eslint ."
  },
  "dependencies": {
    "@google/genai": "^0.21.0",
    "leaflet": "^1.9.4",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-leaflet": "^4.2.1",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.4",
    "eslint": "^9.17.0",
    "prettier": "^3.4.2",
    "vite": "^6.0.7",
    "vitest": "^2.1.8"
  }
}
```
- [ ] **Step 2:** `vite.config.js` → `export default defineConfig({ plugins:[react()] })`.
- [ ] **Step 3:** `netlify.toml`:
```toml
[build]
  command = "npm run build"
  publish = "dist"
  functions = "netlify/functions"
[functions]
  node_bundler = "esbuild"
[[headers]]
  for = "/*"
  [headers.values]
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
    Content-Security-Policy = "default-src 'self'; img-src 'self' https://*.tile.openstreetmap.org data:; connect-src 'self'; style-src 'self' 'unsafe-inline'"
```
- [ ] **Step 4:** Rewrite `index.html` as the Vite entry (`<div id="root">` + `<script type="module" src="/src/main.jsx">`). `src/main.jsx` renders `<App/>`.
- [ ] **Step 5:** `npm install`; run `npm run build` → expect success (empty App ok).
- [ ] **Step 6:** Commit `chore: scaffold Vite + React + Netlify Functions project`.

## Task 2: `lib/schema.js` — zod contracts + defensive JSON parse

**Files:** Create `lib/schema.js`, `test/schema.test.js`.

- [ ] **Step 1 (test first):** assert `validatePlanBody` accepts a good body and throws on bad budget; `parseModelJson` parses clean JSON, parses ```` ```json fenced ````, tolerates trailing prose, and **throws** on garbage; `ItinerarySchema` rejects a stop missing `time`.
- [ ] **Step 2:** Implement schemas for `PlanBody`, `RerouteBody`, `Stop`, `Itinerary`, `RerouteResult` per Shared Contracts. `validatePlanBody`/`validateRerouteBody` = `.parse()` (throws). `parseModelJson(text)`:
```js
export function parseModelJson(text){
  const cleaned = String(text).replace(/```json\s*|\s*```/g, "").trim();
  const start = cleaned.indexOf("{"), end = cleaned.lastIndexOf("}");
  if(start === -1 || end === -1) throw new Error("no_json");
  return JSON.parse(cleaned.slice(start, end+1));
}
```
- [ ] **Step 3:** Run `npx vitest run test/schema.test.js` → PASS.
- [ ] **Step 4:** Commit `feat(lib): zod schemas + defensive model-JSON parser`.

## Task 3: `lib/fallback.js` — curated safety net (port v1)

**Files:** Create `lib/fallback.js`, `test/fallback.test.js`. Delete `_verify.mjs` after.

- [ ] **Step 1 (test first):** `fallbackItinerary("Lisbon", prefs)` returns a valid `Itinerary` (passes `ItinerarySchema`), has 4–6 stops with `lat`/`lng`, `degraded:true`, dinner stop present, and a non-empty `weather.summary`.
- [ ] **Step 2:** Port the v1 Lisbon + Kyoto dataset (name, type, lat, lng, durationMin, cost) and the deterministic scheduler into `fallbackItinerary(city, prefs)`. Map v1 `category/indoor` → `type`. Synthesize a neutral `weather.summary` ("Live weather unavailable — showing a curated plan."). Default to Lisbon for unknown cities.
- [ ] **Step 3:** Run `npx vitest run test/fallback.test.js` → PASS. Remove `_verify.mjs`.
- [ ] **Step 4:** Commit `feat(lib): curated FALLBACK itineraries (Lisbon, Kyoto)`.

## Task 4 (Agent A): `lib/geo.js` — haversine + tag→type + trim

**Files:** Create `lib/geo.js`, `test/geo.test.js`.

- [ ] **Step 1 (test first):** `haversineKm(LIS, PORTO)` ≈ 274 km (±5); `walkMinutes(km)` for 1 km ≈ 12 (5 km/h); `tagToType({tourism:"museum"})==="indoor"`, `{leisure:"park"}==="outdoor"`, `{amenity:"restaurant"}==="food"`, `{tourism:"viewpoint"}==="outdoor"`, unknown→`"sight"`; `trimCandidates(list, 20)` dedupes by name and caps length.
- [ ] **Step 2:** Implement. `haversineKm(a,b)` standard formula (R=6371). `walkMinutes(km)=Math.round(km/5*60)`. `tagToType(tags)` mapping table. `trimCandidates(cands, n)` = dedupe by lowercased name, prefer ones with names, slice n.
- [ ] **Step 3:** `npx vitest run test/geo.test.js` → PASS.
- [ ] **Step 4:** Commit `feat(lib): geo helpers (haversine, tag→type, trim)`.

## Task 5 (Agent B): `lib/weather.js` — Open-Meteo geocode + forecast

**Files:** Create `lib/weather.js`, `test/weather.test.js`. **No key.**

- [ ] **Step 1 (test first):** mock `global.fetch`. `geocode("Lisbon")` returns `{lat,lng}` from a stubbed geocoding response; throws `geocode_failed` on empty results. `forecast(lat,lng,date)` maps stubbed hourly arrays → `Weather` with 24 `hourly` entries and a `summary` naming the rainy window (e.g. "Rain likely 14:00–17:00") or "Dry day".
- [ ] **Step 2:** Implement against:
  - geocode: `https://geocoding-api.open-meteo.com/v1/search?name=<city>&count=1`
  - forecast: `https://api.open-meteo.com/v1/forecast?latitude=..&longitude=..&hourly=precipitation_probability,temperature_2m&forecast_days=1`
  Send `User-Agent: tp-engine/2.0`. Derive `summary` by finding the contiguous hours where `rainProb>=50`.
- [ ] **Step 3:** `npx vitest run test/weather.test.js` → PASS (offline, mocked).
- [ ] **Step 4:** Commit `feat(lib): Open-Meteo geocoding + forecast`.

## Task 6 (Agent C): `lib/places.js` — Overpass POIs

**Files:** Create `lib/places.js`, `test/places.test.js`. **No key.**

- [ ] **Step 1 (test first):** mock `fetch`. `fetchPlaces(lat,lng,interests)` builds an Overpass query string (assert it contains `around:` and the node tags), maps a stubbed `elements[]` → `Candidate[]` via `tagToType`, drops elements without a `name`, and returns ≤ 20. On non-200 or throw, it **rejects** (engine handles fallback).
- [ ] **Step 2:** Implement. POST to `https://overpass-api.de/api/interpreter` with the query from Backend.md §6 (museum/gallery/attraction/viewpoint, restaurant/cafe, park) `around:3000,LAT,LNG; out body 40;`. `User-Agent: tp-engine/2.0`. Map elements → `{id:"n"+id, name:tags.name, type:tagToType(tags), lat, lng}`, then `trimCandidates(_,20)`.
- [ ] **Step 3:** `npx vitest run test/places.test.js` → PASS.
- [ ] **Step 4:** Commit `feat(lib): Overpass place candidates`.

## Task 7 (Agent D): `lib/llm.js` — Gemini call + validate

**Files:** Create `lib/llm.js`, `test/llm.test.js`.

- [ ] **Step 1 (test first):** mock the `@google/genai` module so `generateContent` returns a canned JSON string. `sequenceDay({candidates, weather, prefs, budget, pace})` returns a parsed object passing the model-output schema (array of `Stop`); when the SDK throws, `sequenceDay` **throws** (engine catches → FALLBACK). Test `parseModelJson` is applied (feed fenced JSON).
- [ ] **Step 2:** Implement `PLAN_PROMPT` and `REROUTE_PROMPT` as named constants (the only place prompts are built). Prompt rule that does the magic: *"Choose ONLY from the provided candidates by id. Prefer indoor types during forecast-rainy hours. Respect realistic travel time. Return JSON only: {summary, stops:[{id,time,title,type,why,cost}]} with ~5 stops ordered by time."* Call Gemini (canonical call above) with `responseMimeType:"application/json"`. `parseModelJson(res.text)` → zod-validate stop array → return. `rerouteDay({itinerary, disruption, weather, now})` uses `REROUTE_PROMPT` over the remaining stops + same candidate ids → `{stops, change_summary, changed_ids}`.
- [ ] **Step 3:** `npx vitest run test/llm.test.js` → PASS (SDK mocked, no network/key).
- [ ] **Step 4:** Commit `feat(lib): Gemini sequencing + reroute with validation`.

## Task 8: `lib/engine.js` — orchestration

**Files:** Create `lib/engine.js`, extend `test/handlers.test.js` (engine-level).

- [ ] **Step 1 (test first):** mock `weather`, `places`, `llm`. `plan(body)` calls geocode→forecast→places→sequenceDay, enriches stops with `lat/lng` from candidates (match by id; drop stops whose id isn't a candidate), computes `travelFromPrevMin` via `geo`, returns valid `Itinerary`. If **any** dependency throws, returns `fallbackItinerary(city, prefs)` with `degraded:true`. `reroute(body)` re-runs `rerouteDay` over remaining stops → `RerouteResult`; on failure returns fallback with `degraded:true`.
- [ ] **Step 2:** Implement `plan`/`reroute` pipeline (Backend.md §4). Wrap the whole pipeline in try/catch → fallback.
- [ ] **Step 3:** `npx vitest run` (engine tests) → PASS.
- [ ] **Step 4:** Commit `feat(lib): engine pipeline (geo→weather→places→gemini→enrich)`.

## Task 9: Netlify Functions — thin handlers

**Files:** Create `netlify/functions/health.js`, `plan.js`, `reroute.js`; `test/handlers.test.js`.

- [ ] **Step 1 (test first):** import each handler's `default`; invoke with a mock `Request` (POST + JSON body); assert `Response` status/shape. `health` → `{ok:true}`. `plan` with bad body → 400 `{error:"plan_failed"}`. `plan` with good body (engine mocked) → 200 itinerary.
- [ ] **Step 2:** Implement handlers per Backend.md §5 (POST-only guard, `validate*Body`, call `engine`, `Response.json`, `export const config = { path:"/api/plan" }` etc.).
- [ ] **Step 3:** `npx vitest run test/handlers.test.js` → PASS.
- [ ] **Step 4:** Commit `feat(api): health, plan, reroute Netlify functions`.

## Task 10 (Agent E): Frontend data layer + dumb components

**Files:** Create `src/api.js`, `src/components/*.jsx`, `src/styles.css`.

- [ ] **Step 1:** `src/api.js` — `plan(body)`/`reroute(body)`/`health()` = `fetch("/api/...", {method:"POST", body:JSON.stringify})`, throw on non-200, return JSON.
- [ ] **Step 2:** Dumb components (props in, events out, **no business logic**, model output rendered as **text only** — no `dangerouslySetInnerHTML`):
  - `SetupPanel` — `<label>`ed inputs, `onPlan(body)`; disables submit while `loading`.
  - `ConditionsStrip` — renders `weather.summary` + hourly chips.
  - `MapView` — react-leaflet `<MapContainer>`, numbered `<Marker>`s, `<Polyline>` through stops; OSM tile layer.
  - `Timeline` — `<ol>`; each `<li>` = `<Stop>`; travel-gap chip ("12 min walk") between.
  - `Stop` — title/time/type/why/cost; `changed` prop adds a **text tag** "updated" (never color-only) + highlight class.
  - `ChangeBanner` — `role="status" aria-live="polite"`, renders `change_summary`.
- [ ] **Step 3:** `src/styles.css` — editorial-travel aesthetic (display serif heading + clean body, warm dominant + one accent), visible focus, WCAG AA, `@media (prefers-reduced-motion)`.
- [ ] **Step 4:** Commit `feat(ui): api client + dumb components + styles`.

## Task 11 (Agent E): `src/App.jsx` — state owner + wiring

**Files:** Create `src/App.jsx`.

- [ ] **Step 1:** App holds `itinerary`, `loading`, `error`, `changedIds`. `onPlan` → `setLoading` + `api.plan` → set itinerary (skeleton while loading). Disruption buttons → `api.reroute` → update itinerary + `changedIds` + banner. Disable triggering button while in flight. Show `degraded` ("offline mode") and error states.
- [ ] **Step 2:** Render `SetupPanel`, `ConditionsStrip`, `MapView`, `Timeline`, `ChangeBanner` with one clear heading hierarchy. Map markers + timeline reshuffle on reroute.
- [ ] **Step 3:** `npm run build` → PASS.
- [ ] **Step 4:** Commit `feat(ui): App state owner wiring plan + reroute`.

## Task 12: Integration, `netlify dev` smoke, deploy + README

**Files:** Create `README.md`; verify end-to-end.

- [ ] **Step 1:** `npm run test` → all suites PASS. `npm run build` → PASS.
- [ ] **Step 2:** `netlify dev` → GET `/api/health` returns `{ok:true}`; POST `/api/plan` for "Lisbon" returns a real itinerary (or `degraded:true` if key/data unavailable). Manual dry run: plan → rain → closed → behind.
- [ ] **Step 3:** `README.md` — what it is, architecture line, `netlify dev` + env steps (`GEMINI_API_KEY`, `GEMINI_MODEL`), known limits, manual dry-run checklist.
- [ ] **Step 4:** Commit `docs: README + run/env steps`. Push `Version2`. (Netlify import + env vars is a user step — document it.)

---

## Self-Review

**Spec coverage (Rule.md + Backend.md):** real weather → Task 5; real places → Task 6; Gemini over candidates → Task 7; weather-aware sequencing + reroute → Tasks 7–8; one call per action + caps → Tasks 7–8; FALLBACK/`degraded` → Tasks 3,8,9,11; functions same-origin `/api/*` → Task 9; zod in+out → Tasks 2,8,9; text-only render / no HTML → Task 10; map + conditions + travel gaps → Tasks 10–11; a11y (`aria-live`, semantic `<ol>`, labels, focus, contrast, non-color cue, reduced-motion) → Tasks 10–11; netlify.toml headers + rate limiting → Tasks 1,12; vitest unit+handler → all lib/handler tasks; deploy → Tasks 1,12. **Gap intentionally deferred:** Netlify rate-limiting config + OSRM routing = stretch (noted in README known-limits). No `VITE_` key, `.env` gitignored → done in foundation.

**Placeholder scan:** none — concrete file paths, code, commands, commit messages throughout.

**Type consistency:** `Candidate`/`Stop`/`RichStop`/`Itinerary`/`RerouteResult` defined once in Shared Contracts and referenced verbatim; `tagToType`, `haversineKm`, `walkMinutes`, `trimCandidates`, `parseModelJson`, `validatePlanBody`, `sequenceDay`, `rerouteDay`, `plan`, `reroute`, `fallbackItinerary` names are consistent across tasks.
