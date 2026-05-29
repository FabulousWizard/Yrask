import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import { WHOLE_ESTONIA, type Area } from "@/lib/estonia";
import { ESTONIA_BORDER } from "@/lib/estonia-border";

export type WeatherStats = {
  countyName: string;
  shortName: string;
  lat: number;
  lon: number;
  stationCount: number;
  temperature: number | null;
  windSpeed: number | null;
  windDirection: number | null;
  precipitation: number | null;
  humidity: number | null;
};

export type SpreadAssessment = {
  degrees: number | null;
  name: string;
  riskLevel: "madal" | "keskmine" | "kõrge";
  score: number;
  targetCounty: string;
  explanation: string;
  factors: string[];
};

export type MapSelection = {
  lat: number;
  lng: number;
  inside: boolean;
  type: "damage";
  title?: string;
  cadastralIds?: string[];
  dangerZoneRadiusKm?: number;
  dangerZoneDownwindKm?: number;
  dangerZoneLateralKm?: number;
  dangerZoneUpwindKm?: number;
  countyName?: string;
  place?: string | null;
  weather?: WeatherStats | null;
  spread?: SpreadAssessment | null;
  properties?: Record<string, unknown>;
};

interface EstoniaMapProps {
  area: Area;
  showWeather: boolean;
  showDamage: boolean;
  showDangerZones: boolean;
  onMapClick: (info: MapSelection | null) => void;
  onWeatherSummary?: (summary: string) => void;
}

const COUNTY_CENTERS = [
  { name: "Harju maakond", shortName: "Harju", lat: 59.33, lon: 24.75 },
  { name: "Hiiu maakond", shortName: "Hiiu", lat: 58.92, lon: 22.6 },
  { name: "Ida-Viru maakond", shortName: "Ida-Viru", lat: 59.25, lon: 27.35 },
  { name: "Jõgeva maakond", shortName: "Jõgeva", lat: 58.75, lon: 26.4 },
  { name: "Järva maakond", shortName: "Järva", lat: 58.92, lon: 25.55 },
  { name: "Lääne maakond", shortName: "Lääne", lat: 58.9, lon: 23.75 },
  { name: "Lääne-Viru maakond", shortName: "Lääne-Viru", lat: 59.2, lon: 26.35 },
  { name: "Põlva maakond", shortName: "Põlva", lat: 58.05, lon: 27.1 },
  { name: "Pärnu maakond", shortName: "Pärnu", lat: 58.35, lon: 24.6 },
  { name: "Rapla maakond", shortName: "Rapla", lat: 58.92, lon: 24.8 },
  { name: "Saare maakond", shortName: "Saare", lat: 58.35, lon: 22.45 },
  { name: "Tartu maakond", shortName: "Tartu", lat: 58.38, lon: 26.75 },
  { name: "Valga maakond", shortName: "Valga", lat: 57.86, lon: 26.2 },
  { name: "Viljandi maakond", shortName: "Viljandi", lat: 58.35, lon: 25.55 },
  { name: "Võru maakond", shortName: "Võru", lat: 57.82, lon: 27.05 },
];

const STATION_COUNTY_OVERRIDES: Record<string, string> = {
  "tallinn-harku": "Harju maakond",
  tallinn: "Harju maakond",
  harku: "Harju maakond",
  pirita: "Harju maakond",
  paldiski: "Harju maakond",
  jõhvi: "Ida-Viru maakond",
  johvi: "Ida-Viru maakond",
  narva: "Ida-Viru maakond",
  vaindloo: "Lääne-Viru maakond",
  kunda: "Lääne-Viru maakond",
  jõgeva: "Jõgeva maakond",
  jogeva: "Jõgeva maakond",
  mustvee: "Jõgeva maakond",
  tooma: "Järva maakond",
  türi: "Järva maakond",
  tyri: "Järva maakond",
  haapsalu: "Lääne maakond",
  heltermaa: "Hiiu maakond",
  pärnu: "Pärnu maakond",
  parnu: "Pärnu maakond",
  kihnu: "Pärnu maakond",
  kuusiku: "Rapla maakond",
  roomassaare: "Saare maakond",
  sõrve: "Saare maakond",
  sorve: "Saare maakond",
  vilsandi: "Saare maakond",
  ruhnu: "Saare maakond",
  "tartu-tõravere": "Tartu maakond",
  "tartu-toravere": "Tartu maakond",
  tõravere: "Tartu maakond",
  toravere: "Tartu maakond",
  valga: "Valga maakond",
  viljandi: "Viljandi maakond",
  võru: "Võru maakond",
  voru: "Võru maakond",
};

