import { useMemo, useState } from "react";
import { MapContainer, Marker, Popup, Polyline, TileLayer } from "react-leaflet";
import L from "leaflet";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { fallbackItinerary } from "../lib/fallback.js";

const DEFAULT_FORM = {
  city: "",
  prefs: "",
  budget: "2",
  pace: "balanced",
  date: "",
};

function formatHour(hour) {
  return `${String(hour).padStart(2, "0")}:00`;
}

function parseTimeMinutes(time) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function chooseClosedStop(itinerary) {
  if (!itinerary?.stops?.length) return undefined;
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const futureStops = itinerary.stops.filter(
    (stop) => parseTimeMinutes(stop.time) >= currentMinutes
  );
  const candidate = futureStops.find((stop) => stop.type !== "food") || futureStops[0];
  return candidate?.id || itinerary.stops[0]?.id;
}

L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

export default function App() {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [itinerary, setItinerary] = useState(null);
  const [status, setStatus] = useState("Ready to build your weather-aware day plan.");
  const [loading, setLoading] = useState(false);
  const [rerouteLoading, setRerouteLoading] = useState(false);
  const [error, setError] = useState(null);
  const [rerouteError, setRerouteError] = useState(null);
  const [changeSummary, setChangeSummary] = useState("");
  const [degradedNotice, setDegradedNotice] = useState("");

  const currentMapCenter = useMemo(() => {
    if (!itinerary?.stops?.length) return [0, 0];
    return [itinerary.stops[0].lat, itinerary.stops[0].lng];
  }, [itinerary]);

  const mapBounds = useMemo(() => {
    if (!itinerary?.stops?.length) return null;
    return L.latLngBounds(itinerary.stops.map((stop) => [stop.lat, stop.lng]));
  }, [itinerary]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setRerouteError(null);
    setChangeSummary("");
    setItinerary(null);
    setLoading(true);
    setStatus("Building your itinerary...");

    try {
      const response = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city: form.city.trim() || "Lisbon",
          prefs: form.prefs,
          budget: Number(form.budget),
          pace: form.pace,
          date: form.date || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok || data.error) {
        throw new Error(data.error || "plan_request_failed");
      }
      setItinerary(data);
      setDegradedNotice(data.degraded ? "Showing a fallback itinerary." : "");
      setStatus("Itinerary ready. Review the stops below.");
    } catch (err) {
      setError(
        "The server plan request failed. Showing a local fallback itinerary instead."
      );
      const fallback = fallbackItinerary(form.city.trim());
      setItinerary(fallback);
      setDegradedNotice("Live planning is unavailable. This is a curated fallback plan.");
      setStatus("Backend unavailable — local fallback shown.");
    } finally {
      setLoading(false);
    }
  };

  const handleReroute = async (disruption) => {
    if (!itinerary) return;
    setRerouteError(null);
    setChangeSummary("");
    setRerouteLoading(true);
    setStatus(`Rerouting for ${disruption}...`);

    try {
      const response = await fetch("/api/reroute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itinerary,
          disruption,
          now: new Date().toISOString(),
          closedId: disruption === "closed" ? chooseClosedStop(itinerary) : undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok || data.error) {
        throw new Error(data.error || "reroute_failed");
      }
      setItinerary(data);
      setDegradedNotice(data.degraded ? "Showing a fallback itinerary." : "");
      setChangeSummary(data.change_summary || "Your plan has been updated.");
      setStatus("Itinerary rerouted. Review the updated stops below.");
    } catch (err) {
      setRerouteError("Reroute failed. Please try again or review the current plan.");
    } finally {
      setRerouteLoading(false);
    }
  };

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">TP Engine</p>
          <h1>Day plans that reroute around real weather.</h1>
          <p className="hero-copy">
            Build a smart itinerary for the day with weather-aware stops,
            realistic travel gaps, and live place suggestions.
          </p>
        </div>
        <div className="hero-card">
          <strong>How it works</strong>
          <ol>
            <li>Enter a city and your preferences</li>
            <li>Choose budget and pace</li>
            <li>Generate a plan with weather-aware routing</li>
          </ol>
        </div>
      </header>

      <main className="content">
        <section className="panel">
          <h2>Create your plan</h2>
          <form onSubmit={handleSubmit} className="plan-form">
            <label>
              City
              <input
                name="city"
                value={form.city}
                onChange={handleChange}
                placeholder="e.g. Lisbon"
                required
              />
            </label>
            <label>
              Preferences
              <input
                name="prefs"
                value={form.prefs}
                onChange={handleChange}
                placeholder="art, food, walking, museums"
              />
            </label>
            <div className="field-row">
              <label>
                Budget
                <select
                  name="budget"
                  value={form.budget}
                  onChange={handleChange}
                >
                  <option value="1">Light</option>
                  <option value="2">Balanced</option>
                  <option value="3">Generous</option>
                </select>
              </label>
              <label>
                Pace
                <select name="pace" value={form.pace} onChange={handleChange}>
                  <option value="relaxed">Relaxed</option>
                  <option value="balanced">Balanced</option>
                  <option value="packed">Packed</option>
                </select>
              </label>
            </div>
            <label>
              Date
              <input
                type="date"
                name="date"
                value={form.date}
                onChange={handleChange}
              />
            </label>
            <button type="submit" disabled={loading}>
              {loading ? "Generating…" : "Generate plan"}
            </button>
          </form>
          <p className="status-message">{status}</p>
          {error ? <p className="error-message">{error}</p> : null}
        </section>

        {itinerary ? (
          <section className="panel results-panel">
            <div className="results-head">
              <div>
                <p className="meta">Destination</p>
                <h2>{itinerary.city}</h2>
                <p>{itinerary.summary}</p>
                {degradedNotice ? (
                  <p className="degraded-banner" role="status" aria-live="polite">
                    {degradedNotice}
                  </p>
                ) : null}
              </div>
              <div className="weather-card">
                <p className="meta">Weather</p>
                <strong>{itinerary.weather.summary}</strong>
                <div className="weather-grid">
                  {itinerary.weather.hourly.slice(0, 4).map((hour) => (
                    <div key={hour.hour} className="weather-cell">
                      <span>{formatHour(hour.hour)}</span>
                      <span>{hour.rainProb}% rain</span>
                      <span>{hour.tempC}°C</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {itinerary.stops.length ? (
              <div className="map-panel">
                <MapContainer
                  center={currentMapCenter}
                  bounds={mapBounds || undefined}
                  scrollWheelZoom={false}
                  style={{ height: "320px", width: "100%", borderRadius: "20px" }}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <Polyline
                    positions={itinerary.stops.map((stop) => [stop.lat, stop.lng])}
                    pathOptions={{ color: "#2563eb", weight: 4, opacity: 0.7 }}
                  />
                  {itinerary.stops.map((stop) => (
                    <Marker
                      key={stop.id}
                      position={[stop.lat, stop.lng]}
                    >
                      <Popup>
                        <strong>{stop.title}</strong>
                        <p>{stop.time} · {stop.type}</p>
                      </Popup>
                    </Marker>
                  ))}
                </MapContainer>
              </div>
            ) : null}

            <div className="action-row">
              <button
                type="button"
                className="reroute-button"
                onClick={() => handleReroute("rain")}
                disabled={rerouteLoading}
              >
                {rerouteLoading ? "Rerouting…" : "Reroute around rain"}
              </button>
              <button
                type="button"
                className="reroute-button secondary"
                onClick={() => handleReroute("closed")}
                disabled={rerouteLoading}
              >
                {rerouteLoading ? "Rerouting…" : "Reroute closed stop"}
              </button>
              <button
                type="button"
                className="reroute-button secondary"
                onClick={() => handleReroute("behind")}
                disabled={rerouteLoading}
              >
                {rerouteLoading ? "Rerouting…" : "Reroute if behind schedule"}
              </button>
            </div>

            {changeSummary ? (
              <div className="change-summary">
                <strong>Update:</strong> {changeSummary}
              </div>
            ) : null}
            {rerouteError ? (
              <p className="error-message">{rerouteError}</p>
            ) : null}

            <div className="stop-list">
              {itinerary.stops.map((stop) => (
                <article key={stop.id} className="stop-card">
                  <div className="stop-badge">{stop.time}</div>
                  <div className="stop-body">
                    <div className="stop-title-row">
                      <h3>{stop.title}</h3>
                      <span className="pill">{stop.type}</span>
                    </div>
                    <p>{stop.why}</p>
                    <div className="stop-meta">
                      <span>Travel {stop.travelFromPrevMin} min</span>
                      <span>{stop.durationMin} min stay</span>
                      <span>{stop.cost}</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
