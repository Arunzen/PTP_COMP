# Lodestar — Technical Requirements Document

**Companion to:** `PRD.md`
**Scope:** how we build the 1-hour MVP that demos the *plan → disruption → live reroute → explanation* loop without ever showing a dead screen.

---

## 1. Architecture decision

**Deterministic, fully offline, single self-contained `index.html`.**

- No backend, no API keys, no network calls, no build step. Open the file in any browser and it works.
- The engine is a small rule-based scheduler over a curated, in-file POI dataset.
- The "what changed & why" line is **templated** (string assembly from the reroute diff), not LLM-generated — so it is instant and cannot fail on stage.

Rationale: the PRD's success signals ("generates in under ~5s", "never shows a dead screen") and the explicit cut of live feeds / routing APIs all point to a self-contained deterministic core. There is no network to drop during the demo. (LLM polish of the explanation is a post-hackathon item — see §9.)

**Stack:** vanilla HTML + CSS + JS, everything inline in `PTP_COMP/index.html`. No dependencies.

---

## 2. Data model

### City
```
City { id, name, defaultStartHour }
```

### Stop (POI)
```
Stop {
  id, cityId, name,
  category,        // 'museum'|'gallery'|'market'|'park'|'walk'|'viewpoint'
                   // |'landmark'|'cafe'|'restaurant'
  indoor,          // boolean — drives the rain reroute
  interests,       // ['art','food','history','nature','shopping','architecture','nightlife']
  area,            // neighbourhood id — used for travel-time approximation
  openHour, closeHour,   // 24h ints
  durationMin,     // typical visit length
  cost,            // 0..3 budget tier ($ .. $$$)
  blurb            // one human sentence, shown on the card
}
```

We ship **2 cities** (Lisbon, Kyoto) with ~12–14 stops each, enough variety that NL intake feels real and the rain reroute always has indoor alternatives to draw from.

### Travel time (no maps API)
Approximated, not routed:
- same `area` → 10 min
- different `area` → 25 min

A constant-ish approximation is sufficient for believable time blocking; true sequencing/distance matrix is explicitly post-hackathon (PRD §8).

---

## 3. Natural-language intake

Plain-English textarea + a few example-prompt chips that guarantee a strong demo plan.

Parser is **keyword extraction**, defaulting sensibly when a field is absent:
- **city** — match city names/aliases; default = first city if none found.
- **interests** — keyword map (`art, museum, gallery → art`; `eat, food, foodie → food`; `history, old, ruins → history`; `nature, park, garden, outdoors → nature`; `shop, market → shopping`; etc.). Default = balanced set.
- **budget** — `cheap/budget → 1`, `mid → 2`, `splurge/fancy/luxury → 3`, or a number; default = 2.
- **pace** — `chill/relaxed → relaxed (4 stops)`, `packed/see everything → packed (6 stops)`; default = balanced (5 stops).

If parsing finds essentially nothing, we still fall back to a curated showcase day for the default city (§7) — the screen is never empty.

---

## 4. Scheduler (P0 plan generation)

Greedy, deterministic, explainable.

1. Filter stops to the chosen city.
2. **Score** each stop: `+2` per matching interest, `+1` if cost ≤ budget, small bonus for "signature" landmarks.
3. **Anchor meals**: pick a lunch restaurant (~13:00) and a dinner restaurant (~19:00) that fit budget.
4. **Fill** morning and afternoon with top-scored non-meal stops, **alternating indoor/outdoor** where possible, until we reach the pace target (~5 stops total incl. meals).
5. **Time-block sequentially** from `defaultStartHour`: place a stop only if it is open at arrival; advance clock by `durationMin` + travel time to the next stop; skip/replace anything that can't open in time.

Output: an ordered `itinerary` array of `{ stop, startMin, endMin }`, plus a `nowMin` marker (default **14:00 / 2pm**, matching the PRD's "rain at 2pm" scenario).

---

## 5. Reroute engine (the heart)

Disruptions act only on stops **at or after `nowMin`** (past stops are locked). Each reroute recomputes the remaining timeline, produces a structured **diff**, and re-renders with animation.

Three user-triggered disruptions:

| Trigger | Rule |
|---|---|
| **☔ Rain starts now** | Replace each remaining **outdoor** stop with the best-scoring **indoor** stop not already in the plan (same city, interest-matched). Re-time the tail. Meals untouched. |
| **🚫 Stop just closed** (pick one) | Remove the selected stop; insert the best similar-vibe alternative (prefer same `area`/category); re-time the tail. |
| **⏰ Running 90 min behind** | Push all remaining stops +90 min; drop the lowest-scored stop(s) that no longer fit before the dinner anchor; **keep dinner on time**. |

Diff shape:
```
Diff {
  removed: [stopId...],
  added:   [stopId...],
  moved:   [stopId...],   // same stop, new time
  reason:  'rain' | 'closed' | 'behind',
  meta:    { closedStopName?, minutesBehind? }
}
```

---

## 6. Explanation generator

Templated assembly from the diff — reads like a smart human, not JSON.

Examples:
- **Rain:** `☔ Rain rolled in at 2:00 PM. I swapped your outdoor Alfama Walk and Miradouro for the indoor Gulbenkian Museum and Time Out Market — both still match your love of art & food. Your 7:30 PM dinner at Ramiro is untouched.`
- **Closed:** `Jerónimos Monastery just closed. I slotted in the nearby Belém Cultural Centre (same area, similar vibe) and nudged your afternoon back 15 min.`
- **Behind:** `You're running 90 min behind. I dropped the LX Factory stroll (lowest on your list today) so you still make your 7:30 dinner, and shifted everything else back.`

Rules: name the moved/added/removed stops explicitly, tie the change back to a stated interest, and always reassure that the dinner anchor survives.

---

## 7. Fallback / "never a dead screen"

Because everything is local and deterministic there is no runtime to fail. Belt-and-suspenders anyway:
- Empty/garbage intake → curated showcase day for the default city.
- A reroute with no valid swap available → keep the original stop and explain honestly ("nothing better open right now, keeping X").
- A "Try a demo prompt" chip preloads a known-good itinerary so the stage demo is one click from a perfect plan.

---

## 8. UI

Single page, three zones:
1. **Intake** — textarea + example chips + "Plan my day".
2. **Itinerary timeline** — vertical cards (time, name, category icon, indoor/outdoor badge, cost `$`, blurb), with a `now` marker line.
3. **Disruption bar** — three buttons (+ a small select for which stop "closed"), and an **explanation banner** that appears on reroute.

**Highlight animation** on reroute: added = green slide-in/pulse, removed = fade + strike-out then collapse, moved = subtle position shift. This is the "magic" beat the PRD designs backwards from.

Palette: warm sand + teal, clean modern travel-app feel.

---

## 9. Out of scope (post-hackathon)

Per PRD §8: sensed real disruptions (weather/transit/closure feeds), LLM-polished explanations, group/multi-day/multi-city, a true travel-time matrix, and one-tap rebooking. None of it ships today.