function pointInRing(lat: number, lng: number, ring: number[][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function isInsideEstonia(lat: number, lng: number) {
  let inside = false;
  for (const ring of ESTONIA_BORDER) {
    if (pointInRing(lat, lng, ring)) inside = !inside;
  }
  return inside;
}

function normalizeText(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[()]/g, "")
    .replace(/\s+/g, "-");
}

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function firstDefined<T>(...values: T[]) {
  return values.find((value) => value !== undefined && value !== null && value !== "") ?? null;
}

function getCountyByName(value: unknown) {
  if (!value) return null;
  const normalized = normalizeText(value);
  return COUNTY_CENTERS.find((county) => normalizeText(county.name) === normalized || normalizeText(county.shortName) === normalized) ?? null;
}

function nearestCounty(lat: number, lon: number) {
  let best = COUNTY_CENTERS[0];
  let bestDistance = Infinity;
  for (const county of COUNTY_CENTERS) {
    const distance = (lat - county.lat) ** 2 + (lon - county.lon) ** 2;
    if (distance < bestDistance) {
      best = county;
      bestDistance = distance;
    }
  }
  return best;
}

function resolveCounty(obs: any) {
  const fromApi = getCountyByName(obs.county);
  if (fromApi) return fromApi;

  const stationName = normalizeText(obs.stationName);
  for (const [needle, countyName] of Object.entries(STATION_COUNTY_OVERRIDES)) {
    if (stationName.includes(needle)) return getCountyByName(countyName) || nearestCounty(obs.lat, obs.lon);
  }
  return nearestCounty(obs.lat, obs.lon);
}

function average(values: Array<number | null>) {
  const filtered = values.filter((value): value is number => Number.isFinite(value));
  if (!filtered.length) return null;
  return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

function averageWindDirection(rows: any[]) {
  const filtered = rows.filter((row) => Number.isFinite(row.windSpeed) && Number.isFinite(row.windDirection));
  if (!filtered.length) return null;

  let x = 0;
  let y = 0;
  for (const row of filtered) {
    const radians = (row.windDirection * Math.PI) / 180;
    x += row.windSpeed * Math.sin(radians);
    y += row.windSpeed * Math.cos(radians);
  }
  let degrees = (Math.atan2(x, y) * 180) / Math.PI;
  if (degrees < 0) degrees += 360;
  return degrees;
}

function parseTimestamp(value: unknown) {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (!str || str === "0") return null;
  if (/^\d+$/.test(str)) {
    const n = Number(str);
    return n < 1e12 ? n * 1000 : n;
  }
  const direct = Date.parse(str);
  return Number.isFinite(direct) ? direct : null;
}

function parseWeatherXml(xmlText: string) {
  const xml = new DOMParser().parseFromString(xmlText, "application/xml");
  if (xml.querySelector("parsererror")) throw new Error("XML parsimine ebaõnnestus");

  const root = xml.querySelector("observations") || xml.documentElement;
  const snapshotTime = parseTimestamp(
    firstDefined(root?.getAttribute?.("timestamp"), root?.getAttribute?.("time"), root?.querySelector?.("timestamp")?.textContent),
  );

  const stationNodes = [...xml.querySelectorAll("station"), ...xml.querySelectorAll("jaam")];
  const observations = stationNodes
    .map((station) => {
      const value = (selector: string) => station.querySelector(selector)?.textContent?.trim() || null;
      const stationName = firstDefined(value("name"), value("stationName"), value("jaam"), value("title"));
      return {
        stationName,
        lat: toNumber(firstDefined(value("latitude"), value("lat"), value("y"))),
        lon: toNumber(firstDefined(value("longitude"), value("lon"), value("lng"), value("x"))),
        county: firstDefined(value("county"), value("maakond"), value("countyName")),
        time: parseTimestamp(firstDefined(station.getAttribute?.("timestamp"), station.getAttribute?.("time"), value("timestamp"), value("time"))),
        temperature: toNumber(firstDefined(value("airtemperature"), value("airTemperature"), value("temperature"), value("value"))),
        windSpeed: toNumber(firstDefined(value("windspeed"), value("windSpeed"), value("wind_speed"), value("speed"))),
        windDirection: toNumber(firstDefined(value("winddirection"), value("windDirection"), value("wind_direction"), value("direction"), value("degree"), value("deg"))),
        precipitation: toNumber(firstDefined(value("precipitations"), value("precipitation"), value("rain"), value("rainfall"))),
        humidity: toNumber(firstDefined(value("relativehumidity"), value("relativeHumidity"), value("humidity"))),
      };
    })
    .filter((obs) => Number.isFinite(obs.lat) && Number.isFinite(obs.lon));

  const buckets = new Map<string, { county: (typeof COUNTY_CENTERS)[number]; rows: any[] }>();
  for (const obs of observations) {
    const county = resolveCounty(obs);
    if (!buckets.has(county.name)) buckets.set(county.name, { county, rows: [] });
    buckets.get(county.name)!.rows.push(obs);
  }

  const countyStats = [...buckets.values()].map(({ county, rows }) => ({
    countyName: county.name,
    shortName: county.shortName,
    lat: county.lat,
    lon: county.lon,
    stationCount: rows.length,
    temperature: average(rows.map((row) => row.temperature)),
    windSpeed: average(rows.map((row) => row.windSpeed)),
    windDirection: averageWindDirection(rows),
    precipitation: average(rows.map((row) => row.precipitation)),
    humidity: average(rows.map((row) => row.humidity)),
  }));

  return { snapshotTime, countyStats };
}

function windDirectionName(degrees: number | null) {
  if (!Number.isFinite(degrees)) return "-";
  const names = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return names[Math.round((degrees as number) / 45) % 8];
}

export function spreadDirection(degrees: number | null) {
  if (!Number.isFinite(degrees)) return null;
  // Kasutame tuulesuunda leviku suunana: kui tuul puhub põhja poole,
  // siis on üraski kandumise tõenäolisem suund samuti põhja poole.
  const toward = ((degrees as number) + 360) % 360;
  return { degrees: toward, name: windDirectionName(toward) };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function directionTargetCounty(lat: number, lng: number, degrees: number | null) {
  if (!Number.isFinite(degrees)) return nearestCounty(lat, lng).name;
  const distance = 0.65;
  const radians = ((degrees as number) * Math.PI) / 180;
  return nearestCounty(lat + Math.cos(radians) * distance, lng + Math.sin(radians) * distance).name;
}

function dangerZoneDimensions(weather: WeatherStats | null) {
  // Realistlikum lokaalne mudel: enamik üraske levib koldest lähialale.
  // Seetõttu on tuulesuunas ulatus umbes 1 km ja ainult väga soodsates tingimustes veidi üle selle.
  if (!weather) {
    return { downwindKm: 1.0, lateralKm: 0.35, upwindKm: 0.2, confidence: "madal" };
  }

  const t = weather.temperature;
  const w = weather.windSpeed;
  const p = weather.precipitation;

  const tempFactor = !Number.isFinite(t) ? 0.45 : (t as number) >= 20 ? 1 : (t as number) >= 18 ? 0.85 : (t as number) >= 16 ? 0.62 : (t as number) >= 12 ? 0.32 : 0.12;
  const windFactor = !Number.isFinite(w) ? 0.45 : (w as number) < 0.5 ? 0.18 : (w as number) < 2 ? 0.42 : (w as number) <= 8 ? 0.95 : 0.68;
  const rainFactor = !Number.isFinite(p) ? 0.7 : (p as number) <= 0.2 ? 1 : (p as number) <= 1 ? 0.7 : 0.35;

  const activity = clamp(tempFactor * 0.5 + windFactor * 0.32 + rainFactor * 0.18, 0.08, 1);

  return {
    downwindKm: Math.round((0.55 + 0.65 * activity) * 100) / 100,
    lateralKm: Math.round((0.18 + 0.32 * activity) * 100) / 100,
    upwindKm: Math.round((0.08 + 0.22 * activity) * 100) / 100,
    confidence: Number.isFinite(weather.temperature) && Number.isFinite(weather.windSpeed) && Number.isFinite(weather.windDirection) ? "keskmine" : "madal",
  };
}

function destinationPoint(lat: number, lng: number, bearingDegrees: number, distanceKm: number) {
  const earthRadiusKm = 6371;
  const angularDistance = distanceKm / earthRadiusKm;
  const bearing = (bearingDegrees * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lon1 = (lng * Math.PI) / 180;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2),
    );

  return [lat2 * (180 / Math.PI), lon2 * (180 / Math.PI)] as [number, number];
}

function makeDirectionalDangerZone(lat: number, lng: number, spreadDegrees: number | null, weather: WeatherStats | null) {
  const dimensions = dangerZoneDimensions(weather);
  const bearing = Number.isFinite(spreadDegrees) ? (spreadDegrees as number) : 0;
  const points: [number, number][] = [];

  // Asümmeetriline ellips: pikem osa jääb arvutatud levikusuunda,
  // külgedele jääb kitsam puhver ja vastutuulde jääb kõige väiksem puhver.
  for (let a = 0; a < 360; a += 8) {
    const theta = (a * Math.PI) / 180;
    const forward = Math.cos(theta);
    const side = Math.sin(theta);
    const reachKm = forward >= 0 ? dimensions.downwindKm : dimensions.upwindKm;
    const xKm = forward * reachKm;
    const yKm = side * dimensions.lateralKm * (forward >= 0 ? 1 : 0.75);
    const distanceKm = Math.sqrt(xKm * xKm + yKm * yKm);
    const offsetBearing = bearing + (Math.atan2(yKm, xKm) * 180) / Math.PI;
    points.push(destinationPoint(lat, lng, offsetBearing, distanceKm));
  }

  return { points, ...dimensions };
}


type DangerPolygon = [number, number][];

function polygonBounds(poly: DangerPolygon) {
  const lats = poly.map((p) => p[0]);
  const lngs = poly.map((p) => p[1]);
  return {
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
    minLng: Math.min(...lngs),
    maxLng: Math.max(...lngs),
  };
}

function boundsOverlap(a: ReturnType<typeof polygonBounds>, b: ReturnType<typeof polygonBounds>, tolerance = 0.00001) {
  return !(
    a.maxLat + tolerance < b.minLat ||
    b.maxLat + tolerance < a.minLat ||
    a.maxLng + tolerance < b.minLng ||
    b.maxLng + tolerance < a.minLng
  );
}

function pointInPolygon(point: [number, number], polygon: DangerPolygon) {
  return pointInRing(point[0], point[1], polygon);
}

function orientation(a: [number, number], b: [number, number], c: [number, number]) {
  // Kasutame tasapinnalist kontrolli väikeste (~1 km) levikualade jaoks.
  // x = lng, y = lat.
  const value = (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1]);
  if (Math.abs(value) < 1e-10) return 0;
  return value > 0 ? 1 : 2;
}

function onSegment(a: [number, number], b: [number, number], c: [number, number]) {
  return (
    b[0] <= Math.max(a[0], c[0]) + 1e-10 &&
    b[0] + 1e-10 >= Math.min(a[0], c[0]) &&
    b[1] <= Math.max(a[1], c[1]) + 1e-10 &&
    b[1] + 1e-10 >= Math.min(a[1], c[1])
  );
}

function segmentsIntersect(p1: [number, number], q1: [number, number], p2: [number, number], q2: [number, number]) {
  const o1 = orientation(p1, q1, p2);
  const o2 = orientation(p1, q1, q2);
  const o3 = orientation(p2, q2, p1);
  const o4 = orientation(p2, q2, q1);

  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(p1, p2, q1)) return true;
  if (o2 === 0 && onSegment(p1, q2, q1)) return true;
  if (o3 === 0 && onSegment(p2, p1, q2)) return true;
  if (o4 === 0 && onSegment(p2, q1, q2)) return true;
  return false;
}

