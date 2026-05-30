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

export type InfectedSpruceForest = {
  id?: number | string | null;
  katastri_nr?: string | null;
  kvartali_nr?: number | string | null;
  eraldise_nr?: number | string | null;
  pindala?: number | string | null;
  kasvukoht_kood?: string | null;
  peapuuliik_kood?: string | null;
  keskm_vanus?: number | string | null;
  arengukl_kood?: string | null;
  ndvi?: number | null;
  center?: [number, number];
  risk_score?: number | null;
  risk_level?: "madal" | "keskmine" | "kõrge" | null;
  risk_factors?: string[];
  distance_m?: number | null;
};

export type InfectedSpruceSummary = {
  damage_id: string;
  forest_count: number;
  avg_age: number | null;
  avg_ndvi: number | null;
  avg_risk?: number | null;
  high_risk_count?: number;
  medium_risk_count?: number;
  low_risk_count?: number;
  forests: InfectedSpruceForest[];
  truncated?: boolean;
};

export type MapSelection = {
  lat: number;
  lng: number;
  inside: boolean;
  type: "damage" | "spruce";
  forestAge?: number | string | null;
  forestRiskScore?: number | null;
  forestRiskLevel?: "madal" | "keskmine" | "kõrge" | null;
  forestRiskFactors?: string[];
  forestDistanceToDamageM?: number | null;
  forestNdvi?: number | null;
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
  infectedSpruce?: InfectedSpruceSummary | null;
  properties?: Record<string, unknown>;
};

interface EstoniaMapProps {
  area: Area;
  showWeather: boolean;
  showDamage: boolean;
  showDangerZones: boolean;
  showSpruceForests: boolean;
  colorBlindMode: boolean;
  onMapClick: (info: MapSelection | null) => void;
  onWeatherSummary?: (summary: string) => void;
}

const BASE_URL = import.meta.env.BASE_URL;
const dataUrl = (path: string) => `${BASE_URL}data/${path}`;

type OfflineMarkerRecord = {
  id: string;
  lat: number;
  lng: number;
  createdAt: string;
  clientId: string;
  synced: boolean;
  syncedAt?: string | null;
};

type OfflineRegionRecord = {
  center: [number, number];
  radiusKm: number;
  updatedAt: string;
};

const OFFLINE_MARKERS_KEY = "yrask.offline.markers.v1";
const OFFLINE_REGION_KEY = "yrask.offline.region.v1";
const OFFLINE_CLIENT_ID_KEY = "yrask.offline.client-id.v1";
const OFFLINE_TILE_ZOOMS = [12, 13, 14, 15];
const OFFLINE_MAX_TILES = 260;
let COLOR_BLIND_MODE = false;

function readJsonStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJsonStorage(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota / private mode errors.
  }
}

function createClientId() {
  return `client-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

function getOrCreateClientId() {
  const stored = typeof window === "undefined" ? null : window.localStorage.getItem(OFFLINE_CLIENT_ID_KEY);
  if (stored) return stored;
  const id = createClientId();
  writeJsonStorage(OFFLINE_CLIENT_ID_KEY, id);
  return id;
}

function metersToLatDelta(meters: number) {
  return meters / 111_320;
}

function metersToLngDelta(meters: number, lat: number) {
  const safeLat = Math.max(Math.min(lat, 89.9), -89.9);
  return meters / (111_320 * Math.cos((safeLat * Math.PI) / 180));
}

function squareBoundsAround(lat: number, lng: number, halfSizeKm = 5) {
  const halfSizeMeters = halfSizeKm * 1000;
  return {
    south: lat - metersToLatDelta(halfSizeMeters),
    north: lat + metersToLatDelta(halfSizeMeters),
    west: lng - metersToLngDelta(halfSizeMeters, lat),
    east: lng + metersToLngDelta(halfSizeMeters, lat),
  };
}

function latLngToTile(lat: number, lng: number, zoom: number) {
  const latRad = (lat * Math.PI) / 180;
  const scale = 2 ** zoom;
  return {
    x: Math.floor(((lng + 180) / 360) * scale),
    y: Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * scale),
  };
}

function tileUrl(z: number, x: number, y: number) {
  return `https://{s}.tile.openstreetmap.org/${z}/${x}/${y}.png`;
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
  // Kõik sisemised geomeetriad on kujul [lat, lng].
  // Ray-casting algoritmis peab x olema pikkuskraad (lng) ja y laiuskraad (lat).
  // Varasem versioon kasutas ekslikult x=lat ja y=lng, mistõttu osa leviala
  // kontuuri sees olevaid metsi jäi valesti roheliseks.
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i][0]; // lat
    const xi = ring[i][1]; // lng
    const yj = ring[j][0]; // lat
    const xj = ring[j][1]; // lng

    const intersectsLatitude = yi > lat !== yj > lat;
    if (!intersectsLatitude) continue;

    const lngOnSegment = ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (lng < lngOnSegment) inside = !inside;
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
  // Kasutaja maatriksi järgi on igal koldel 1 km default levikuala.
  // Tuul pikendab ala tuulesuunas: kaugus + windSpeed * 0.1 km,
  // kuid maksimaalne ulatus on 2 km.
  if (!weather || !Number.isFinite(weather.windSpeed)) {
    return { downwindKm: 1.0, lateralKm: 1.0, upwindKm: 1.0, confidence: "madal" };
  }

  const windSpeed = Math.max(0, weather.windSpeed as number);
  const downwindKm = clamp(1 + windSpeed * 0.1, 1, 2);

  return {
    downwindKm: Math.round(downwindKm * 100) / 100,
    lateralKm: 1.0,
    upwindKm: 1.0,
    confidence: Number.isFinite(weather.temperature) && Number.isFinite(weather.windDirection) ? "keskmine" : "madal",
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

type SpruceFeatureCollection = {
  type: "FeatureCollection";
  features: any[];
  properties?: { truncated?: boolean; source?: string };
};

type SpruceChunkIndex = {
  totalFeatures: number;
  tileSizeDegrees?: number;
  chunks: Array<{ id: string; file: string; bbox: [number, number, number, number]; count: number; size?: number }>;
};

type NdviLookup = Record<string, number>;
type InfectedSpruceLookup = Record<string, InfectedSpruceSummary>;

const SPRUCE_MIN_ZOOM = 12;
const SPRUCE_MAX_ACTIVE_CHUNKS = 55;
const SPRUCE_FETCH_BATCH_SIZE = 6;

function bboxesIntersect(a: [number, number, number, number], b: [number, number, number, number]) {
  return !(a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1]);
}

