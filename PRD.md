# Lodestar — Product Requirements Document

**Tagline:** the day plan that reroutes itself.
**Team:** Prompt to Prototype · Problem statement: *Travel Planning & Experience Engine*
**Scope of this doc:** what we are building in a 1-hour hackathon sprint, and why.

---

## 1. The problem

Every travel app on the market is a fancy list generator. You enter your dates, it prints a static itinerary, and the moment reality touches it the plan is dead. Flight slips two hours, it starts raining at 2pm, a museum is unexpectedly closed, you're running 40 minutes behind — and now you're back to googling on a street corner.

The gap isn't *generating* a plan. It's keeping a plan **feasible and good while the world changes around it.**

## 2. Who it's for

A **solo traveler** with one day in a city. We pick solo deliberately: their constraints are sharp and self-contained (budget, interests, pace, energy) with no group negotiation to model, which lets the engine feel decisive instead of generic in a demo.

## 3. The insight (our wedge)

> An itinerary should be a *living object*, not a PDF.

Lodestar treats the day as state that continuously re-optimizes. When a disruption hits, the engine re-plans the rest of the day around the traveler's original constraints — and, critically, **explains what it changed and why.** The explanation is what turns a black box into something a judge (and a user) trusts.

## 4. Core loop

1. Traveler describes their trip in plain English (city, interests, budget, pace).
2. Engine returns a feasible, time-blocked day — ordered, mixing indoor/outdoor, respecting opening hours and realistic travel time.
3. A disruption is injected ("rain starts now", "this stop just closed", "running 90 min behind").
4. Engine reroutes the remaining day and shows a plain-language *what changed & why* summary, highlighting the moved/added stops.

That step-3-to-4 transition is the entire product. We design everything backwards from making it feel magical.

## 5. Scope

**In (P0 — must demo):**
- Single city, single day.
- Natural-language preference intake for one solo traveler.
- Engine-generated time-blocked itinerary (~5 stops).
- Live re-plan on disruption, with an explanation of the change.
- Visual highlight of what moved.

**Out (explicitly cut for the sprint):**
- Booking, payments, reservations.
- Multi-day or multi-city.
- User accounts / saved trips.
- Live flight / transit / weather feeds (disruptions are user-triggered, not sensed).
- Maps and routing APIs.

We cut these on purpose. Anyone wiring real-time feeds and a constraint solver in 60 minutes demos a spinning loader.

## 6. Demo win condition

The judges see a believable solo day for a real city, we hit it with rain on stage, and within a couple of seconds the outdoor walk becomes an indoor market + gallery, the dinner stop survives, and a one-line explanation tells them why. A **live reroute** beats any static reveal.

## 7. Success signals

- Plan generates in under ~5 seconds.
- Reroute visibly changes the right stops and keeps the day coherent.
- The "what changed & why" line reads like a smart human, not JSON.
- It never shows a dead screen during the demo (see fallback in TRD).

## 8. After the hackathon (vision slide)

Sensed disruptions (real weather + transit + closures), group trips, multi-day, a travel-time matrix for true sequencing, and one-tap rebooking. None of it in scope today — but it's the roadmap that makes the wedge a product.