function polygonsTouchOrOverlap(a: DangerPolygon, b: DangerPolygon) {
  if (!boundsOverlap(polygonBounds(a), polygonBounds(b))) return false;

  // Ühendame ainult siis, kui levikualad päriselt kattuvad või nende piirid puudutavad.
  // Ainult bounding-box'i kattumine ei ole piisav, sest see liitis varem lahus olevad alad ekslikult kokku.
  if (a.some((point) => pointInPolygon(point, b))) return true;
  if (b.some((point) => pointInPolygon(point, a))) return true;

  for (let i = 0; i < a.length; i++) {
    const a1 = a[i];
    const a2 = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j++) {
      const b1 = b[j];
      const b2 = b[(j + 1) % b.length];
      if (segmentsIntersect(a1, a2, b1, b2)) return true;
    }
  }

  return false;
}

function convexHull(points: DangerPolygon): DangerPolygon {
  const unique = [...new Map(points.map(([lat, lng]) => [`${lng.toFixed(7)},${lat.toFixed(7)}`, [lng, lat] as [number, number]])).values()]
    .sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]));

  if (unique.length <= 2) return unique.map(([lng, lat]) => [lat, lng]);

  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  const lower: [number, number][] = [];
  for (const p of unique) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }

  const upper: [number, number][] = [];
  for (let i = unique.length - 1; i >= 0; i--) {
    const p = unique[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }

  const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
  return hull.map(([lng, lat]) => [lat, lng]);
}

