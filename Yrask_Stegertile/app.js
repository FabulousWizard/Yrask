const map = L.map("map").setView([58.75, 25.0], 8);

const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "© OpenStreetMap contributors"
}).addTo(map);

const orthoDemo = L.tileLayer("https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "© OpenStreetMap contributors"
});

let currentBase = osm;

const markers = L.layerGroup([
  L.marker([59.437, 24.753]).bindPopup("Tallinn"),
  L.marker([58.378, 26.729]).bindPopup("Tartu"),
  L.marker([58.385, 24.497]).bindPopup("Pärnu")
]).addTo(map);

const parcels = L.layerGroup([
  L.polygon([
    [58.38, 26.72],
    [58.39, 26.72],
    [58.39, 26.75],
    [58.38, 26.75]
  ]).bindPopup("Näidis-katastriüksus")
]);

const forest = L.layerGroup([
  L.circle([58.7, 25.4], { radius: 12000 }).bindPopup("Näidis metsainfo ala")
]);

const weatherLayer = L.layerGroup().addTo(map);

const weatherStatus = document.getElementById("weatherStatus");
const debugStatus = document.getElementById("debugStatus");
const lastUpdatedEl = document.getElementById("lastUpdated");
const nextRefreshEl = document.getElementById("nextRefresh");
const legendEl = document.getElementById("legend");
const copyrightEl = document.getElementById("copyright");
const layerWeatherToggle = document.getElementById("layerWeather");

const WEATHER_XML_PATH = "/data/weather.xml";
const WEATHER_REFRESH_MS = 10 * 60 * 1000;
const WEATHER_TIMEOUT_MS = 8000;

let weatherRefreshTimer = null;
let activeLoadId = 0;
let lastWeatherPayload = null;

const COUNTY_CENTERS = [
  { name: "Harju maakond", shortName: "Harju", lat: 59.33, lon: 24.75 },
  { name: "Hiiu maakond", shortName: "Hiiu", lat: 58.92, lon: 22.60 },
  { name: "Ida-Viru maakond", shortName: "Ida-Viru", lat: 59.25, lon: 27.35 },
  { name: "Jõgeva maakond", shortName: "Jõgeva", lat: 58.75, lon: 26.40 },
  { name: "Järva maakond", shortName: "Järva", lat: 58.92, lon: 25.55 },
  { name: "Lääne maakond", shortName: "Lääne", lat: 58.90, lon: 23.75 },
  { name: "Lääne-Viru maakond", shortName: "Lääne-Viru", lat: 59.20, lon: 26.35 },
  { name: "Põlva maakond", shortName: "Põlva", lat: 58.05, lon: 27.10 },
  { name: "Pärnu maakond", shortName: "Pärnu", lat: 58.35, lon: 24.60 },
  { name: "Rapla maakond", shortName: "Rapla", lat: 58.92, lon: 24.80 },
  { name: "Saare maakond", shortName: "Saare", lat: 58.35, lon: 22.45 },
  { name: "Tartu maakond", shortName: "Tartu", lat: 58.38, lon: 26.75 },
  { name: "Valga maakond", shortName: "Valga", lat: 57.86, lon: 26.20 },
  { name: "Viljandi maakond", shortName: "Viljandi", lat: 58.35, lon: 25.55 },
  { name: "Võru maakond", shortName: "Võru", lat: 57.82, lon: 27.05 }
];

