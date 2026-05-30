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
const API_BASE = "/api";
const API_TIMEOUT_MS = 15000;

let weatherRefreshTimer = null;
let activeLoadId = 0;
let lastWeatherPayload = null;
let currentMode = "realtime";

const payloadCache = new Map();
let stationLookupCache = null;

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

const MODE_DESCRIPTIONS = {
  realtime: "Reaalajas: kohalik XML, värskendus iga 10 minuti järel.",
  day: "Päevane: observationDataDaily + observationWind.",
  month: "Kuu keskmine: sama API päevadest koondatult.",
  season: "Hooaja keskmine: kuu-/päevaandmetest tuletatult."
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

function getModeSelect() {
  return document.getElementById("weatherMode");
}

function setModeInfo(text) {
  const el = document.getElementById("modeInfo");
  if (el) el.textContent = text;
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

function formatMonthLabel(date) {
  return date.toLocaleDateString("et-EE", {
    timeZone: "Europe/Tallinn",
    year: "numeric",
    month: "long"
  });
}

function dateKeyTallinn(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Tallinn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function hourTallinn(date = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Tallinn",
    hour: "2-digit",
    hour12: false
  }).format(date);
}

function startOfMonthDate(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonthDate(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function getSeasonInfo(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth();

  if (month === 11 || month === 0 || month === 1) {
    const startYear = month === 11 ? year : year - 1;
    const endYear = month === 11 ? year + 1 : year;
    return {
      key: `winter-${startYear}-${endYear}`,
      label: `Talv ${startYear}/${endYear}`,
      start: new Date(startYear, 11, 1),
      end: new Date(endYear, 1, 28)
    };
  }

  if (month >= 2 && month <= 4) {
    return {
      key: `spring-${year}`,
      label: `Kevad ${year}`,
      start: new Date(year, 2, 1),
      end: new Date(year, 4, 31)
    };
  }

  if (month >= 5 && month <= 7) {
    return {
      key: `summer-${year}`,
      label: `Suvi ${year}`,
      start: new Date(year, 5, 1),
      end: new Date(year, 7, 31)
    };
  }

  return {
    key: `autumn-${year}`,
    label: `Sügis ${year}`,
    start: new Date(year, 8, 1),
    end: new Date(year, 10, 30)
  };
}

function getModeCacheKey(mode) {
  if (mode === "realtime") return "realtime";
  if (mode === "day") return `day-${dateKeyTallinn(new Date())}`;
  if (mode === "month") {
    const d = new Date();
    return `month-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  if (mode === "season") return `season-${getSeasonInfo().key}`;
  return mode;
}

function normalizeNamesList(value) {
  if (value === null || value === undefined) return [];
  const str = String(value).trim();
  if (!str) return [];
  return [str, normalizeText(str)];
}

function dmsToDecimal(deg, min, sec) {
  if (!Number.isFinite(deg)) return null;
  const abs = Math.abs(deg) + (Number.isFinite(min) ? min / 60 : 0) + (Number.isFinite(sec) ? sec / 3600 : 0);
  return deg < 0 ? -abs : abs;
}

function isHeaderLikeRow(name, record) {
  const n = normalizeText(name);
  if (n === "jaam" || n === "station" || n === "id") return true;
  return ![
    record.temperature,
    record.precipitation,
    record.windSpeed,
    record.windDirection,
    record.tempMin,
    record.tempMax,
    record.windSpeedMax
  ].some(Number.isFinite);
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
      value("stationname"),
      value("title"),
      value("jaam")
    );

    const ownTime = parseTimestamp(
      station.getAttribute?.("timestamp") ||
      station.getAttribute?.("time") ||
      value("timestamp") ||
      value("time") ||
      value("datetime") ||
      value("dateTime")
    );

    return {
      stationId: firstDefined(value("wmocode"), value("stationid"), value("stationId"), value("id"), stationName),
      stationName,
      lat: toNumber(firstDefined(value("latitude"), value("lat"), value("y"))),
      lon: toNumber(firstDefined(value("longitude"), value("lon"), value("lng"), value("x"))),
      time: ownTime || snapshotTime,
      temperature: toNumber(firstDefined(value("airtemperature"), value("airTemperature"), value("temperature"), value("value"))),
      precipitation: toNumber(firstDefined(value("precipitations"), value("precipitation"), value("precip"), value("rainfall"))),
      windSpeed: toNumber(firstDefined(value("windspeed"), value("windSpeed"), value("wind_speed"), value("speed"), value("ws"))),
      windDirection: toNumber(firstDefined(value("winddirection"), value("windDirection"), value("wind_direction"), value("direction"), value("degree"), value("deg")))
    };
  }).filter(obs => Number.isFinite(obs.lat) && Number.isFinite(obs.lon));

  return { snapshotTime, observations, source: "Ilmateenistuse XML" };
}

function average(values) {
  const filtered = values.filter(Number.isFinite);
  if (!filtered.length) return null;
  return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

function sum(values) {
  return values.filter(Number.isFinite).reduce((acc, value) => acc + value, 0);
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
  const rain = Number.isFinite(stats.precipitation) ? `${stats.precipitation.toFixed(1)} mm` : "-";

  return `
    <div class="county-weather-label">
      <div class="county-weather-name">${stats.shortName}</div>
      <div class="county-weather-temp">${temp}</div>
      <div class="county-weather-wind">
        <span class="wind-arrow" style="transform: rotate(${direction}deg)">↑</span>
        <span>${wind} ${windDirectionName(stats.windDirection)}</span>
      </div>
      <div class="county-weather-wind">${rain}</div>
    </div>
  `;
}

function renderWeatherPopup(stats) {
  const stationNames = (stats.stations || [])
    .map(station => station.stationName)
    .filter(Boolean)
    .slice(0, 10)
    .join(", ");

  return `
    <strong>${stats.countyName}</strong><br>
    Temperatuur: ${Number.isFinite(stats.temperature) ? stats.temperature.toFixed(1) : "-"} °C<br>
    Tuule kiirus: ${Number.isFinite(stats.windSpeed) ? stats.windSpeed.toFixed(1) : "-"} m/s<br>
    Tuule suund: ${Number.isFinite(stats.windDirection) ? stats.windDirection.toFixed(0) : "-"}° ${windDirectionName(stats.windDirection)}<br>
    Sademed: ${Number.isFinite(stats.precipitation) ? stats.precipitation.toFixed(1) : "-"} mm<br>
    Jaamu/vatlusi arvestatud: ${stats.stationCount || 0}<br>
    ${stationNames ? `Jaamad: ${stationNames}` : ""}
  `;
}

function clearWeatherLayer() {
  weatherLayer.clearLayers();
}

function countyStatsToPayload(countyStats, sourceLabel, snapshotTime, periodLabel = null) {
  return {
    sourceLabel,
    snapshotTime,
    periodLabel,
    countyStats
  };
}

function renderWeatherLayer(payload) {
  clearWeatherLayer();

  const visibleStats = payload.countyStats.filter(stat =>
    Number.isFinite(stat.temperature) ||
    Number.isFinite(stat.windSpeed) ||
    Number.isFinite(stat.windDirection) ||
    Number.isFinite(stat.precipitation)
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
        iconSize: [120, 80],
        iconAnchor: [60, 40]
      })
    }).bindPopup(renderWeatherPopup(stats));

    circle.addTo(weatherLayer);
    label.addTo(weatherLayer);
  });

  const withTemperature = visibleStats.filter(stats => Number.isFinite(stats.temperature)).length;
  const withWind = visibleStats.filter(stats => Number.isFinite(stats.windSpeed)).length;
  const withPrecip = visibleStats.filter(stats => Number.isFinite(stats.precipitation)).length;
  const timeText = payload.periodLabel || (Number.isFinite(payload.snapshotTime) ? formatDateTime(payload.snapshotTime) : "-");

  setWeatherStatus(
    `${payload.sourceLabel}. Andmehetk: ${timeText}. Kuvatud maakondi: ${visibleStats.length}. Temperatuuriga: ${withTemperature}. Tuulega: ${withWind}. Sademetega: ${withPrecip}.`
  );
  setLastUpdated(Number.isFinite(payload.snapshotTime) ? `Viimane andmehetk: ${timeText}` : "Viimane andmehetk: -");
}

function applyWeatherPayload(payload) {
  lastWeatherPayload = payload;
  payloadCache.set(getModeCacheKey(currentMode), payload);
  if (isWeatherVisible()) {
    renderWeatherLayer(payload);
  }
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

function resolveCountyForRecord(record) {
  if (record.countyName) {
    const county = getCountyByName(record.countyName);
    if (county) return county;
  }

  if (record.stationCountyName) {
    const county = getCountyByName(record.stationCountyName);
    if (county) return county;
  }

  if (record.lat !== null && record.lon !== null && Number.isFinite(record.lat) && Number.isFinite(record.lon)) {
    return nearestCounty(record.lat, record.lon);
  }

  const stationName = normalizeText(record.stationName);
  for (const [needle, countyName] of Object.entries(STATION_COUNTY_OVERRIDES)) {
    if (stationName.includes(needle)) {
      return getCountyByName(countyName) || nearestCounty(58.75, 25.0);
    }
  }

  const stationInfo = findStationLocation(record.stationName);
  if (stationInfo && Number.isFinite(stationInfo.lat) && Number.isFinite(stationInfo.lon)) {
    return nearestCounty(stationInfo.lat, stationInfo.lon);
  }

  return nearestCounty(58.75, 25.0);
}

function aggregateRecordsToCountyStats(records) {
  const buckets = new Map();

  for (const record of records) {
    const county = resolveCountyForRecord(record);
    const key = county.name;

    if (!buckets.has(key)) {
      buckets.set(key, {
        county,
        rows: []
      });
    }
    buckets.get(key).rows.push(record);
  }

  return [...buckets.values()].map(({ county, rows }) => {
    const temperatures = rows.map(row => row.temperature).filter(Number.isFinite);
    const precipitations = rows.map(row => row.precipitation).filter(Number.isFinite);
    const windSpeeds = rows.map(row => row.windSpeed).filter(Number.isFinite);
    const windRows = rows.filter(row => Number.isFinite(row.windSpeed) && Number.isFinite(row.windDirection));

    return {
      countyName: county.name,
      shortName: county.shortName,
      lat: county.lat,
      lon: county.lon,
      stationCount: rows.length,
      temperature: average(temperatures),
      precipitation: sum(precipitations),
      windSpeed: average(windSpeeds),
      windDirection: averageWindDirection(windRows),
      stations: rows
    };
  }).sort((a, b) => a.countyName.localeCompare(b.countyName, "et"));
}

function stationEntryToLocation(entry) {
  const lat = dmsToDecimal(toNumber(entry.LaiusKraad), toNumber(entry.LaiusMinut), toNumber(entry.LaiusSekund));
  const lon = dmsToDecimal(toNumber(entry.PikkusKraad), toNumber(entry.PikkusMinut), toNumber(entry.PikkusSekund));
  return { lat, lon };
}

function buildStationLookupFromEntries(entries) {
  const lookup = new Map();

  for (const entry of entries) {
    const { lat, lon } = stationEntryToLocation(entry);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const county = nearestCounty(lat, lon);
    const names = [
      entry.Longname,
      entry.LongName,
      entry.OfficialName,
      entry.name,
      entry.Name,
      entry.Station,
      entry.id,
      entry.station,
      entry.Longname && String(entry.Longname).replace(/\s*(RJ|MJ|SJ|HJ)$/i, "")
    ].filter(v => v !== undefined && v !== null && String(v).trim() !== "");

    for (const name of names) {
      const key = normalizeText(String(name));
      if (!key) continue;
      lookup.set(key, {
        lat,
        lon,
        countyName: county.name,
        countyShortName: county.shortName,
        stationLabel: String(names[0])
      });
    }
  }

  return lookup;
}

async function fetchJsonWithTimeout(url, timeoutMs = API_TIMEOUT_MS) {
  const controller = new AbortController();
  const started = performance.now();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal
    });

    const elapsed = Math.round(performance.now() - started);
    setDebug(`JSON ${response.status}: ${url} (${elapsed} ms)`);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }

    return await response.json();
  } catch (error) {
    const elapsed = Math.round(performance.now() - started);
    if (error.name === "AbortError") {
      throw new Error(`Timeout after ${timeoutMs} ms for ${url}`);
    }
    setDebug(`JSON viga (${elapsed} ms): ${url}`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function extractEntries(data) {
  const entries = data?.entries?.entry;
  if (Array.isArray(entries)) return entries;
  if (entries && typeof entries === "object") return [entries];
  return [];
}

async function loadStationLookup() {
  if (stationLookupCache) return stationLookupCache;

  try {
    const [meteo, coastline] = await Promise.all([
      fetchJsonWithTimeout(`${API_BASE}/v1/stations/meteoStations?valid=1`),
      fetchJsonWithTimeout(`${API_BASE}/v1/stations/coastlineStations?valid=1`)
    ]);

    const lookup = new Map([
      ...buildStationLookupFromEntries(extractEntries(meteo)),
      ...buildStationLookupFromEntries(extractEntries(coastline))
    ]);

    stationLookupCache = lookup;
    return lookup;
  } catch (error) {
    console.warn("Station lookup failed, continuing with overrides only:", error);
    stationLookupCache = new Map();
    return stationLookupCache;
  }
}

function findStationLocation(name) {
  if (!name || !stationLookupCache) return null;

  const normalized = normalizeText(name);
  if (stationLookupCache.has(normalized)) return stationLookupCache.get(normalized);

  for (const [key, value] of stationLookupCache.entries()) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return value;
    }
  }

  return null;
}

function normalizeRealtimeObservation(obs) {
  const stationInfo = findStationLocation(obs.stationName);
  return {
    stationName: obs.stationName,
    lat: Number.isFinite(obs.lat) ? obs.lat : stationInfo?.lat ?? null,
    lon: Number.isFinite(obs.lon) ? obs.lon : stationInfo?.lon ?? null,
    countyName: stationInfo?.countyName || null,
    temperature: obs.temperature,
    precipitation: obs.precipitation,
    windSpeed: obs.windSpeed,
    windDirection: obs.windDirection,
    stationCountyName: stationInfo?.countyName || null
  };
}

function normalizeDailyObservation(row) {
  const props = row || {};
  const stationName = firstDefined(props.Jaam, props.jaam, props.name, props.station, props.stationName, props.Station);
  const stationInfo = findStationLocation(stationName);

  return {
    stationName,
    lat: stationInfo?.lat ?? null,
    lon: stationInfo?.lon ?? null,
    countyName: stationInfo?.countyName || null,
    temperature: toNumber(firstDefined(props.ta24ha, props.ta1ha, props.tains, props.temp, props.ta24hx)),
    tempMin: toNumber(firstDefined(props.ta24hm, props.ta1hm)),
    tempMax: toNumber(firstDefined(props.ta24hx, props.ta1hx)),
    precipitation: toNumber(firstDefined(props.pr24hs, props.pr1hs, props.prm1mos, props.prv24hs06, props.pr24hs06)),
    windSpeed: toNumber(firstDefined(props.ws24ha, props.ws10ma, props.ws1ha, props.ws1hx)),
    windSpeedMax: toNumber(firstDefined(props.ws24hx, props.ws1hx)),
    windDirection: toNumber(firstDefined(props.wd10ma, props.wd1ha, props.wind_direction))
  };
}

function normalizeWindObservation(row) {
  const props = row || {};
  const stationName = firstDefined(props.Jaam, props.jaam, props.name, props.station, props.stationName, props.Station);
  const stationInfo = findStationLocation(stationName);

  return {
    stationName,
    lat: stationInfo?.lat ?? null,
    lon: stationInfo?.lon ?? null,
    countyName: stationInfo?.countyName || null,
    windSpeed: toNumber(firstDefined(props.ws10ma, props.ws1ha, props.ws1hx)),
    windSpeedMax: toNumber(firstDefined(props.ws1hx)),
    windDirection: toNumber(firstDefined(props.wd10ma, props.wd1ha))
  };
}

function normalizeWindMapObservation(row) {
  const props = row || {};
  const stationName = firstDefined(
    props.Jaam,
    props.jaam,
    props.name,
    props.station,
    props.stationName
  );

  const stationInfo = findStationLocation(stationName);

  return {
    stationName,
    lat: stationInfo?.lat ?? dmsToDecimal(
      toNumber(props.LaiusKraad),
      toNumber(props.LaiusMinut),
      toNumber(props.LaiusSekund)
    ) ?? null,
    lon: stationInfo?.lon ?? dmsToDecimal(
      toNumber(props.PikkusKraad),
      toNumber(props.PikkusMinut),
      toNumber(props.PikkusSekund)
    ) ?? null,
    countyName: stationInfo?.countyName || null,
    windSpeed: toNumber(firstDefined(props.ws10ma, props.ws1ha, props.ws1hx)),
    windSpeedMax: toNumber(firstDefined(props.ws1hx)),
    windDirection: toNumber(firstDefined(props.wd10ma, props.wd1ha))
  };
}

function combineDailyAndWindRows(dailyRows, windRows, windMapRows = []) {
  const combined = new Map();

  for (const row of dailyRows) {
    if (!row.stationName || isHeaderLikeRow(row.stationName, row)) continue;
    const key = normalizeText(row.stationName);
    combined.set(key, {
      ...row,
      stationName: row.stationName
    });
  }

  for (const row of windRows) {
    if (!row.stationName || isHeaderLikeRow(row.stationName, row)) continue;
    const key = normalizeText(row.stationName);
    const existing = combined.get(key) || { stationName: row.stationName };
    combined.set(key, {
      ...existing,
      windSpeed: Number.isFinite(row.windSpeed) ? row.windSpeed : existing.windSpeed ?? null,
      windSpeedMax: Number.isFinite(row.windSpeedMax) ? row.windSpeedMax : existing.windSpeedMax ?? null,
      windDirection: Number.isFinite(row.windDirection) ? row.windDirection : existing.windDirection ?? null,
      lat: existing.lat ?? row.lat ?? null,
      lon: existing.lon ?? row.lon ?? null,
      countyName: existing.countyName ?? row.countyName ?? null
    });
  }

  for (const row of windMapRows) {
    if (!row.stationName || isHeaderLikeRow(row.stationName, row)) continue;
    const key = normalizeText(row.stationName);
    const existing = combined.get(key) || { stationName: row.stationName };
    combined.set(key, {
      ...existing,
      windSpeed: Number.isFinite(existing.windSpeed) ? existing.windSpeed : row.windSpeed ?? null,
      windSpeedMax: Number.isFinite(row.windSpeedMax) ? row.windSpeedMax : existing.windSpeedMax ?? null,
      windDirection: Number.isFinite(existing.windDirection) ? existing.windDirection : row.windDirection ?? null,
      lat: existing.lat ?? row.lat ?? null,
      lon: existing.lon ?? row.lon ?? null,
      countyName: existing.countyName ?? row.countyName ?? null
    });
  }

  return [...combined.values()].filter(row =>
    row.stationName &&
    (
      Number.isFinite(row.temperature) ||
      Number.isFinite(row.precipitation) ||
      Number.isFinite(row.windSpeed) ||
      Number.isFinite(row.windDirection) ||
      Number.isFinite(row.tempMin) ||
      Number.isFinite(row.tempMax)
    )
  );
}

async function loadDailyBundle(dateStr, hour = "12") {
  const cacheKey = `daybundle-${dateStr}-${hour}`;
  if (payloadCache.has(cacheKey)) return payloadCache.get(cacheKey);

  const [dailyRaw, windRaw, windMapRaw] = await Promise.all([
    fetchJsonWithTimeout(`${API_BASE}/v1/combinedWeatherData/observationDataDaily?date=${encodeURIComponent(dateStr)}&hour=${encodeURIComponent(hour)}`),
    fetchJsonWithTimeout(`${API_BASE}/v1/wind/observationWind?date=${encodeURIComponent(dateStr)}&hour=${encodeURIComponent(hour)}`),
    fetchJsonWithTimeout(`${API_BASE}/v1/wind/observationWindMap?date=${encodeURIComponent(dateStr)}&hour=${encodeURIComponent(hour)}`)
  ]);

  const dailyRows = extractEntries(dailyRaw).map(normalizeDailyObservation);
  const windRows = extractEntries(windRaw).map(normalizeWindObservation);
  const windMapRows = extractEntries(windMapRaw).map(normalizeWindMapObservation);

  const bundle = combineDailyAndWindRows(dailyRows, windRows, windMapRows);

  payloadCache.set(cacheKey, bundle);
  return bundle;
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) break;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
}

function enumerateDateKeys(startDate, endDate) {
  const dates = [];
  const d = new Date(startDate.getTime());

  while (d <= endDate) {
    dates.push(dateKeyTallinn(d));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

function startOfSeason(date = new Date()) {
  const info = getSeasonInfo(date);
  return info.start;
}

function endOfSeasonToToday(date = new Date()) {
  return date;
}

async function fetchWeatherXml() {
  const controller = new AbortController();
  const started = performance.now();
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
    setDebug(`XML HTTP ${response.status} — saadud (${Math.round(performance.now() - started)} ms)`);
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

async function loadRealtimePayload() {
  const xmlText = await fetchWeatherXml();
  const parsed = parseWeatherXml(xmlText);
  const records = parsed.observations.map(normalizeRealtimeObservation).filter(record => Number.isFinite(record.lat) && Number.isFinite(record.lon));
  const countyStats = aggregateRecordsToCountyStats(records);
  return countyStatsToPayload(
    countyStats,
    "Ilmateenistuse XML (reaalaeg)",
    parsed.snapshotTime || Date.now(),
    formatDateTime(parsed.snapshotTime || Date.now())
  );
}

async function loadDayPayload(date = new Date()) {
  const dateKey = dateKeyTallinn(date);
  const hour = hourTallinn(date);
  const cacheKey = `day-${dateKey}-${hour}`;
  if (payloadCache.has(cacheKey)) return payloadCache.get(cacheKey);

  const bundle = await loadDailyBundle(dateKey, hour);
  const countyStats = aggregateRecordsToCountyStats(bundle);

  const payload = countyStatsToPayload(
    countyStats,
    "Päevane API kokkuvõte",
    Date.now(),
    dateKey
  );

  payloadCache.set(cacheKey, payload);
  return payload;
}

async function loadMonthPayload(date = new Date()) {
  const key = `month-${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  if (payloadCache.has(key)) return payloadCache.get(key);

  const start = startOfMonthDate(date);
  const end = date;
  const dates = enumerateDateKeys(start, end);

  setDebug(`Laen kuu andmeid (${dates.length} päeva)...`);

  const bundles = await mapWithConcurrency(dates, 5, async (dateKey) => {
    try {
      return await loadDailyBundle(dateKey, "12");
    } catch (error) {
      console.warn("Day bundle failed for", dateKey, error);
      return [];
    }
  });

  const allRecords = bundles.flat();
  const countyStats = aggregateRecordsToCountyStats(allRecords);

  const payload = countyStatsToPayload(
    countyStats,
    "Kuu keskmine API põhjal",
    Date.now(),
    formatMonthLabel(date)
  );

  payloadCache.set(key, payload);
  return payload;
}

async function loadSeasonPayload(date = new Date()) {
  const season = getSeasonInfo(date);
  const key = `season-${season.key}`;
  if (payloadCache.has(key)) return payloadCache.get(key);

  const dates = enumerateDateKeys(season.start, date);
  setDebug(`Laen hooaja andmeid (${dates.length} päeva)...`);

  const bundles = await mapWithConcurrency(dates, 5, async (dateKey) => {
    try {
      return await loadDailyBundle(dateKey, "12");
    } catch (error) {
      console.warn("Season day bundle failed for", dateKey, error);
      return [];
    }
  });

  const allRecords = bundles.flat();
  const countyStats = aggregateRecordsToCountyStats(allRecords);

  const payload = countyStatsToPayload(
    countyStats,
    "Hooaja keskmine API põhjal",
    Date.now(),
    season.label
  );

  payloadCache.set(key, payload);
  return payload;
}

function ensureModePanel() {
  if (getModeSelect()) return;

  const sidebar = document.getElementById("sidebar");
  const sections = [...sidebar.querySelectorAll(".panel-section")];
  const anchor = sections.find(section => (section.querySelector("h2")?.textContent || "").includes("Aluskaart")) || sections[sections.length - 1];

  const panel = document.createElement("div");
  panel.className = "panel-section";
  panel.id = "weatherModePanel";
  panel.innerHTML = `
    <h2>Andmevaade</h2>
    <select id="weatherMode" style="width:100%;padding:8px;">
      <option value="realtime">Reaalajas</option>
      <option value="day">Päevane keskmine</option>
      <option value="month">Kuu keskmine</option>
      <option value="season">Hooaja keskmine</option>
    </select>
    <p class="weather-meta" id="modeInfo">${MODE_DESCRIPTIONS.realtime}</p>
  `;

  anchor.insertAdjacentElement("afterend", panel);
}

function scheduleNextRefresh() {
  if (weatherRefreshTimer) clearTimeout(weatherRefreshTimer);

  setNextRefresh(`Järgmine automaatne värskendus: ${formatDuration(WEATHER_REFRESH_MS)} pärast`);
  weatherRefreshTimer = setTimeout(() => {
    loadWeatherMode(currentMode, { reason: "automaatne värskendus", force: true });
  }, WEATHER_REFRESH_MS);
}

async function loadWeatherMode(mode = currentMode, { reason = "manual", force = false } = {}) {
  currentMode = mode;
  const cacheKey = getModeCacheKey(mode);
  const cached = payloadCache.get(cacheKey);

  const select = getModeSelect();
  if (select && select.value !== mode) select.value = mode;
  setModeInfo(MODE_DESCRIPTIONS[mode] || "");

  if (cached && !force) {
    setDebug(`Kuvan vahemälust: ${mode} (${reason})`);
    applyWeatherPayload(cached);
    scheduleNextRefresh();
    return;
  }

  const loadId = ++activeLoadId;
  const started = performance.now();

  if (mode === "realtime") {
    setDebug(`Alustan reaalaja laadimist (${reason})...`);
    setWeatherStatus("Laadin XML-i...");
  } else if (mode === "day") {
    setDebug(`Alustan päevase vaate laadimist (${reason})...`);
    setWeatherStatus("Laadin päevaseid andmeid...");
  } else if (mode === "month") {
    setDebug(`Alustan kuu vaate laadimist (${reason})...`);
    setWeatherStatus("Laadin kuu keskmist...");
  } else if (mode === "season") {
    setDebug(`Alustan hooaja vaate laadimist (${reason})...`);
    setWeatherStatus("Laadin hooaja keskmist...");
  }

  try {
    let payload;

    if (mode === "realtime") {
      payload = await loadRealtimePayload();
    } else if (mode === "day") {
      payload = await loadDayPayload(new Date());
    } else if (mode === "month") {
      payload = await loadMonthPayload(new Date());
    } else if (mode === "season") {
      payload = await loadSeasonPayload(new Date());
    } else {
      throw new Error(`Tundmatu režiim: ${mode}`);
    }

    if (loadId !== activeLoadId) return;

    payloadCache.set(cacheKey, payload);
    applyWeatherPayload(payload);

    const elapsed = Math.round(performance.now() - started);
    setDebug(`Valmis (${elapsed} ms) — ${mode}`);
  } catch (error) {
    const elapsed = Math.round(performance.now() - started);
    console.error("Ilmakihi laadimine ebaõnnestus:", error);
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
    toggleLayer(event.target.checked, weatherLayer);
    if (legendEl) legendEl.style.display = event.target.checked ? "block" : "none";

    if (event.target.checked) {
      if (lastWeatherPayload) {
        renderWeatherLayer(lastWeatherPayload);
      } else {
        loadWeatherMode(currentMode, { reason: "kiht aktiveeritud", force: true });
      }
    } else {
      clearWeatherLayer();
    }
  });

  const modeSelect = getModeSelect();
  modeSelect?.addEventListener("change", event => {
    const mode = event.target.value || "realtime";
    loadWeatherMode(mode, { reason: "režiimi vahetus", force: true });
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

  if (copyrightEl) {
    copyrightEl.textContent = "Aluskaart: prototüüp / demo. Ilmaandmed: Ilmateenistuse XML + publicapi.envir.ee";
  }
}

async function init() {
  ensureModePanel();
  wireUi();
  updateLegendVisibility();
  setNextRefresh("Järgmine automaatne värskendus: -");
  await loadStationLookup().catch(() => null);
  await loadWeatherMode(currentMode, { reason: "alglaadimine", force: true });
}

init();

// PWA / offline support
(function setupPwaSupport() {
  const mapWrap = document.getElementById("mapWrap");
  if (!mapWrap) return;

  let statusPill = document.getElementById("pwaStatus");
  if (!statusPill) {
    statusPill = document.createElement("div");
    statusPill.id = "pwaStatus";
    statusPill.style.position = "absolute";
    statusPill.style.left = "16px";
    statusPill.style.top = "68px";
    statusPill.style.zIndex = "950";
    statusPill.style.padding = "6px 10px";
    statusPill.style.borderRadius = "999px";
    statusPill.style.fontSize = "12px";
    statusPill.style.fontWeight = "700";
    statusPill.style.boxShadow = "0 1px 6px rgba(0,0,0,0.18)";
    statusPill.style.background = "#0f172a";
    statusPill.style.color = "#e2e8f0";
    statusPill.textContent = "PWA: laadib...";
    mapWrap.appendChild(statusPill);
  }

  const updateStatus = () => {
    const online = navigator.onLine;
    statusPill.textContent = online ? "PWA: online" : "PWA: offline";
    statusPill.style.background = online ? "#064e3b" : "#7f1d1d";
    statusPill.style.color = "#fff";
  };

  window.addEventListener("online", updateStatus);
  window.addEventListener("offline", updateStatus);
  updateStatus();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(error => {
        console.warn("Service worker register failed:", error);
      });
    });
  }

  let deferredInstallPrompt = null;

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredInstallPrompt = event;

    let installBtn = document.getElementById("installPwaBtn");
    if (!installBtn) {
      installBtn = document.createElement("button");
      installBtn.id = "installPwaBtn";
      installBtn.textContent = "Install";
      installBtn.style.position = "absolute";
      installBtn.style.right = "16px";
      installBtn.style.top = "68px";
      installBtn.style.zIndex = "950";
      installBtn.style.padding = "6px 10px";
      installBtn.style.border = "none";
      installBtn.style.borderRadius = "999px";
      installBtn.style.cursor = "pointer";
      installBtn.style.background = "#173b57";
      installBtn.style.color = "white";
      installBtn.style.boxShadow = "0 1px 6px rgba(0,0,0,0.18)";
      installBtn.addEventListener("click", async () => {
        if (!deferredInstallPrompt) return;
        deferredInstallPrompt.prompt();
        await deferredInstallPrompt.userChoice.catch(() => null);
        deferredInstallPrompt = null;
        installBtn.remove();
      });
      mapWrap.appendChild(installBtn);
    }
  });
})();