function mergedOuterContours(polygons: DangerPolygon[]) {
  const bounds = polygons.map(polygonBounds);
  const parent = polygons.map((_, i) => i);

  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };

  const unite = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  for (let i = 0; i < polygons.length; i++) {
    for (let j = i + 1; j < polygons.length; j++) {
      if (polygonsTouchOrOverlap(polygons[i], polygons[j])) unite(i, j);
    }
  }

  const groups = new Map<number, DangerPolygon[]>();
  polygons.forEach((poly, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(poly);
  });

  return [...groups.values()].map((group) => convexHull(group.flat()));
}

function createUnionDangerZoneLayer(L: any, _map: any, polygons: DangerPolygon[]) {
  // Täide ja kontuur on eraldi kihid. Täitel pole stroke'i, seega kattuvate alade
  // vahele ei teki sisemisi eraldusjooni. Kontuur joonistatakse ainult
  // iga tegelikult kattuva/kokku puutuva levikualade grupi välispiiri ümber.
  // Lahus olevad levikualad jäävad eraldi kontuuridega.
  const group = L.featureGroup([], { interactive: false });

  L.polygon(polygons, {
    pane: "overlayPane",
    interactive: false,
    bubblingMouseEvents: false,
    stroke: false,
    fill: true,
    fillColor: "#fed7aa",
    fillOpacity: 0.42,
    fillRule: "nonzero",
  }).addTo(group);

  const contours = mergedOuterContours(polygons);
  if (contours.length) {
    L.polyline(contours.map((ring) => [...ring, ring[0]]), {
      pane: "overlayPane",
      interactive: false,
      bubblingMouseEvents: false,
      color: "#ea580c",
      weight: 2.5,
      opacity: 0.95,
      lineJoin: "round",
      lineCap: "round",
    }).addTo(group);
  }

  return group;
}