function leafletBoundsToArray(bounds: any): [number, number, number, number] {
  return [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
}

function featureKey(feature: any) {
  const p = feature?.properties ?? {};
  return String(p.id ?? `${p.katastri_nr ?? ""}:${p.kvartali_nr ?? ""}:${p.eraldise_nr ?? ""}:${JSON.stringify(feature.geometry?.coordinates?.[0]?.[0] ?? "")}`);
}


function geoJsonRings(geometry: any): DangerPolygon[] {
  if (!geometry) return [];
  const rings: DangerPolygon[] = [];
  if (geometry.type === "Polygon") {
    for (const ring of geometry.coordinates ?? []) rings.push(ring.map(([lng, lat]: number[]) => [lat, lng]));
  }
  if (geometry.type === "MultiPolygon") {
    for (const polygon of geometry.coordinates ?? []) {
      for (const ring of polygon ?? []) rings.push(ring.map(([lng, lat]: number[]) => [lat, lng]));
    }
  }
  return rings;
}

function geoJsonCollectionRings(data: any): DangerPolygon[] {
  if (!data) return [];
  if (data.type === "FeatureCollection") {
    return (data.features ?? []).flatMap((feature: any) => geoJsonRings(feature?.geometry));
  }
  if (data.type === "Feature") return geoJsonRings(data.geometry);
  return geoJsonRings(data);
}

function ringBounds(ring: DangerPolygon) {
  return polygonBounds(ring);
}

function featureIntersectsDanger(feature: any, dangerPolygons: DangerPolygon[]) {
  if (!dangerPolygons.length) return false;
  const forestRings = geoJsonRings(feature.geometry);
  if (!forestRings.length) return false;

  for (const forestRing of forestRings) {
    const forestBounds = ringBounds(forestRing);
    for (const danger of dangerPolygons) {
      if (!boundsOverlap(forestBounds, polygonBounds(danger))) continue;
      if (forestRing.some((point) => pointInPolygon(point, danger))) return true;
      if (danger.some((point) => pointInPolygon(point, forestRing))) return true;
      for (let i = 0; i < forestRing.length; i++) {
        const f1 = forestRing[i];
        const f2 = forestRing[(i + 1) % forestRing.length];
        for (let j = 0; j < danger.length; j++) {
          const d1 = danger[j];
          const d2 = danger[(j + 1) % danger.length];
          if (segmentsIntersect(f1, f2, d1, d2)) return true;
        }
      }
    }
  }
  return false;
}

function featureCenterInsideDanger(feature: any, dangerPolygons: DangerPolygon[]) {
  const center = featureCenter(feature);
  if (!center || !dangerPolygons.length) return false;
  return dangerPolygons.some((danger) => pointInPolygon([center.lat, center.lng], danger));
}

function pointInsideAnyDanger(point: [number, number], dangerPolygons: DangerPolygon[]) {
  return dangerPolygons.some((danger) => pointInPolygon(point, danger));
}

function samplePointsForRing(bounds: ReturnType<typeof polygonBounds>, steps = 6): [number, number][] {
  const points: [number, number][] = [];
  for (let y = 0; y <= steps; y++) {
    const lat = bounds.minLat + ((bounds.maxLat - bounds.minLat) * y) / steps;
    for (let x = 0; x <= steps; x++) {
      const lng = bounds.minLng + ((bounds.maxLng - bounds.minLng) * x) / steps;
      points.push([lat, lng]);
    }
  }
  return points;
}

function featureTouchesOrIsInsideDanger(feature: any, dangerPolygons: DangerPolygon[]) {
  if (!dangerPolygons.length) return false;
  const forestRings = geoJsonRings(feature.geometry);
  if (!forestRings.length) return false;

  const center = featureCenter(feature);
  if (center && pointInsideAnyDanger([center.lat, center.lng], dangerPolygons)) return true;

  for (const forestRing of forestRings) {
    const forestBounds = ringBounds(forestRing);
    const possiblyRelevantDanger = dangerPolygons.filter((danger) => boundsOverlap(forestBounds, polygonBounds(danger), 0.0002));
    if (!possiblyRelevantDanger.length) continue;

    // 1) Kui mõni metsa piiripunkt on levialas, on mets riskialas.
    if (forestRing.some((point) => pointInsideAnyDanger(point, possiblyRelevantDanger))) return true;

    // 2) Kui mõni leviala punkt on metsapolügonis, lõikub mets levialaga.
    for (const danger of possiblyRelevantDanger) {
      if (danger.some((point) => pointInPolygon(point, forestRing))) return true;
    }

    // 3) Kui piirid ristuvad või puutuvad, peab mets olema riskialas.
    for (let i = 0; i < forestRing.length; i++) {
      const f1 = forestRing[i];
      const f2 = forestRing[(i + 1) % forestRing.length];
      for (const danger of possiblyRelevantDanger) {
        for (let j = 0; j < danger.length; j++) {
          const d1 = danger[j];
          const d2 = danger[(j + 1) % danger.length];
          if (segmentsIntersect(f1, f2, d1, d2)) return true;
        }
      }
    }

    // 4) Raster-sampling fallback: Leafleti canvasel võib osa väikeseid/multi-polügone
    // jääda ilma ühisest tipupunktist. Kui metsa sees olev proovipunkt on leviala sees,
    // värvime selle riskimetsaks. See parandab olukorra, kus kontuuri sees olevad
    // metsad jäid ekslikult roheliseks.
    for (const sample of samplePointsForRing(forestBounds, 6)) {
      if (!pointInPolygon(sample, forestRing)) continue;
      if (pointInsideAnyDanger(sample, possiblyRelevantDanger)) return true;
    }
  }

  return false;
}

function spruceStyle(
  feature: any,
  dangerPolygons: DangerPolygon[],
  weatherStats: WeatherStats[],
  damageCenters: Array<[number, number]>,
  ndviLookup: NdviLookup,
) {
  const center = featureCenter(feature);
  const p = cleanProperties(feature.properties || {});
  const insideDangerZone = featureTouchesOrIsInsideDanger(feature, dangerPolygons);

  if (!center) {
    return forestSafeZoneColor(null, COLOR_BLIND_MODE);
  }

  const { weather } = weatherForLocation(center.lat, center.lng, weatherStats);
  const risk = assessForestInfectionRisk({ properties: p, lat: center.lat, lng: center.lng, weather, damageCenters, ndviLookup, insideDangerZone });

  return {
    pane: "sprucePane",
    ...(insideDangerZone ? forestSpreadRiskColor(risk.score, COLOR_BLIND_MODE) : forestSafeZoneColor(risk.score, COLOR_BLIND_MODE)),
  };
}

function featureCenter(feature: any) {
  const rings = geoJsonRings(feature.geometry);
  const points = rings.flat();
  if (!points.length) return null;
  const lat = points.reduce((sum, point) => sum + point[0], 0) / points.length;
  const lng = points.reduce((sum, point) => sum + point[1], 0) / points.length;
  return { lat, lng };
}

function boundsToBbox(bounds: any) {
  const west = bounds.getWest().toFixed(6);
  const south = bounds.getSouth().toFixed(6);
  const east = bounds.getEast().toFixed(6);
  const north = bounds.getNorth().toFixed(6);
  return `${west},${south},${east},${north}`;
}

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


function createExactUnionDangerZoneLayer(L: any, spreadUnionGeoJson: any, colorBlindMode = false) {
  // Kasutame eelnevalt täpselt ühendatud GeoJSON-i. Nii ei teki iga üksiku
  // leviala ümber oma kontuuri ning kattuvate alade sisepiirid ei jää näha.
  // Kontuur jookseb ainult ühendatud leviala välispiiri mööda; lahus olevad
  // levialad jäävad eraldi MultiPolygon osadeks ja saavad eraldi väliskontuuri.
  return L.geoJSON(spreadUnionGeoJson, {
    pane: "dangerPane",
    interactive: false,
    bubblingMouseEvents: false,
    style: spreadZoneStyle(colorBlindMode),
  });
}
function createUnionDangerZoneLayer(L: any, _map: any, polygons: DangerPolygon[]) {
  // Täide ja kontuur on eraldi kihid. Täitel pole stroke'i, seega kattuvate alade
  // vahele ei teki sisemisi eraldusjooni. Kontuur joonistatakse ainult
  // iga tegelikult kattuva/kokku puutuva levikualade grupi välispiiri ümber.
  // Lahus olevad levikualad jäävad eraldi kontuuridega.
  const group = L.featureGroup([], { interactive: false });

  L.polygon(polygons, {
    pane: "dangerPane",
    interactive: false,
    bubblingMouseEvents: false,
    stroke: false,
    fill: true,
    fillColor: COLOR_BLIND_MODE ? "#ddd6fe" : "#fed7aa",
    fillOpacity: COLOR_BLIND_MODE ? 0.34 : 0.42,
    fillRule: "nonzero",
  }).addTo(group);

  const contours = mergedOuterContours(polygons);
  if (contours.length) {
    L.polyline(contours.map((ring) => [...ring, ring[0]]), {
      pane: "dangerPane",
      interactive: false,
      bubblingMouseEvents: false,
      color: COLOR_BLIND_MODE ? "#6d28d9" : "#ea580c",
      weight: COLOR_BLIND_MODE ? 2.8 : 2.5,
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

function getForestAge(properties: Record<string, unknown> = {}) {
  const raw = properties.keskm_vanus ?? properties.vanus ?? properties.metsa_vanus ?? properties.average_age;
  if (raw === null || raw === undefined || raw === "") return null;
  const numeric = Number(String(raw).replace(",", "."));
  return Number.isFinite(numeric) ? numeric : String(raw);
}

const NDVI_KEYS = ["ndvi", "NDVI", "keskm_ndvi", "mean_ndvi", "forest_ndvi", "tervis", "health_index"];

function normalizeNdviValue(value: number) {
  if (!Number.isFinite(value)) return null;
  // plot_medians.json stores NDVI medians as scaled values, usually 0–1000.
  // Convert them back to the matrix range 0–1.
  if (value > 1) return value / 1000;
  return value;
}

function getNdvi(properties: Record<string, unknown> = {}, ndviLookup: NdviLookup = {}) {
  for (const key of NDVI_KEYS) {
    const raw = properties[key];
    if (raw === null || raw === undefined || raw === "") continue;
    const numeric = Number(String(raw).replace(",", "."));
    const normalized = normalizeNdviValue(numeric);
    if (normalized !== null) return normalized;
  }

  const id = properties.id ?? properties.ID ?? properties.eraldis_id ?? properties.plot_id;
  if (id !== null && id !== undefined && id !== "") {
    const fromLookup = ndviLookup[String(id)];
    const normalized = normalizeNdviValue(Number(fromLookup));
    if (normalized !== null) return normalized;
  }

  return null;
}

function ageRiskValue(age: number | string | null) {
  const numeric = typeof age === "number" ? age : Number(String(age ?? "").replace(",", "."));
  if (!Number.isFinite(numeric)) return null;
  if (numeric >= 60) return { value: 3, label: "vanus 60+ aastat" };
  if (numeric >= 41) return { value: 2, label: "vanus 41–59 aastat" };
  return { value: 1, label: "vanus 0–40 aastat" };
}

function distanceRiskValue(distanceM: number | null) {
  if (!Number.isFinite(distanceM)) return null;
  if ((distanceM as number) <= 500) return { value: 3, label: "kaugus koldest 0–500 m" };
  if ((distanceM as number) <= 1500) return { value: 2, label: "kaugus koldest 501–1500 m" };
  return { value: 1, label: "kaugus koldest üle 1500 m" };
}

function ndviRiskValue(ndvi: number | null) {
  if (!Number.isFinite(ndvi)) return null;
  // Uus maatriks: madalam NDVI = nõrgem/haavatavam mets = suurem risk.
  if ((ndvi as number) <= 0.6) return { value: 3, label: "NDVI 0–0,6" };
  if ((ndvi as number) <= 0.75) return { value: 2, label: "NDVI 0,61–0,75" };
  return { value: 1, label: "NDVI 0,76–1" };
}

function tempRiskValue(temp: number | null) {
  if (!Number.isFinite(temp)) return null;
  const t = temp as number;
  if (t >= 16.4 && t <= 30) return { value: 3, weight: 0.2, label: "temperatuur 16,4–30 °C" };
  if ((t >= 8.3 && t < 16.4) || (t > 30 && t <= 38.9)) return { value: 2, weight: 0.1, label: "temperatuur 8,3–16,4 °C või 30–38,9 °C" };
  return { value: 1, weight: 0.05, label: "temperatuur -5–8,3 °C või üle 38,9 °C" };
}

function haversineMeters(a: [number, number], b: [number, number]) {
  const radiusM = 6371000;
  const lat1 = (a[0] * Math.PI) / 180;
  const lat2 = (b[0] * Math.PI) / 180;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const value = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return radiusM * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function nearestDamageDistanceMeters(lat: number, lng: number, damageCenters: Array<[number, number]>) {
  if (!damageCenters.length) return null;
  let best = Infinity;
  for (const center of damageCenters) {
    best = Math.min(best, haversineMeters([lat, lng], center));
  }
  return Number.isFinite(best) ? best : null;
}

function assessForestInfectionRisk(options: {
  properties: Record<string, unknown>;
  lat: number;
  lng: number;
  weather: WeatherStats | null;
  damageCenters: Array<[number, number]>;
  ndviLookup?: NdviLookup;
  insideDangerZone?: boolean;
}) {
  const forestAge = getForestAge(options.properties);
  const ndvi = getNdvi(options.properties, options.ndviLookup ?? {});
  const distanceM = nearestDamageDistanceMeters(options.lat, options.lng, options.damageCenters);
  const factors: string[] = [];

  // v28: riskiskoor arvutatakse alati maatriksi järgi, mitte ainult leviala sees.
  // Leviala sees olemine on selgitav lisategur, kuid metsa vanus, kaugus, NDVI ja
  // temperatuur jäävad igal juhul arvutusse. Nii ei muutu vana või kehva NDVI-ga
  // kuuseeraldis ekslikult halliks ainult sellepärast, et see jääb levialast välja.
  if (options.insideDangerZone === true) {
    factors.push("mets lõikub kolde leviala kontuuriga või jääb selle sisse; riskivärv kuvatakse kollakas-oranžil skaalal");
  } else if (options.insideDangerZone === false) {
    factors.push("mets jääb leviala kontuurist välja; kuvatakse rohelisel safe-zone skaalal");
  } else {
    factors.push("levialaga lõikumist ei saanud üheselt määrata; kasutatakse kauguse, vanuse, NDVI ja temperatuuri maatriksit");
  }

  let weightedScore = 0;
  let maxScore = 0;

  const age = ageRiskValue(forestAge);
  if (age) {
    weightedScore += age.value * 1;
    maxScore += 3 * 1;
    factors.push(`${age.label}: väärtus ${age.value}, kaal 1`);
  } else {
    factors.push("vanuse väli puudub või ei ole arvuline; vanust riskiskooris ei arvestatud");
  }

  const distance = distanceRiskValue(distanceM);
  if (distance) {
    weightedScore += distance.value * 1;
    maxScore += 3 * 1;
    factors.push(`${distance.label}: väärtus ${distance.value}, kaal 1`);
  } else {
    factors.push("kaugust lähima koldeni ei saanud arvutada");
  }

  const ndviRisk = ndviRiskValue(ndvi);
  if (ndviRisk) {
    weightedScore += ndviRisk.value * 0.9;
    maxScore += 3 * 0.9;
    factors.push(`${ndviRisk.label}: väärtus ${ndviRisk.value}, kaal 0,9 (NDVI koefitsient rakendatud)`);
  } else {
    factors.push("NDVI puudub nii metsa atribuutides kui plot_medians_summer2025.json failis; NDVI-d riskiskooris ei arvestatud");
  }

  const tempRisk = tempRiskValue(options.weather?.temperature ?? null);
  if (tempRisk) {
    weightedScore += tempRisk.value * tempRisk.weight;
    maxScore += 3 * 0.2;
    factors.push(`${tempRisk.label}: väärtus ${tempRisk.value}, kaal ${String(tempRisk.weight).replace(".", ",")}`);
  } else {
    factors.push("temperatuuriandmed puuduvad; temperatuuri riskiskooris ei arvestatud");
  }

  const score = maxScore > 0 ? Math.round((weightedScore / maxScore) * 100) : 0;
  const riskLevel = score >= 70 ? "kõrge" : score >= 45 ? "keskmine" : "madal";

  return { score, riskLevel: riskLevel as "madal" | "keskmine" | "kõrge", factors, distanceM, ndvi, forestAge };
}

function enrichInfectedSpruceSummary(
  summary: InfectedSpruceSummary | null,
  weather: WeatherStats | null,
  weatherStats: WeatherStats[],
  damageCenters: Array<[number, number]>,
  ndviLookup: NdviLookup,
): InfectedSpruceSummary | null {
  if (!summary) return null;

  const enrichedForests = (summary.forests ?? []).map((forest) => {
    const center = Array.isArray(forest.center) ? forest.center : null;
    const properties: Record<string, unknown> = { ...forest };
    if (forest.ndvi !== null && forest.ndvi !== undefined) properties.ndvi = forest.ndvi;
    if (center) {
      const localWeather = weatherForLocation(center[0], center[1], weatherStats).weather ?? weather;
      const risk = assessForestInfectionRisk({
        properties,
        lat: center[0],
        lng: center[1],
        weather: localWeather,
        damageCenters,
        ndviLookup,
        insideDangerZone: true,
      });
      return {
        ...forest,
        ndvi: risk.ndvi ?? forest.ndvi ?? null,
        keskm_vanus: risk.forestAge ?? forest.keskm_vanus ?? null,
        risk_score: risk.score,
        risk_level: risk.riskLevel,
        risk_factors: risk.factors,
        distance_m: risk.distanceM,
      };
    }

    const age = getForestAge(properties);
    const ndvi = getNdvi(properties, ndviLookup);
    return { ...forest, keskm_vanus: age ?? forest.keskm_vanus ?? null, ndvi: ndvi ?? forest.ndvi ?? null, risk_score: null, risk_level: null, risk_factors: ["metsa keskpunkt puudus; riskiskoori ei saanud arvutada"], distance_m: null };
  });

  const riskValues = enrichedForests
    .map((forest) => Number(forest.risk_score))
    .filter((value) => Number.isFinite(value));
  const avgRisk = riskValues.length ? Math.round(riskValues.reduce((sum, value) => sum + value, 0) / riskValues.length) : null;

  return {
    ...summary,
    forests: enrichedForests,
    avg_risk: avgRisk,
    high_risk_count: enrichedForests.filter((forest) => Number(forest.risk_score) >= 70).length,
    medium_risk_count: enrichedForests.filter((forest) => Number(forest.risk_score) >= 45 && Number(forest.risk_score) < 70).length,
    low_risk_count: enrichedForests.filter((forest) => Number(forest.risk_score) > 0 && Number(forest.risk_score) < 45).length,
  };
}

function forestSafeZoneColor(score: number | null, colorBlindMode = false) {
  const value = clamp(Number(score ?? 0), 0, 100);

  if (colorBlindMode) {
    // Värvipimeda režiim: turvatsoon on sinisel skaalal, mitte rohelisel.
    // Sinine on enamiku punarohelise värvipimeduse tüüpide jaoks paremini eristatav.
    const lightness = Math.round(88 - (34 * value) / 100);
    return {
      pane: "sprucePane",
      color: value >= 70 ? "#1d4ed8" : "#2563eb",
      weight: value >= 70 ? 0.85 : 0.6,
      opacity: 0.96,
      fillColor: `hsl(207, 86%, ${lightness}%)`,
      fillOpacity: 0.66,
    };
  }

  // Tavarežiim: levialast väljas olevad metsad jäävad rohelise skaalale.
  // Heledam roheline = madalam taustarisk, tumedam roheline = kõrgem taustarisk, kuid mitte aktiivne leviala.
  const lightness = Math.round(78 - (35 * value) / 100);
  const fillColor = `hsl(139, 72%, ${lightness}%)`;
  return {
    pane: "sprucePane",
    color: value >= 70 ? "#14532d" : "#166534",
    weight: value >= 70 ? 0.7 : 0.5,
    opacity: 0.9,
    fillColor,
    fillOpacity: 0.58,
  };
}

function forestSpreadRiskColor(score: number | null, colorBlindMode = false) {
  const value = clamp(Number(score ?? 0), 0, 100);

  if (colorBlindMode) {
    // Värvipimeda režiim: levialas olev riskimets on kollane → lilla skaala.
    // See eristub selgelt sinisest turvatsoonist ja tumedast koldevärvist.
    const start = { r: 255, g: 237, b: 112 }; // hele kollane
    const end = { r: 126, g: 34, b: 206 }; // lilla
    const t = value / 100;
    const r = Math.round(start.r + (end.r - start.r) * t);
    const g = Math.round(start.g + (end.g - start.g) * t);
    const b = Math.round(start.b + (end.b - start.b) * t);
    const fillColor = `rgb(${r}, ${g}, ${b})`;
    const strokeColor = value >= 70 ? "#581c87" : value >= 45 ? "#7e22ce" : "#a16207";
    return {
      color: strokeColor,
      fillColor,
      fillOpacity: value >= 70 ? 0.9 : value >= 45 ? 0.84 : 0.76,
      weight: value >= 70 ? 1.0 : 0.75,
      opacity: 0.98,
    };
  }

  // Tavarežiim: levikuala sees olev mets on alati riskimets ja algab helekollasest.
  // Punast ei kasutata siin: punane jääb ainult RMK kahjustuskolletele.
  const hue = Math.round(56 - (26 * value) / 100); // 56 = helekollane, 30 = oranž
  const lightness = Math.round(84 - (32 * value) / 100);
  const fillColor = `hsl(${hue}, 96%, ${lightness}%)`;
  const strokeColor = value >= 70 ? "#c2410c" : value >= 45 ? "#d97706" : "#eab308";

  return {
    color: strokeColor,
    fillColor,
    fillOpacity: value >= 70 ? 0.88 : value >= 45 ? 0.8 : 0.72,
    weight: value >= 70 ? 0.85 : 0.65,
    opacity: 0.95,
  };
}

function damageAreaStyle(colorBlindMode = false) {
  return colorBlindMode
    ? {
        pane: "damagePane",
        color: "#111827",
        weight: 2.2,
        opacity: 1,
        fillColor: "#000000",
        fillOpacity: 0.56,
        lineJoin: "round",
      }
    : {
        pane: "damagePane",
        color: "#7f1d1d",
        weight: 1.8,
        opacity: 0.98,
        fillColor: "#ef4444",
        fillOpacity: 0.42,
        lineJoin: "round",
      };
}

function spreadZoneStyle(colorBlindMode = false) {
  return colorBlindMode
    ? {
        color: "#6d28d9",
        weight: 2.9,
        opacity: 0.98,
        fillColor: "#ddd6fe",
        fillOpacity: 0.36,
        lineJoin: "round",
        lineCap: "round",
        fillRule: "evenodd",
      }
    : {
        color: "#ea580c",
        weight: 2.6,
        opacity: 0.96,
        fillColor: "#fed7aa",
        fillOpacity: 0.44,
        lineJoin: "round",
        lineCap: "round",
        fillRule: "evenodd",
      };
}


const LEST97_A = 6378137;
const LEST97_INV_F = 298.257222101;
const LEST97_F = 1 / LEST97_INV_F;
const LEST97_E2 = LEST97_F * (2 - LEST97_F);
const LEST97_EP2 = LEST97_E2 / (1 - LEST97_E2);
const LEST97_LAT0 = (57 + 31 / 60 + 3.19415 / 3600) * Math.PI / 180;
const LEST97_LON0 = 24 * Math.PI / 180;
const LEST97_K0 = 0.9996;
const LEST97_FALSE_EASTING = 500000;
const LEST97_FALSE_NORTHING = 6375000;

function meridionalArc(phi: number) {
  const e2 = LEST97_E2;
  const e4 = e2 * e2;
  const e6 = e4 * e2;
  return LEST97_A * (
    (1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * phi
    - (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * Math.sin(2 * phi)
    + (15 * e4 / 256 + 45 * e6 / 1024) * Math.sin(4 * phi)
    - (35 * e6 / 3072) * Math.sin(6 * phi)
  );
}

function latLngToLest97(lat: number, lng: number): [number, number] {
  const phi = lat * Math.PI / 180;
  const lambda = lng * Math.PI / 180;
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const tanPhi = Math.tan(phi);
  const n = LEST97_A / Math.sqrt(1 - LEST97_E2 * sinPhi * sinPhi);
  const t = tanPhi * tanPhi;
  const c = LEST97_EP2 * cosPhi * cosPhi;
  const a = cosPhi * (lambda - LEST97_LON0);
  const m = meridionalArc(phi) - meridionalArc(LEST97_LAT0);

  const x = LEST97_FALSE_EASTING + LEST97_K0 * n * (
    a
    + (1 - t + c) * Math.pow(a, 3) / 6
    + (5 - 18 * t + t * t + 72 * c - 58 * LEST97_EP2) * Math.pow(a, 5) / 120
  );
  const y = LEST97_FALSE_NORTHING + LEST97_K0 * (
    m
    + n * tanPhi * (
      (a * a) / 2
      + (5 - t + 9 * c + 4 * c * c) * Math.pow(a, 4) / 24
      + (61 - 58 * t + t * t + 600 * c - 330 * LEST97_EP2) * Math.pow(a, 6) / 720
    )
  );
  return [x, y];
}

function createMaaRuumHallkaartLayer(L: any) {
  const HallkaartLayer = L.GridLayer.extend({
    createTile(this: any, coords: any, done: (error?: Error | null, tile?: HTMLImageElement) => void) {
      const tile = document.createElement("img");
      tile.alt = "";
      tile.setAttribute("role", "presentation");
      tile.crossOrigin = "anonymous";

      const size = this.getTileSize();
      tile.width = size.x;
      tile.height = size.y;

      const map = this._map;
      const nwPoint = coords.scaleBy(size);
      const sePoint = nwPoint.add(size);
      const nw = map.unproject(nwPoint, coords.z);
      const ne = map.unproject(L.point(sePoint.x, nwPoint.y), coords.z);
      const se = map.unproject(sePoint, coords.z);
      const sw = map.unproject(L.point(nwPoint.x, sePoint.y), coords.z);
      const projected = [nw, ne, se, sw].map((point: any) => latLngToLest97(point.lat, point.lng));
      const xs = projected.map(([x]) => x);
      const ys = projected.map(([, y]) => y);
      const bbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
        .map((value) => value.toFixed(2))
        .join(",");

      const params = new URLSearchParams({
        SERVICE: "WMS",
        VERSION: "1.1.1",
        REQUEST: "GetMap",
        LAYERS: "kaart_ht",
        STYLES: "",
        FORMAT: "image/png",
        SRS: "EPSG:3301",
        BBOX: bbox,
        WIDTH: String(size.x),
        HEIGHT: String(size.y),
        TRANSPARENT: "FALSE",
      });

      tile.onload = () => done(null, tile);
      tile.onerror = () => done(new Error("Maa- ja Ruumiameti hallkaardi tile ei laadinud"), tile);
      tile.src = `https://kaart.maaamet.ee/wms/hallkaart?${params.toString()}`;
      return tile;
    },
  });

  return new HallkaartLayer({
    tileSize: 256,
    maxZoom: 19,
    attribution: "Aluskaart: Maa- ja Ruumiamet",
  });
}

export function EstoniaMap({ area, showWeather, showDamage, showDangerZones, showSpruceForests, colorBlindMode, onMapClick, onWeatherSummary }: EstoniaMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const layersRef = useRef<{ weather?: any; damage?: any; dangerZones?: any; spruce?: any }>({});
  const spruceRendererRef = useRef<any>(null);
  const spruceLoadedChunksRef = useRef(new Map<string, any>());
  const spruceLoadingChunksRef = useRef(new Set<string>());
  const spruceLoadFunctionRef = useRef<(() => void) | null>(null);
  const dangerPolygonsRef = useRef<DangerPolygon[]>([]);
  const damageCentersRef = useRef<Array<[number, number]>>([]);
  const spruceVisibleRef = useRef(showSpruceForests);
  const colorBlindModeRef = useRef(colorBlindMode);
  const spruceLoadStateRef = useRef({ key: "", abort: null as AbortController | null });
  const clickHandlerRef = useRef(onMapClick);
  const weatherStatsRef = useRef<WeatherStats[]>([]);
  const ndviLookupRef = useRef<NdviLookup>({});
  const infectedSpruceLookupRef = useRef<InfectedSpruceLookup>({});
  const offlineMarkersLayerRef = useRef<any>(null);
  const offlineRegionLayerRef = useRef<any>(null);
  const gpsLayerRef = useRef<any>(null);
  const offlineStatusRef = useRef<HTMLDivElement | null>(null);
  const offlineControlsRef = useRef<HTMLDivElement | null>(null);
  const offlineMarkersRef = useRef<OfflineMarkerRecord[]>([]);
  const offlineRegionRef = useRef<OfflineRegionRecord | null>(null);
  const offlineClientIdRef = useRef<string>("");
  const userLocationMarkerRef = useRef<any>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressLatLngRef = useRef<any>(null);
  const offlineSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  clickHandlerRef.current = onMapClick;
  spruceVisibleRef.current = showSpruceForests;
  colorBlindModeRef.current = colorBlindMode;
  COLOR_BLIND_MODE = colorBlindMode;

  const restyleMapLayers = () => {
    COLOR_BLIND_MODE = colorBlindModeRef.current;
    const restyleLayer = (layer: any) => {
      if (!layer) return;
      if (typeof layer.setStyle === "function") {
        const feature = layer.feature;
        if (feature?.properties && layer.options?.pane === "sprucePane") {
          layer.setStyle(spruceStyle(feature, dangerPolygonsRef.current, weatherStatsRef.current, damageCentersRef.current, ndviLookupRef.current));
        } else if (layer.options?.pane === "damagePane") {
          layer.setStyle(damageAreaStyle(colorBlindModeRef.current));
        } else if (layer.options?.pane === "dangerPane") {
          layer.setStyle(spreadZoneStyle(colorBlindModeRef.current));
        }
      }
      if (typeof layer.eachLayer === "function") layer.eachLayer(restyleLayer);
    };
    restyleLayer(layersRef.current.spruce);
    restyleLayer(layersRef.current.damage);
    restyleLayer(layersRef.current.dangerZones);
  };

  useEffect(() => {
    restyleMapLayers();
  }, [colorBlindMode]);

  useEffect(() => {
    let cancelled = false;
    let cleanupOfflineUi = () => {};

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

      const openStreetMapBase = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap contributors",
      });

      const maaRuumHallBase = createMaaRuumHallkaartLayer(L);

      // Vaikimisi jääb kasutusele OpenStreetMap. Hallkaart tuleb kasutaja soovitud
      // Maa- ja Ruumiameti WMS teenusest. Teenus kasutab L-EST97 / EPSG:3301
      // koordinaadistikku, seega arvutame iga Leafleti tile'i päringule EPSG:3301 BBOX-i.
      openStreetMapBase.addTo(map);

      L.control
        .layers(
          {
            "OpenStreetMap": openStreetMapBase,
            "Maa- ja Ruumiameti hallkaart": maaRuumHallBase,
          },
          {},
          {
            position: "topleft",
            collapsed: true,
          },
        )
        .addTo(map);

      map.createPane("dangerPane");
      map.getPane("dangerPane")!.style.zIndex = "350";
      map.createPane("sprucePane");
      map.getPane("sprucePane")!.style.zIndex = "430";
      map.createPane("damagePane");
      map.getPane("damagePane")!.style.zIndex = "550";
      spruceRendererRef.current = L.canvas({ padding: 0.5 });

      map.on("click", () => {
        // Infotabelit täidetakse ainult RMK punase kahjustusala klõpsamisel.
        clickHandlerRef.current(null);
      });

      layersRef.current.weather = L.layerGroup();
      layersRef.current.dangerZones = L.layerGroup();
      layersRef.current.spruce = L.layerGroup();
      layersRef.current.damage = L.layerGroup();

      // Lisa algselt aktiivsed kihid kohe kaardile õiges joonistusjärjekorras.
      if (showWeather) layersRef.current.weather.addTo(map);
      if (showDangerZones) layersRef.current.dangerZones.addTo(map);
      if (showSpruceForests) layersRef.current.spruce.addTo(map);
      if (showDamage) layersRef.current.damage.addTo(map);

      mapRef.current = map;

      offlineRegionLayerRef.current = L.layerGroup().addTo(map);
      offlineMarkersLayerRef.current = L.layerGroup().addTo(map);
      gpsLayerRef.current = L.layerGroup().addTo(map);
      offlineClientIdRef.current = offlineClientIdRef.current || getOrCreateClientId();

      const mapContainer = map.getContainer() as HTMLDivElement;

      const offlineWrapper = document.createElement("div");
      offlineWrapper.style.position = "absolute";
      offlineWrapper.style.right = "16px";
      offlineWrapper.style.bottom = "16px";
      offlineWrapper.style.zIndex = "905";
      offlineWrapper.style.display = "flex";
      offlineWrapper.style.flexDirection = "column";
      offlineWrapper.style.alignItems = "flex-end";
      offlineWrapper.style.gap = "8px";

      const controls = document.createElement("div");
      controls.style.display = "none";
      controls.style.flexDirection = "column";
      controls.style.gap = "8px";
      controls.style.padding = "10px";
      controls.style.borderRadius = "18px";
      controls.style.border = "1px solid rgba(148, 163, 184, 0.35)";
      controls.style.background = "rgba(15, 23, 42, 0.9)";
      controls.style.backdropFilter = "blur(10px)";
      controls.style.boxShadow = "0 10px 30px rgba(15, 23, 42, 0.3)";
      controls.style.minWidth = "210px";
      controls.innerHTML = `<div style="font-size:11px;font-weight:800;letter-spacing:.08em;color:#cbd5e1;text-transform:uppercase;">Offline tööriistad</div>`;

      const statusPill = document.createElement("div");
      statusPill.style.padding = "8px 10px";
      statusPill.style.borderRadius = "12px";
      statusPill.style.border = "1px solid rgba(148, 163, 184, 0.25)";
      statusPill.style.background = "rgba(2, 6, 23, 0.45)";
      statusPill.style.color = "white";
      statusPill.style.fontSize = "12px";
      statusPill.style.fontWeight = "700";
      statusPill.textContent = "Offline ala: ootel";
      offlineStatusRef.current = statusPill;

      const makeButton = (label: string) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.style.border = "none";
        button.style.borderRadius = "12px";
        button.style.padding = "9px 12px";
        button.style.fontSize = "13px";
        button.style.fontWeight = "700";
        button.style.cursor = "pointer";
        button.style.background = "#e2e8f0";
        button.style.color = "#0f172a";
        button.style.boxShadow = "0 1px 6px rgba(0,0,0,0.18)";
        return button;
      };

      const locateBtn = makeButton("Leia minu asukoht");
      const downloadBtn = makeButton("Laadi offline piirkond");
      const clearMarkersBtn = makeButton("Kustuta kasutaja leiutäpid");
      clearMarkersBtn.style.background = "#fee2e2";
      clearMarkersBtn.style.color = "#7f1d1d";
      const statusLine = document.createElement("div");
      statusLine.style.fontSize = "12px";
      statusLine.style.lineHeight = "1.4";
      statusLine.style.color = "#cbd5e1";
      statusLine.textContent = "Paremklõps kaardil lisab kasutaja üraskileiu märke. Märgid salvestatakse sinu brauserisse ja neid saab kustutada alloleva nupuga.";

      controls.appendChild(statusPill);
      controls.appendChild(locateBtn);
      controls.appendChild(downloadBtn);
      controls.appendChild(clearMarkersBtn);
      controls.appendChild(statusLine);
      offlineControlsRef.current = controls;

      const toggleOfflineBtn = document.createElement("button");
      toggleOfflineBtn.type = "button";
      toggleOfflineBtn.textContent = "▴ Offline";
      toggleOfflineBtn.title = "Ava/sulge offline tööriistad";
      toggleOfflineBtn.style.border = "1px solid rgba(148, 163, 184, 0.35)";
      toggleOfflineBtn.style.borderRadius = "999px";
      toggleOfflineBtn.style.padding = "9px 13px";
      toggleOfflineBtn.style.fontSize = "13px";
      toggleOfflineBtn.style.fontWeight = "800";
      toggleOfflineBtn.style.cursor = "pointer";
      toggleOfflineBtn.style.color = "#ecfdf5";
      toggleOfflineBtn.style.background = "rgba(15, 23, 42, 0.9)";
      toggleOfflineBtn.style.boxShadow = "0 8px 24px rgba(15, 23, 42, 0.28)";

      let offlineOpen = false;
      const setOfflineOpen = (open: boolean) => {
        offlineOpen = open;
        controls.style.display = open ? "flex" : "none";
        toggleOfflineBtn.textContent = open ? "▾ Offline" : "▴ Offline";
      };
      toggleOfflineBtn.addEventListener("click", () => setOfflineOpen(!offlineOpen));

      offlineWrapper.appendChild(controls);
      offlineWrapper.appendChild(toggleOfflineBtn);
      mapContainer.appendChild(offlineWrapper);
      L.DomEvent.disableClickPropagation(offlineWrapper);
      L.DomEvent.disableScrollPropagation(offlineWrapper);

      const setStatus = (message: string) => {
        statusLine.textContent = message;
        if (offlineStatusRef.current) offlineStatusRef.current.textContent = message;
      };
      const clearOfflineMarkers = () => {
        offlineMarkersRef.current = [];
        try { window.localStorage.removeItem(OFFLINE_MARKERS_KEY); } catch { /* ignore */ }
        offlineMarkersLayerRef.current?.clearLayers?.();
        setStatus("Kõik kasutaja lisatud üraskileiu täpid on kustutatud.");
      };

      const saveOfflineMarkers = () => {
        writeJsonStorage(OFFLINE_MARKERS_KEY, offlineMarkersRef.current);
      };

      const saveOfflineRegion = () => {
        writeJsonStorage(OFFLINE_REGION_KEY, offlineRegionRef.current);
      };

      const renderOfflineRegion = () => {
        const regionLayer = offlineRegionLayerRef.current;
        if (!regionLayer) return;
        regionLayer.clearLayers();
        const region = offlineRegionRef.current;
        if (!region) return;

        const [lat, lng] = region.center;
        const bounds = squareBoundsAround(lat, lng, region.radiusKm);
        L.rectangle(
          [
            [bounds.south, bounds.west],
            [bounds.north, bounds.east],
          ],
          {
            color: "#f59e0b",
            weight: 2,
            dashArray: "6 6",
            fillColor: "#fbbf24",
            fillOpacity: 0.08,
          },
        ).bindTooltip("Offline ala 10 km × 10 km", { sticky: true }).addTo(regionLayer);
      };
      const renderOfflineMarkers = () => {
        const markerLayer = offlineMarkersLayerRef.current;
        if (!markerLayer) return;
        markerLayer.clearLayers();
        const markers = offlineMarkersRef.current;
        markers.forEach((record) => {
          const marker = L.circleMarker([record.lat, record.lng], {
            pane: "markerPane",
            radius: 7,
            color: "#7f1d1d",
            weight: 2,
            fillColor: "#ef4444",
            fillOpacity: 0.92,
          });
          const created = new Date(record.createdAt).toLocaleString("et-EE");
          marker.bindPopup(`
            <div style="min-width:180px">
              <strong>Kasutaja lisatud üraskileid</strong><br />
              <span>Lisatud: ${created}</span><br />
              <span>Koordinaadid: ${record.lat.toFixed(6)}, ${record.lng.toFixed(6)}</span>
            </div>
          `);
          marker.bindTooltip("Kasutaja lisatud üraskileid", { sticky: true });
          marker.addTo(markerLayer);
        });
        if (markers.length > 0) {
          setStatus(`Kasutaja üraskileiu täppe: ${markers.length}. Paremklõps lisab uue täpi.`);
        }
      };

      const addOfflineMarker = (latlng: { lat: number; lng: number }) => {
        const record: OfflineMarkerRecord = {
          id: `marker-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          lat: latlng.lat,
          lng: latlng.lng,
          createdAt: new Date().toISOString(),
          clientId: offlineClientIdRef.current || getOrCreateClientId(),
          synced: false,
          syncedAt: null,
        };
        offlineMarkersRef.current = [...offlineMarkersRef.current, record];
        saveOfflineMarkers();
        renderOfflineMarkers();
        setStatus(`Üraskileiu täpp lisatud: ${record.lat.toFixed(5)}, ${record.lng.toFixed(5)}.`);
      };

      const persistOfflineState = () => {
        saveOfflineRegion();
        renderOfflineRegion();
        renderOfflineMarkers();
      };
      const loadOfflineState = () => {
        const storedMarkers = readJsonStorage<OfflineMarkerRecord[]>(OFFLINE_MARKERS_KEY, []);
        offlineMarkersRef.current = Array.isArray(storedMarkers) ? storedMarkers : [];
        const storedRegion = readJsonStorage<OfflineRegionRecord | null>(OFFLINE_REGION_KEY, null);
        offlineRegionRef.current = storedRegion;
        persistOfflineState();
      };
      const syncOfflineMarkers = async () => {
        // Praegu on kasutaja lisatud leiutäpid lokaalsed märkmed. Neid ei saadeta serverisse.
        renderOfflineMarkers();
      };

      const loadSharedMarkers = async () => {
        renderOfflineMarkers();
      };

      const loadOfflineArea = async () => {
        const center = offlineRegionRef.current?.center
          ? { lat: offlineRegionRef.current.center[0], lng: offlineRegionRef.current.center[1] }
          : map.getCenter();
        const region: OfflineRegionRecord = {
          center: [center.lat, center.lng],
          radiusKm: 5,
          updatedAt: new Date().toISOString(),
        };
        offlineRegionRef.current = region;
        saveOfflineRegion();
        renderOfflineRegion();

        const bounds = squareBoundsAround(center.lat, center.lng, region.radiusKm);
        const tileRequests: string[] = [];
        for (const zoom of OFFLINE_TILE_ZOOMS) {
          const sw = latLngToTile(bounds.south, bounds.west, zoom);
          const ne = latLngToTile(bounds.north, bounds.east, zoom);
          const xMin = Math.min(sw.x, ne.x);
          const xMax = Math.max(sw.x, ne.x);
          const yMin = Math.min(sw.y, ne.y);
          const yMax = Math.max(sw.y, ne.y);
          for (let x = xMin; x <= xMax; x += 1) {
            for (let y = yMin; y <= yMax; y += 1) {
              tileRequests.push(tileUrl(zoom, x, y));
            }
          }
        }

        const limitedRequests = tileRequests.slice(0, OFFLINE_MAX_TILES);
        let loaded = 0;
        for (const url of limitedRequests) {
          try {
            await fetch(url, { mode: "no-cors", cache: "no-store" });
            loaded += 1;
          } catch (error) {
            console.warn("Tile prefetch failed", url, error);
          }
        }
        setStatus(`Offline ala salvestatud. Eellaadisin ${loaded} kaardiplaati.`);
      };

      const locateUser = async () => {
        if (!navigator.geolocation) {
          setStatus("GPS ei ole selles brauseris saadaval.");
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const { latitude, longitude } = position.coords;
            map.flyTo([latitude, longitude], Math.max(map.getZoom(), 13), { duration: 0.8 });
            userLocationMarkerRef.current?.remove();
            userLocationMarkerRef.current = L.circleMarker([latitude, longitude], {
              radius: 8,
              color: "#0ea5e9",
              weight: 3,
              fillColor: "#38bdf8",
              fillOpacity: 0.85,
            }).addTo(gpsLayerRef.current);
            userLocationMarkerRef.current.bindPopup("Sinu asukoht");
            offlineRegionRef.current = offlineRegionRef.current ?? {
              center: [latitude, longitude],
              radiusKm: 5,
              updatedAt: new Date().toISOString(),
            };
            renderOfflineRegion();
            setStatus("Asukoht leitud. Vajuta 'Laadi offline piirkond', et kaardiplaadid salvestada.");
          },
          () => setStatus("GPS asukohta ei õnnestunud leida."),
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 30_000 },
        );
      };

      locateBtn.addEventListener("click", () => {
        void locateUser();
      });
      downloadBtn.addEventListener("click", () => {
        void loadOfflineArea();
      });
      clearMarkersBtn.addEventListener("click", () => {
        clearOfflineMarkers();
      });

      const onMapContextMenu = (event: any) => {
        event.originalEvent?.preventDefault?.();
        addOfflineMarker(event.latlng);
      };
      map.on("contextmenu", onMapContextMenu);

      loadOfflineState();
      void loadSharedMarkers();
      if (navigator.onLine) {
        void syncOfflineMarkers();
      } else {
        setStatus("Offline režiim aktiivne. Paremklõpsuga lisatud üraskileiu täpid on brauseris alles.");
      }

      const onNetworkChange = () => {
        if (navigator.onLine) {
          setStatus("Side taastunud. Offline tööriistad ja kasutaja leiutäpid on valmis.");
          renderOfflineMarkers();
        } else {
          setStatus("Offline režiim aktiivne.");
        }
      };
      window.addEventListener("online", onNetworkChange);
      window.addEventListener("offline", onNetworkChange);

      cleanupOfflineUi = () => {
        if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
        window.removeEventListener("online", onNetworkChange);
        window.removeEventListener("offline", onNetworkChange);
        map.off("contextmenu", onMapContextMenu);
        locateBtn.remove();
        downloadBtn.remove();
        clearMarkersBtn.remove();
        offlineWrapper.remove();
      };

      const [weatherText, rmk, rmkMerged, spreadUnion] = await Promise.all([
        fetch(dataUrl("weather.xml"), { cache: "no-store" }).then((r) => r.text()),
        fetch(dataUrl("rmk_wgs84.geojson")).then((r) => r.json()),
        fetch(dataUrl("rmk_damage_merged_wgs84.geojson")).then((r) => r.json()),
        fetch(dataUrl("spread_zones_union_wgs84.geojson")).then((r) => r.json()),
      ]);
      if (cancelled) return;

      const parsedWeather = parseWeatherXml(weatherText);
      weatherStatsRef.current = parsedWeather.countyStats;
      try {
        ndviLookupRef.current = await fetch(dataUrl("plot_medians_summer2025.json"), { cache: "no-store" }).then((r) => r.json()) as NdviLookup;
      } catch (error) {
        ndviLookupRef.current = {};
        console.warn("2025 suvise NDVI faili laadimine ebaõnnestus, risk arvutatakse ilma NDVI-ta", error);
      }
      try {
        infectedSpruceLookupRef.current = await fetch(dataUrl("infected_spruce_by_damage.json")).then((r) => r.json()) as InfectedSpruceLookup;
      } catch (error) {
        infectedSpruceLookupRef.current = {};
        console.warn("Koldega kattuvate kuuseeraldiste faili laadimine ebaõnnestus", error);
      }
      onWeatherSummary?.(weatherSummary(parsedWeather.countyStats));

      // Ilmaandmed hoitakse mälus arvutuse jaoks. Neid ei joonistata kaardile ja tavaline kaardiklõps infotabelit ei täida.

      const dangerPolygons: Array<[number, number][]> = [];
      const damageCenters: Array<[number, number]> = [];

      // Nähtav koldekiht on täpse geomeetrilise ühendamise tulemus.
      // Ühendatakse ainult päriselt kattuvad või kokku puutuvad RMK kahjustusalad;
      // lahus olevad kolded jäävad eraldi kontuuriga.
      L.geoJSON(rmkMerged, {
        style: () => damageAreaStyle(colorBlindModeRef.current),
        interactive: false,
      }).addTo(layersRef.current.damage);

      // Algne RMK kiht jääb nähtamatuks klikikihiks, et iga haige metsaala infotabeli arvutus töötaks edasi.
      L.geoJSON(rmk, {
        style: { pane: "damagePane", stroke: false, fill: true, fillColor: "#ef4444", fillOpacity: 0.01 },
        onEachFeature: (feature: any, layer: any) => {
          const p = cleanProperties(feature.properties || {});

          const initialCenter = layer.getBounds ? layer.getBounds().getCenter() : null;
          if (initialCenter) {
            damageCenters.push([initialCenter.lat, initialCenter.lng]);
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
            const damageId = String(p.id ?? "");
            const infectedSpruceRaw = damageId ? infectedSpruceLookupRef.current[damageId] ?? null : null;
            const infectedSpruce = enrichInfectedSpruceSummary(
              infectedSpruceRaw,
              weather,
              weatherStatsRef.current,
              damageCentersRef.current.length ? damageCentersRef.current : damageCenters,
              ndviLookupRef.current,
            );
            clickHandlerRef.current({
              lat: center.lat,
              lng: center.lng,
              inside: true,
              type: "damage",
              title: "RMK kahjustusala",
              countyName: county.name,
              weather,
              spread,
              cadastralIds: infectedSpruce?.forests?.length
                ? [...new Set(infectedSpruce.forests.map((forest) => forest.katastri_nr).filter(Boolean).map(String))]
                : getCadastralIds(p),
              dangerZoneRadiusKm: undefined,
              dangerZoneDownwindKm: zone.downwindKm,
              dangerZoneLateralKm: zone.lateralKm,
              dangerZoneUpwindKm: zone.upwindKm,
              infectedSpruce,
              forestAge: infectedSpruce?.avg_age ?? null,
              forestNdvi: infectedSpruce?.avg_ndvi ?? null,
              forestRiskScore: infectedSpruce?.avg_risk ?? null,
              forestRiskLevel: infectedSpruce?.avg_risk !== null && infectedSpruce?.avg_risk !== undefined ? (infectedSpruce.avg_risk >= 70 ? "kõrge" : infectedSpruce.avg_risk >= 45 ? "keskmine" : "madal") : null,
              properties: p,
            });
          });
        },
      }).addTo(layersRef.current.damage);

      const displayedSpreadPolygons = geoJsonCollectionRings(spreadUnion);
      dangerPolygonsRef.current = displayedSpreadPolygons.length ? displayedSpreadPolygons : dangerPolygons;
      damageCentersRef.current = damageCenters;
      if (displayedSpreadPolygons.length || dangerPolygons.length) {
        layersRef.current.dangerZones.addLayer(createExactUnionDangerZoneLayer(L, spreadUnion, colorBlindModeRef.current));
      }

      const addSpruceFeatureCollection = (data: SpruceFeatureCollection, targetChunkId: string) => {
        if (!layersRef.current.spruce) return 0;

        const seen = new Set<string>();
        const uniqueFeatures = (data.features || []).filter((feature) => {
          const key = featureKey(feature);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        if (!uniqueFeatures.length) return 0;

        const chunkLayer = L.geoJSON({ type: "FeatureCollection", features: uniqueFeatures }, {
          pane: "sprucePane",
          renderer: spruceRendererRef.current,
          interactive: true,
          bubblingMouseEvents: false,
          style: (feature: any) => spruceStyle(feature, dangerPolygonsRef.current, weatherStatsRef.current, damageCentersRef.current, ndviLookupRef.current),
          onEachFeature: (feature: any, layer: any) => {
            const p = cleanProperties(feature.properties || {});
            layer.on("click", (event: any) => {
              L.DomEvent.stopPropagation(event);
              const center = layer.getBounds ? layer.getBounds().getCenter() : event.latlng;
              const { county, weather } = weatherForLocation(center.lat, center.lng, weatherStatsRef.current);
              const insideDangerZone = featureTouchesOrIsInsideDanger(feature, dangerPolygonsRef.current);
              const risk = assessForestInfectionRisk({
                properties: p,
                lat: center.lat,
                lng: center.lng,
                weather,
                damageCenters: damageCentersRef.current,
                ndviLookup: ndviLookupRef.current,
                insideDangerZone,
              });
              clickHandlerRef.current({
                lat: center.lat,
                lng: center.lng,
                inside: insideDangerZone,
                type: "spruce",
                title: "Kuusemetsa eraldis",
                countyName: county.name,
                weather,
                spread: null,
                cadastralIds: getCadastralIds(p),
                forestAge: risk.forestAge,
                forestRiskScore: risk.score,
                forestRiskLevel: risk.riskLevel,
                forestRiskFactors: risk.factors,
                forestDistanceToDamageM: risk.distanceM,
                forestNdvi: risk.ndvi,
                properties: p,
              });
            });
          },
        });

        spruceLoadedChunksRef.current.set(targetChunkId, chunkLayer);
        chunkLayer.addTo(layersRef.current.spruce);
        return uniqueFeatures.length;
      };

      const spruceIndex = (await fetch(dataUrl("spruce_index.json")).then((r) => r.json())) as SpruceChunkIndex;
      let loadedSpruceFeatures = 0;

      const removeAllSpruceChunks = () => {
        if (!layersRef.current.spruce) return;
        for (const layer of spruceLoadedChunksRef.current.values()) {
          layersRef.current.spruce.removeLayer(layer);
        }
        spruceLoadedChunksRef.current.clear();
        loadedSpruceFeatures = 0;
      };

      const unloadSpruceOutsideView = (wantedIds: Set<string>) => {
        if (!layersRef.current.spruce) return;
        for (const [id, layer] of spruceLoadedChunksRef.current.entries()) {
          if (!wantedIds.has(id)) {
            layersRef.current.spruce.removeLayer(layer);
            spruceLoadedChunksRef.current.delete(id);
          }
        }
      };

      const loadSpruceForCurrentView = async () => {
        if (!spruceVisibleRef.current || !layersRef.current.spruce) return;

        const zoom = map.getZoom();
        if (zoom < SPRUCE_MIN_ZOOM) {
          removeAllSpruceChunks();
          onWeatherSummary?.(`${weatherSummary(parsedWeather.countyStats)} Kuusemetsa polügonid on jõudluse tõttu nähtavad alates suumist ${SPRUCE_MIN_ZOOM}. Suumi metsa piirkonda sisse.`);
          return;
        }

        const visibleBbox = leafletBoundsToArray(map.getBounds().pad(0.05));
        const visibleChunks = spruceIndex.chunks.filter((chunk) => bboxesIntersect(chunk.bbox, visibleBbox));
        const wantedChunks = visibleChunks.slice(0, SPRUCE_MAX_ACTIVE_CHUNKS);
        const wantedIds = new Set(wantedChunks.map((chunk) => chunk.id));
        unloadSpruceOutsideView(wantedIds);

        const chunksToLoad = wantedChunks
          .filter((chunk) => !spruceLoadedChunksRef.current.has(chunk.id) && !spruceLoadingChunksRef.current.has(chunk.id));

        if (!chunksToLoad.length) {
          onWeatherSummary?.(`${weatherSummary(parsedWeather.countyStats)} Kuusemetsa polügonid on optimeeritud: laetud on ainult nähtava ala kaarditükid (${spruceLoadedChunksRef.current.size}/${spruceIndex.chunks.length}).`);
          return;
        }

        onWeatherSummary?.(`${weatherSummary(parsedWeather.countyStats)} Laen ainult nähtava ala kuusepolügone: ${chunksToLoad.length} uut kaarditükki.`);

        for (let i = 0; i < chunksToLoad.length; i += SPRUCE_FETCH_BATCH_SIZE) {
          const batch = chunksToLoad.slice(i, i + SPRUCE_FETCH_BATCH_SIZE);
          await Promise.all(batch.map(async (chunk) => {
            spruceLoadingChunksRef.current.add(chunk.id);
            try {
              const response = await fetch(dataUrl(`spruce_tiles/${chunk.file}`));
              if (!response.ok) throw new Error(`Kuusemetsa andmetüki laadimine ebaõnnestus: ${chunk.file}`);
              const data = (await response.json()) as SpruceFeatureCollection;
              loadedSpruceFeatures += addSpruceFeatureCollection(data, chunk.id);
            } finally {
              spruceLoadingChunksRef.current.delete(chunk.id);
            }
          }));
          onWeatherSummary?.(`${weatherSummary(parsedWeather.countyStats)} Kuusemetsa aktiivseid kaarditükke: ${spruceLoadedChunksRef.current.size}. See vaade ei laadi korraga kogu Eesti 344 452 polügonit.`);
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      };

      let spruceTimer: ReturnType<typeof setTimeout> | undefined;
      const scheduleSpruceLoad = () => {
        if (spruceTimer) clearTimeout(spruceTimer);
        spruceTimer = setTimeout(loadSpruceForCurrentView, 180);
      };
      spruceLoadFunctionRef.current = scheduleSpruceLoad;
      map.on("moveend zoomend", scheduleSpruceLoad);
      await loadSpruceForCurrentView();
    })().catch((error) => {
      console.error(error);
      onWeatherSummary?.(`Andmete laadimine ebaõnnestus: ${error instanceof Error ? error.message : String(error)}`);
    });

    return () => {
      cancelled = true;
      cleanupOfflineUi();
      spruceLoadStateRef.current.abort?.abort();
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
    const layer = layersRef.current.spruce;
    if (!map || !layer) return;
    if (showSpruceForests) {
      layer.addTo(map);
      spruceLoadFunctionRef.current?.();
    } else {
      map.removeLayer(layer);
    }
  }, [showSpruceForests]);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layersRef.current.dangerZones;
    if (!map || !layer) return;
    showDangerZones ? layer.addTo(map) : map.removeLayer(layer);
  }, [showDangerZones]);

  return <div ref={containerRef} className="relative h-full w-full" />;
}
