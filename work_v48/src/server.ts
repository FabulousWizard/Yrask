import "./lib/error-capture";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";


const WFS_URL = "https://gsavalik.envir.ee/geoserver/metsaregister/ows";
const SPRUCE_LAYER = "metsaregister:eraldis";
const SPRUCE_FIELDS = [
  "id",
  "katastri_nr",
  "kvartali_nr",
  "eraldise_nr",
  "pindala",
  "kasvukoht_kood",
  "peapuuliik_kood",
  "keskm_vanus",
  "arengukl_kood",
  "shape",
];

const RUNTIME_DATA_DIR = join(process.cwd(), ".yrask-runtime");
const OFFLINE_MARKERS_FILE = join(RUNTIME_DATA_DIR, "offline-markers.json");

type OfflineMarkerRecord = {
  id: string;
  lat: number;
  lng: number;
  createdAt: string;
  clientId: string;
  synced: boolean;
  syncedAt?: string | null;
};

async function readOfflineMarkerStore(): Promise<OfflineMarkerRecord[]> {
  try {
    const raw = await readFile(OFFLINE_MARKERS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeOfflineMarkerStore(markers: OfflineMarkerRecord[]) {
  await mkdir(RUNTIME_DATA_DIR, { recursive: true });
  await writeFile(OFFLINE_MARKERS_FILE, JSON.stringify(markers, null, 2), "utf8");
}

function normalizeOfflineMarker(marker: any): OfflineMarkerRecord | null {
  if (!marker || typeof marker !== "object") return null;
  const lat = Number(marker.lat);
  const lng = Number(marker.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const id = String(marker.id ?? "").trim();
  if (!id) return null;
  return {
    id,
    lat,
    lng,
    createdAt: String(marker.createdAt ?? new Date().toISOString()),
    clientId: String(marker.clientId ?? "unknown"),
    synced: Boolean(marker.synced),
    syncedAt: marker.syncedAt ? String(marker.syncedAt) : null,
  };
}

async function fetchOfflineMarks(request: Request) {
  if (request.method === "GET") {
    const markers = await readOfflineMarkerStore();
    return new Response(JSON.stringify({ markers }), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: {
        "content-type": "application/json; charset=utf-8",
        allow: "GET, POST",
      },
    });
  }

  const body = await request.json().catch(() => null);
  const incoming = Array.isArray(body?.markers) ? body.markers : [];
  const normalizedIncoming = incoming.map(normalizeOfflineMarker).filter(Boolean) as OfflineMarkerRecord[];
  if (!normalizedIncoming.length) {
    return new Response(JSON.stringify({ markers: await readOfflineMarkerStore() }), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }

  const store = await readOfflineMarkerStore();
  const byId = new Map(store.map((marker) => [marker.id, marker] as const));
  for (const marker of normalizedIncoming) {
    byId.set(marker.id, {
      ...marker,
      synced: true,
      syncedAt: marker.syncedAt ?? new Date().toISOString(),
    });
  }
  const markers = [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  await writeOfflineMarkerStore(markers);

  return new Response(JSON.stringify({ markers }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function numberParam(value: string | null) {
  if (!value) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function trimSpruceFeature(feature: any) {
  const p = feature?.properties ?? {};
  const properties: Record<string, unknown> = {};
  for (const key of SPRUCE_FIELDS) {
    if (key !== "shape" && p[key] !== undefined && p[key] !== null && p[key] !== "") properties[key] = p[key];
  }
  return {
    type: "Feature",
    geometry: feature.geometry,
    properties,
  };
}

async function fetchSpruceCompartments(request: Request) {
  const url = new URL(request.url);
  const rawBbox = url.searchParams.get("bbox")?.split(",").map((v) => numberParam(v.trim())) ?? [];
  if (rawBbox.length !== 4 || rawBbox.some((v) => v === null)) {
    return new Response(JSON.stringify({ error: "bbox query must be west,south,east,north" }), {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  const [west, south, east, north] = rawBbox as number[];
  const pageSize = 1000;
  const maxFeatures = Math.min(Math.max(numberParam(url.searchParams.get("max")) ?? 5000, 500), 8000);
  const features: any[] = [];
  let startIndex = 0;
  let truncated = false;

  while (features.length < maxFeatures) {
    const count = Math.min(pageSize, maxFeatures - features.length);
    const params = new URLSearchParams({
      service: "WFS",
      version: "2.0.0",
      request: "GetFeature",
      typeName: SPRUCE_LAYER,
      outputFormat: "application/json",
      srsName: "EPSG:4326",
      count: String(count),
      startIndex: String(startIndex),
      propertyName: SPRUCE_FIELDS.join(","),
      cql_filter: `BBOX(shape,${west},${south},${east},${north},'EPSG:4326') AND peapuuliik_kood='KU'`,
    });

    const response = await fetch(`${WFS_URL}?${params.toString()}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(45000),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return new Response(JSON.stringify({ error: `Metsaregistri WFS päring ebaõnnestus (${response.status})`, details: text.slice(0, 500) }), {
        status: 502,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }

    const data = await response.json();
    const batch = Array.isArray(data.features) ? data.features : [];
    features.push(...batch.map(trimSpruceFeature).filter((f: any) => f.geometry));
    if (batch.length < count) break;
    startIndex += batch.length;
  }

  if (features.length >= maxFeatures) truncated = true;

  return new Response(JSON.stringify({
    type: "FeatureCollection",
    features,
    properties: { source: "Metsaregister WFS", peapuuliik_kood: "KU", truncated },
  }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=900",
    },
  });
}


type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const url = new URL(request.url);
    if (url.pathname === "/api/spruce-compartments") return fetchSpruceCompartments(request);
    if (url.pathname === "/api/offline-marks") return fetchOfflineMarks(request);

    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