export function assessBarkBeetleSpread(lat: number, lng: number, weather: WeatherStats | null): SpreadAssessment | null {
  if (!weather) return null;

  const direction = spreadDirection(weather.windDirection);
  const temperature = weather.temperature;
  const windSpeed = weather.windSpeed;
  const precipitation = weather.precipitation;

  let score = 0;
  const factors: string[] = [];

  if (Number.isFinite(temperature)) {
    if ((temperature as number) >= 20) {
      score += 45;
      factors.push("temperatuur on üraski aktiivseks lendluseks väga soodne");
    } else if ((temperature as number) >= 16) {
      score += 32;
      factors.push("temperatuur võimaldab üraski aktiivsust");
    } else if ((temperature as number) >= 12) {
      score += 14;
      factors.push("temperatuur on piiripealne ja levik on aeglasem");
    } else {
      factors.push("temperatuur on lendlemiseks pigem liiga madal");
    }
  } else {
    factors.push("temperatuuriandmed puuduvad");
  }

  if (Number.isFinite(windSpeed)) {
    if ((windSpeed as number) >= 2 && (windSpeed as number) <= 8) {
      score += 35;
      factors.push("tuul on piisav, et soodustada kandumist naaberaladele");
    } else if ((windSpeed as number) > 8) {
      score += 20;
      factors.push("tuul on tugev; kandumise suund on olemas, kuid lend võib olla häiritud");
    } else if ((windSpeed as number) > 0.5) {
      score += 15;
      factors.push("tuul on nõrk, mistõttu kandumine on pigem lokaalne");
    } else {
      factors.push("tuul on väga nõrk ja selget levikusuunda ei saa hinnata");
    }
  } else {
    factors.push("tuule kiiruse andmed puuduvad");
  }

  if (Number.isFinite(precipitation)) {
    if ((precipitation as number) <= 0.2) {
      score += 20;
      factors.push("sademeid peaaegu ei ole, mis toetab lendlemist");
    } else if ((precipitation as number) <= 1) {
      score += 8;
      factors.push("sademed on väikesed ja mõju on mõõdukas");
    } else {
      score -= 15;
      factors.push("sademed vähendavad üraski lendlemise tõenäosust");
    }
  } else {
    factors.push("sademete andmed puuduvad");
  }

  score = clamp(score, 0, 100);
  const riskLevel = score >= 65 ? "kõrge" : score >= 35 ? "keskmine" : "madal";
  const targetCounty = directionTargetCounty(lat, lng, direction?.degrees ?? null);
  const directionText = direction ? `${direction.degrees.toFixed(0)}° ${direction.name}` : "suund teadmata";

  return {
    degrees: direction?.degrees ?? null,
    name: direction?.name ?? "-",
    riskLevel,
    score,
    targetCounty,
    explanation: `Haigest metsaalast hinnatakse levikusuunaks ${directionText}. Tõenäoline järgmine piirkond on ${targetCounty}. Riskitase: ${riskLevel} (${score}/100).`,
    factors,
  };
}