const STATION_COUNTY_OVERRIDES = {
  "tallinn-harku": "Harju maakond",
  tallinn: "Harju maakond",
  harku: "Harju maakond",
  pirita: "Harju maakond",
  naissaare: "Harju maakond",
  "rohu-neeme": "Harju maakond",
  rohuneeme: "Harju maakond",
  paldiski: "Harju maakond",
  jõhvi: "Ida-Viru maakond",
  johvi: "Ida-Viru maakond",
  narva: "Ida-Viru maakond",
  vaindloo: "Lääne-Viru maakond",
  kunda: "Lääne-Viru maakond",
  "väike-maarja": "Lääne-Viru maakond",
  "vaike-maarja": "Lääne-Viru maakond",
  jõgeva: "Jõgeva maakond",
  jogeva: "Jõgeva maakond",
  mustvee: "Jõgeva maakond",
  tooma: "Järva maakond",
  türi: "Järva maakond",
  tyri: "Järva maakond",
  haapsalu: "Lääne maakond",
  "lääne-nigula": "Lääne maakond",
  "laane-nigula": "Lääne maakond",
  osmussaare: "Lääne maakond",
  dirhami: "Lääne maakond",
  heltermaa: "Hiiu maakond",
  kõrgessaare: "Hiiu maakond",
  korgessaare: "Hiiu maakond",
  pärnu: "Pärnu maakond",
  parnu: "Pärnu maakond",
  kihnu: "Pärnu maakond",
  häädemeeste: "Pärnu maakond",
  haademeeste: "Pärnu maakond",
  kuusiku: "Rapla maakond",
  roomassaare: "Saare maakond",
  sõrve: "Saare maakond",
  sorve: "Saare maakond",
  vilsandi: "Saare maakond",
  ruhnu: "Saare maakond",
  mõntu: "Saare maakond",
  montu: "Saare maakond",
  virtsu: "Pärnu maakond",
  "tartu-tõravere": "Tartu maakond",
  "tartu-toravere": "Tartu maakond",
  tõravere: "Tartu maakond",
  toravere: "Tartu maakond",
  valga: "Valga maakond",
  viljandi: "Viljandi maakond",
  võru: "Võru maakond",
  voru: "Võru maakond"
};

function setText(element, value) {
  if (element) element.textContent = value;
}

function setWeatherStatus(text) {
  setText(weatherStatus, text);
}

function setDebug(text) {
  setText(debugStatus, text);
}

function setLastUpdated(text) {
  setText(lastUpdatedEl, text);
}

function setNextRefresh(text) {
  setText(nextRefreshEl, text);
}

function isWeatherVisible() {
  return !!layerWeatherToggle?.checked;
}

function updateLegendVisibility() {
  if (legendEl) legendEl.style.display = isWeatherVisible() ? "block" : "none";
}

function toggleLayer(isChecked, layer) {
  if (isChecked) {
    layer.addTo(map);
  } else {
    map.removeLayer(layer);
  }
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[()]/g, "")
    .replace(/\s+/g, "-");
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function firstDefined(...values) {
  return values.find(value => value !== undefined && value !== null && value !== "");
}

function parseTimestamp(value) {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (!str || str === "0") return null;

  if (/^\d+$/.test(str)) {
    const n = Number(str);
    return n < 1e12 ? n * 1000 : n;
  }

  const direct = Date.parse(str);
  if (Number.isFinite(direct)) return direct;

  let match = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (match) {
    const [, dd, mm, yyyy, hh, min, ss] = match;
    return Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min), Number(ss || 0));
  }

  match = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (match) {
    const [, yyyy, mm, dd, hh, min, ss] = match;
    return Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min), Number(ss || 0));
  }

  return null;
}

