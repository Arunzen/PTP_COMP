// Open-Meteo: geocoding + hourly forecast. No API key. Used by engine.js.
const UA = { "User-Agent": "tp-engine/2.0" };

// city -> { lat, lng, name }. Throws geocode_failed when no match.
export async function geocode(city) {
  const url =
    `https://geocoding-api.open-meteo.com/v1/search` +
    `?name=${encodeURIComponent(city)}&count=1`;
  const res = await fetch(url, { headers: UA });
  const json = await res.json();
  const r = json.results && json.results[0];
  if (!r) throw new Error("geocode_failed");
  return { lat: r.latitude, lng: r.longitude, name: r.name };
}

// lat,lng -> { summary, hourly:[{hour,rainProb,tempC}] }.
export async function forecast(lat, lng, _date) {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lng}` +
    `&hourly=precipitation_probability,temperature_2m&forecast_days=1`;
  const res = await fetch(url, { headers: UA });
  const json = await res.json();
  const h = json.hourly;
  const hourly = h.time.map((iso, i) => ({
    hour: parseInt(iso.slice(11, 13), 10),
    rainProb: Math.round(h.precipitation_probability[i]),
    tempC: h.temperature_2m[i],
  }));
  return { summary: buildSummary(hourly), hourly };
}

const pad = (n) => String(n).padStart(2, "0");

// Name the first contiguous window where rainProb >= 50, else "Dry day".
function buildSummary(hourly) {
  let startIdx = -1;
  for (let i = 0; i < hourly.length; i++) {
    const rainy = hourly[i].rainProb >= 50;
    if (rainy && startIdx === -1) startIdx = i;
    if (!rainy && startIdx !== -1) {
      return `Rain likely ${pad(hourly[startIdx].hour)}:00–${pad(hourly[i].hour)}:00`;
    }
  }
  if (startIdx !== -1) {
    const last = hourly[hourly.length - 1].hour;
    return `Rain likely ${pad(hourly[startIdx].hour)}:00–${pad((last + 1) % 24)}:00`;
  }
  return "Dry day";
}