function weatherSummary(stats: WeatherStats[]) {
  const valid = stats.filter((s) => Number.isFinite(s.temperature) || Number.isFinite(s.windSpeed));
  if (!valid.length) return "Ilmaandmeid ei õnnestunud kuvada.";
  const warm = [...valid].sort((a, b) => (b.temperature ?? -999) - (a.temperature ?? -999))[0];
  const windy = [...valid].sort((a, b) => (b.windSpeed ?? -999) - (a.windSpeed ?? -999))[0];
  return `Ilmaandmed on laaditud. Soojem piirkond: ${warm.shortName} (${warm.temperature?.toFixed(1) ?? "-"} °C). Tugevam tuul: ${windy.shortName} (${windy.windSpeed?.toFixed(1) ?? "-"} m/s). Levikuarvutus käivitub ainult punase RMK kahjustusala klõpsamisel.`;
}

function findWeatherForCounty(stats: WeatherStats[], countyName: string) {
  const normalized = normalizeText(countyName);
  return stats.find((row) => normalizeText(row.countyName) === normalized || normalizeText(row.shortName) === normalized) ?? null;
}

function weatherForLocation(lat: number, lng: number, weatherStats: WeatherStats[]) {
  const county = nearestCounty(lat, lng);
  return { county, weather: findWeatherForCounty(weatherStats, county.name) };
}