function formatDateTime(ms) {
  if (!Number.isFinite(ms)) return "-";
  return new Date(ms).toLocaleString("et-EE", {
    timeZone: "Europe/Tallinn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatDuration(ms) {
  const sec = Math.max(0, Math.round(ms / 1000));
  const min = Math.floor(sec / 60);
  const rest = sec % 60;
  return min > 0 ? `${min}m ${rest}s` : `${rest}s`;
}

function parseWeatherXml(xmlText) {
  const xml = new DOMParser().parseFromString(xmlText, "application/xml");
  if (xml.querySelector("parsererror")) {
    throw new Error("XML parsimine ebaõnnestus");
  }

  const root = xml.querySelector("observations") || xml.documentElement;
  const snapshotTime = parseTimestamp(
    firstDefined(
      root?.getAttribute?.("timestamp"),
      root?.getAttribute?.("time"),
      root?.getAttribute?.("datetime"),
      root?.querySelector?.("timestamp")?.textContent,
      root?.querySelector?.("time")?.textContent,
      root?.querySelector?.("datetime")?.textContent
    )
  );

  const stationNodes = [...xml.querySelectorAll("station"), ...xml.querySelectorAll("jaam")];
  const observations = stationNodes.map(station => {
    const value = selector => station.querySelector(selector)?.textContent?.trim() || null;
    const stationName = firstDefined(
      value("name"),
      value("stationName"),
      value("jaam"),
      value("title")
    );

    const stationTimestamp = parseTimestamp(
      firstDefined(
        station.getAttribute?.("timestamp"),
        station.getAttribute?.("time"),
        value("timestamp"),
        value("time"),
        value("datetime"),
        value("dateTime")
      )
    );

    return {
      stationId: firstDefined(value("wmocode"), value("stationid"), value("station_id"), value("id"), stationName),
      stationName,
      lat: toNumber(firstDefined(value("latitude"), value("lat"), value("y"))),
      lon: toNumber(firstDefined(value("longitude"), value("lon"), value("lng"), value("x"))),
      county: firstDefined(value("county"), value("maakond"), value("countyName")),
      time: stationTimestamp || snapshotTime,
      temperature: toNumber(firstDefined(value("airtemperature"), value("airTemperature"), value("temperature"), value("value"))),
      windSpeed: toNumber(firstDefined(value("windspeed"), value("windSpeed"), value("wind_speed"), value("speed"))),
      windDirection: toNumber(firstDefined(value("winddirection"), value("windDirection"), value("wind_direction"), value("direction"), value("degree"), value("deg")))
    };
  }).filter(obs =>
    Number.isFinite(obs.lat) &&
    Number.isFinite(obs.lon) &&
    (Number.isFinite(obs.temperature) || Number.isFinite(obs.windSpeed) || Number.isFinite(obs.windDirection))
  );

  return { snapshotTime, observations };
}

function getCountyByName(value) {
  if (!value) return null;
  const normalized = normalizeText(value);
  return COUNTY_CENTERS.find(county =>
    normalizeText(county.name) === normalized ||
    normalizeText(county.shortName) === normalized
  ) || null;
}

function nearestCounty(lat, lon) {
  let best = COUNTY_CENTERS[0];
  let bestDistance = Infinity;

  for (const county of COUNTY_CENTERS) {
    const dLat = lat - county.lat;
    const dLon = lon - county.lon;
    const distance = dLat * dLat + dLon * dLon;
    if (distance < bestDistance) {
      best = county;
      bestDistance = distance;
    }
  }

  return best;
}

function resolveCounty(obs) {
  const fromApi = getCountyByName(obs.county);
  if (fromApi) return fromApi;

  const stationName = normalizeText(obs.stationName);
  for (const [needle, countyName] of Object.entries(STATION_COUNTY_OVERRIDES)) {
    if (stationName.includes(needle)) {
      return getCountyByName(countyName) || nearestCounty(obs.lat, obs.lon);
    }
  }

  return nearestCounty(obs.lat, obs.lon);
}

function average(values) {
  const filtered = values.filter(Number.isFinite);
  if (!filtered.length) return null;
  return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

function averageWindDirection(rows) {
  const filtered = rows.filter(row => Number.isFinite(row.windSpeed) && Number.isFinite(row.windDirection));
  if (!filtered.length) return null;

  let x = 0;
  let y = 0;

  for (const row of filtered) {
    const radians = row.windDirection * Math.PI / 180;
    x += row.windSpeed * Math.sin(radians);
    y += row.windSpeed * Math.cos(radians);
  }

  let degrees = Math.atan2(x, y) * 180 / Math.PI;
  if (degrees < 0) degrees += 360;
  return degrees;
}

function calculateCountyStats(observations) {
  const buckets = new Map();

  for (const obs of observations) {
    const county = resolveCounty(obs);
    const key = county.name;
    if (!buckets.has(key)) buckets.set(key, { county, rows: [] });
    buckets.get(key).rows.push(obs);
  }

  return [...buckets.values()]
    .map(({ county, rows }) => ({
      countyName: county.name,
      shortName: county.shortName,
      lat: county.lat,
      lon: county.lon,
      stationCount: rows.length,
      temperature: average(rows.map(row => row.temperature)),
      windSpeed: average(rows.map(row => row.windSpeed)),
      windDirection: averageWindDirection(rows),
      stations: rows
    }))
    .sort((a, b) => a.countyName.localeCompare(b.countyName, "et"));
}

function temperatureColor(temp) {
  if (!Number.isFinite(temp)) return "#e5e7eb";
  if (temp < -10) return "#1d4ed8";
  if (temp < 0) return "#60a5fa";
  if (temp < 10) return "#86efac";
  if (temp < 20) return "#facc15";
  if (temp < 25) return "#fb923c";
  return "#ef4444";
}

function windDirectionName(degrees) {
  if (!Number.isFinite(degrees)) return "-";
  const names = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return names[Math.round(degrees / 45) % 8];
}

function renderWeatherLabel(stats) {
  const direction = Number.isFinite(stats.windDirection) ? stats.windDirection : 0;
  const temp = Number.isFinite(stats.temperature) ? `${stats.temperature.toFixed(1)}°C` : "-";
  const wind = Number.isFinite(stats.windSpeed) ? `${stats.windSpeed.toFixed(1)} m/s` : "-";

  return `
    <div class="county-weather-label">
      <div class="county-weather-name">${stats.shortName}</div>
      <div class="county-weather-temp">${temp}</div>
      <div class="county-weather-wind">
        <span class="wind-arrow" style="transform: rotate(${direction}deg)">↑</span>
        <span>${wind} ${windDirectionName(stats.windDirection)}</span>
      </div>
    </div>
  `;
}

function renderWeatherPopup(stats) {
  const stationNames = stats.stations
    .map(station => station.stationName)
    .filter(Boolean)
    .slice(0, 10)
    .join(", ");

  return `
    <strong>${stats.countyName}</strong><br>
    Temperatuur: ${Number.isFinite(stats.temperature) ? stats.temperature.toFixed(1) : "-"} °C<br>
    Tuule kiirus: ${Number.isFinite(stats.windSpeed) ? stats.windSpeed.toFixed(1) : "-"} m/s<br>
    Tuule suund: ${Number.isFinite(stats.windDirection) ? stats.windDirection.toFixed(0) : "-"}° ${windDirectionName(stats.windDirection)}<br>
    Jaamu arvestatud: ${stats.stationCount}<br>
    ${stationNames ? `Jaamad: ${stationNames}` : ""}
  `;
}

function clearWeatherLayer() {
  weatherLayer.clearLayers();
}

function drawWeatherLayer(payload) {
  clearWeatherLayer();

  const visibleStats = payload.countyStats.filter(stat =>
    Number.isFinite(stat.temperature) || Number.isFinite(stat.windSpeed) || Number.isFinite(stat.windDirection)
  );

  visibleStats.forEach(stats => {
    const circle = L.circleMarker([stats.lat, stats.lon], {
      radius: 32,
      color: "#334155",
      weight: 1,
      fillColor: temperatureColor(stats.temperature),
      fillOpacity: 0.58
    }).bindPopup(renderWeatherPopup(stats));

    const label = L.marker([stats.lat, stats.lon], {
      icon: L.divIcon({
        className: "",
        html: renderWeatherLabel(stats),
        iconSize: [120, 70],
        iconAnchor: [60, 35]
      })
    }).bindPopup(renderWeatherPopup(stats));

    circle.addTo(weatherLayer);
    label.addTo(weatherLayer);
  });

  const withTemperature = visibleStats.filter(stats => Number.isFinite(stats.temperature)).length;
  const withWind = visibleStats.filter(stats => Number.isFinite(stats.windSpeed)).length;
  const timeText = Number.isFinite(payload.snapshotTime) ? formatDateTime(payload.snapshotTime) : "-";

  setWeatherStatus(
    `${payload.sourceLabel}. Andmehetk: ${timeText}. Kuvatud maakondi: ${visibleStats.length}. Temperatuuriga: ${withTemperature}, tuulega: ${withWind}.`
  );
  setLastUpdated(Number.isFinite(payload.snapshotTime) ? `Viimane andmehetk: ${timeText}` : "Viimane andmehetk: -");
}

function applyWeatherPayload(payload) {
  lastWeatherPayload = payload;
  if (isWeatherVisible()) {
    drawWeatherLayer(payload);
  }
}

async function fetchWeatherXml() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), WEATHER_TIMEOUT_MS);

  try {
    setDebug(`Laen XML-faili: ${WEATHER_XML_PATH}`);
    const response = await fetch(WEATHER_XML_PATH, {
      cache: "no-store",
      headers: { Accept: "application/xml,text/xml" },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`XML vastas staatusega ${response.status}`);
    }

    const xmlText = await response.text();
    setDebug(`XML HTTP ${response.status} — saadud`);
    return xmlText;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`XML timeout pärast ${WEATHER_TIMEOUT_MS} ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function scheduleNextRefresh() {
  if (weatherRefreshTimer) clearTimeout(weatherRefreshTimer);
  setNextRefresh(`Järgmine automaatne värskendus: ${formatDuration(WEATHER_REFRESH_MS)} pärast`);
  weatherRefreshTimer = setTimeout(() => {
    loadWeatherData("automaatne värskendus");
  }, WEATHER_REFRESH_MS);
}

async function loadWeatherData(reason = "alglaadimine") {
  const loadId = ++activeLoadId;
  const started = performance.now();

  setDebug(`Alustan XML laadimist (${reason})...`);
  if (!lastWeatherPayload) {
    setWeatherStatus("Laadin XML-i...");
  }

  try {
    const xmlText = await fetchWeatherXml();
    if (loadId !== activeLoadId) return;

    setDebug("Parsin XML-i...");
    const parsed = parseWeatherXml(xmlText);

    if (!parsed.observations.length) {
      setWeatherStatus("XML-fail on olemas, kuid ilmajaamu veel ei leitud.");
      setDebug(`XML olemas, aga jaamu ei leitud (${Math.round(performance.now() - started)} ms)`);
      setLastUpdated("Viimane andmehetk: -");
      scheduleNextRefresh();
      return;
    }

    const countyStats = calculateCountyStats(parsed.observations);
    const payload = {
      sourceLabel: "Ilmateenistuse XML",
      snapshotTime: parsed.snapshotTime,
      countyStats
    };

    setDebug("Koondan maakondade kaupa...");
    applyWeatherPayload(payload);

    const elapsed = Math.round(performance.now() - started);
    setDebug(`Valmis (${elapsed} ms)`);
  } catch (error) {
    const elapsed = Math.round(performance.now() - started);
    console.error(error);
    if (!lastWeatherPayload) {
      setWeatherStatus(`Ilmaandmete laadimine ebaõnnestus: ${error.message}`);
    }
    setDebug(`Viga (${elapsed} ms): ${error.message}`);
  } finally {
    if (loadId === activeLoadId) {
      scheduleNextRefresh();
    }
  }
}

function wireUi() {
  document.getElementById("closeSidebar")?.addEventListener("click", () => {
    document.getElementById("sidebar")?.classList.add("closed");
  });

  document.getElementById("openSidebar")?.addEventListener("click", () => {
    document.getElementById("sidebar")?.classList.remove("closed");
  });

  document.getElementById("layerMarkers")?.addEventListener("change", event => {
    toggleLayer(event.target.checked, markers);
  });

  document.getElementById("layerParcels")?.addEventListener("change", event => {
    toggleLayer(event.target.checked, parcels);
  });

  document.getElementById("layerForest")?.addEventListener("change", event => {
    toggleLayer(event.target.checked, forest);
  });

  layerWeatherToggle?.addEventListener("change", event => {
    if (event.target.checked) {
      if (lastWeatherPayload) {
        drawWeatherLayer(lastWeatherPayload);
      } else {
        loadWeatherData("kiht aktiveeritud");
      }
    } else {
      clearWeatherLayer();
    }
    updateLegendVisibility();
  });

  document.querySelectorAll(".basemap-btn").forEach(button => {
    button.addEventListener("click", () => {
      map.removeLayer(currentBase);
      currentBase = button.dataset.map === "osm" ? osm : orthoDemo;
      currentBase.addTo(map);
    });
  });

  map.on("click", event => {
    const lat = event.latlng.lat.toFixed(6);
    const lng = event.latlng.lng.toFixed(6);

    setText(document.getElementById("coords"), `Koordinaadid: ${lat}, ${lng}`);
    setText(document.getElementById("infoBox"), `Valitud punkt: ${lat}, ${lng}`);
  });

  document.getElementById("searchBtn")?.addEventListener("click", () => {
    const query = (document.getElementById("searchInput")?.value || "").trim().toLowerCase();
    const places = {
      tallinn: [59.437, 24.753],
      tartu: [58.378, 26.729],
      pärnu: [58.385, 24.497],
      parnu: [58.385, 24.497]
    };

    if (places[query]) {
      map.setView(places[query], 13);
    } else {
      alert("Prototüübis on otsingus näiteks: Tallinn, Tartu, Pärnu");
    }
  });

  document.getElementById("measureBtn")?.addEventListener("click", () => {
    alert("Mõõtmise tööriista saab lisada järgmises etapis Leaflet.draw või Leaflet-measure pluginaga.");
  });

  copyrightEl.textContent = "Aluskaart: prototüüp / demo. Ilmaandmed: Ilmateenistuse XML";
}

function init() {
  wireUi();
  updateLegendVisibility();
  setNextRefresh("Järgmine automaatne värskendus: -");
  loadWeatherData("alglaadimine");
}

init();