function cleanProperties(properties: Record<string, unknown> = {}) {
  return Object.fromEntries(
    Object.entries(properties).filter(([, value]) => value !== null && value !== undefined && value !== ""),
  );
}

const CADASTRAL_KEYS = [
  "katastri_nr",
  "katastritunnus",
  "katastri_tunnus",
  "katastriüksus",
  "katastriyksus",
  "kataster",
  "cadastre",
  "cadastral_no",
  "cadastralNumber",
];

function getCadastralIds(properties: Record<string, unknown> = {}) {
  const values: string[] = [];
  for (const key of CADASTRAL_KEYS) {
    const raw = properties[key];
    if (raw === null || raw === undefined || raw === "") continue;
    const parts = String(raw)
      .split(/[;,]/)
      .map((part) => part.trim())
      .filter(Boolean);
    values.push(...parts);
  }
  return [...new Set(values)];
}

export function EstoniaMap({ area, showWeather, showDamage, showDangerZones, onMapClick, onWeatherSummary }: EstoniaMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const layersRef = useRef<{ weather?: any; damage?: any; dangerZones?: any }>({});
  const clickHandlerRef = useRef(onMapClick);
  const weatherStatsRef = useRef<WeatherStats[]>([]);
  clickHandlerRef.current = onMapClick;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;

      const estoniaBounds = L.latLngBounds([57.5, 21.5], [59.8, 28.3]);
      const map = L.map(containerRef.current, {
        center: WHOLE_ESTONIA.center,
        zoom: WHOLE_ESTONIA.zoom,
        minZoom: WHOLE_ESTONIA.zoom,
        maxZoom: 19,
        maxBounds: estoniaBounds,
        maxBoundsViscosity: 1,
        zoomControl: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap contributors",
      }).addTo(map);

      map.on("click", () => {
        // Infotabelit täidetakse ainult RMK punase kahjustusala klõpsamisel.
        clickHandlerRef.current(null);
      });

      layersRef.current.weather = L.layerGroup();
      layersRef.current.damage = L.layerGroup();
      layersRef.current.dangerZones = L.layerGroup();

      // Lisa algselt aktiivsed kihid kohe kaardile.
      if (showWeather) layersRef.current.weather.addTo(map);
      if (showDamage) layersRef.current.damage.addTo(map);
      if (showDangerZones) layersRef.current.dangerZones.addTo(map);

      mapRef.current = map;

      const [weatherText, rmk, rmkMerged] = await Promise.all([
        fetch("/data/weather.xml", { cache: "no-store" }).then((r) => r.text()),
        fetch("/data/rmk_wgs84.geojson").then((r) => r.json()),
        fetch("/data/rmk_damage_merged_wgs84.geojson").then((r) => r.json()),
      ]);
      if (cancelled) return;

      const parsedWeather = parseWeatherXml(weatherText);
      weatherStatsRef.current = parsedWeather.countyStats;
      onWeatherSummary?.(weatherSummary(parsedWeather.countyStats));

      // Ilmaandmed hoitakse mälus arvutuse jaoks. Neid ei joonistata kaardile ja tavaline kaardiklõps infotabelit ei täida.

      const dangerPolygons: Array<[number, number][]> = [];

      // Nähtav koldekiht on täpse geomeetrilise ühendamise tulemus.
      // Ühendatakse ainult päriselt kattuvad või kokku puutuvad RMK kahjustusalad;
      // lahus olevad kolded jäävad eraldi kontuuriga.
      L.geoJSON(rmkMerged, {
        style: {
          color: "#7f1d1d",
          weight: 1.8,
          opacity: 0.98,
          fillColor: "#ef4444",
          fillOpacity: 0.42,
          lineJoin: "round",
        },
        interactive: false,
      }).addTo(layersRef.current.damage);

      // Algne RMK kiht jääb nähtamatuks klikikihiks, et iga haige metsaala infotabeli arvutus töötaks edasi.
      L.geoJSON(rmk, {
        style: { stroke: false, fill: true, fillColor: "#ef4444", fillOpacity: 0.01 },
        onEachFeature: (feature: any, layer: any) => {
          const p = cleanProperties(feature.properties || {});

          const initialCenter = layer.getBounds ? layer.getBounds().getCenter() : null;
          if (initialCenter) {
            const { weather } = weatherForLocation(initialCenter.lat, initialCenter.lng, weatherStatsRef.current);
            const spread = assessBarkBeetleSpread(initialCenter.lat, initialCenter.lng, weather);
            const zone = makeDirectionalDangerZone(initialCenter.lat, initialCenter.lng, spread?.degrees ?? null, weather);

            dangerPolygons.push(zone.points);
          }

          layer.on("click", (event: any) => {
            L.DomEvent.stopPropagation(event);
            const center = layer.getBounds ? layer.getBounds().getCenter() : event.latlng;
            const { county, weather } = weatherForLocation(center.lat, center.lng, weatherStatsRef.current);
            const spread = assessBarkBeetleSpread(center.lat, center.lng, weather);
            const zone = makeDirectionalDangerZone(center.lat, center.lng, spread?.degrees ?? null, weather);
            clickHandlerRef.current({
              lat: center.lat,
              lng: center.lng,
              inside: true,
              type: "damage",
              title: "RMK kahjustusala",
              countyName: county.name,
              weather,
              spread,
              cadastralIds: getCadastralIds(p),
              dangerZoneRadiusKm: undefined,
              dangerZoneDownwindKm: zone.downwindKm,
              dangerZoneLateralKm: zone.lateralKm,
              dangerZoneUpwindKm: zone.upwindKm,
              properties: p,
            });
          });
        },
      }).addTo(layersRef.current.damage);

      if (dangerPolygons.length) {
        layersRef.current.dangerZones.addLayer(createUnionDangerZoneLayer(L, map, dangerPolygons));
      }
    })().catch((error) => {
      console.error(error);
      onWeatherSummary?.(`Andmete laadimine ebaõnnestus: ${error instanceof Error ? error.message : String(error)}`);
    });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [onWeatherSummary]);

  useEffect(() => {
    if (mapRef.current) mapRef.current.flyTo(area.center, area.zoom, { duration: 0.8 });
  }, [area]);

  useEffect(() => {
    const map = mapRef.current;
    const layers = layersRef.current;
    if (!map || !layers.weather) return;
    if (showWeather) {
      layers.weather.addTo(map);
    } else {
      map.removeLayer(layers.weather);
    }
  }, [showWeather]);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layersRef.current.damage;
    if (!map || !layer) return;
    showDamage ? layer.addTo(map) : map.removeLayer(layer);
  }, [showDamage]);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layersRef.current.dangerZones;
    if (!map || !layer) return;
    showDangerZones ? layer.addTo(map) : map.removeLayer(layer);
  }, [showDangerZones]);

  return <div ref={containerRef} className="h-full w-full" />;
}
