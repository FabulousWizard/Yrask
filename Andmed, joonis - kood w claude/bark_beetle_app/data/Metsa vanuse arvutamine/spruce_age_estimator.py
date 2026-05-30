#!/usr/bin/env python3
"""
spruce_age_local.py
===================
Estimates the age of Norway spruce (Picea abies) stands from locally
stored nDSM GeoTIFF rasters + forest compartment polygons.

This replaces the WCS-based approach (spruce_age_estimator.py) with a
fully offline pipeline that processes 344 000+ polygons in minutes
rather than hours.

Growth model: Chapman-Richards differential equation (Kiviste 1997)
─────────────────────────────────────────────────────────────────────
    H(t) = H_inf * (1 - exp(-b * t))^c

Inverted for age:
    t(H) = -ln(1 - (H / H_inf)^(1/c)) / b

Source: Kiviste, A. 1997. An algebraic difference model for the forest
growth simulation in Estonia.  EPMÜ teadustööde kogumik 189, 63-75.

Pipeline
────────
  1. Discover all nDSM 5 m GeoTIFF files in a folder
  2. Build a GDAL Virtual Raster (VRT) mosaic  (zero extra disk)
  3. Run rasterstats zonal statistics on all polygons at once
  4. Apply Kiviste inverse model → estimated age per polygon
  5. Write output GeoJSON

Usage
─────
    pip install geopandas rasterstats rasterio numpy pyproj

    python spruce_age_local.py ^
        --rasters  C:/data/ndsm_5m/          ^
        --input    spruce_compartments.geojson ^
        --output   spruce_ages.geojson

    # If your rasters are already merged into one file or VRT:
    python spruce_age_local.py ^
        --rasters  C:/data/ndsm_5m_eesti.vrt  ^
        --input    spruce_compartments.geojson ^
        --output   spruce_ages.geojson
"""

import sys
import os
import glob
import math
import time
import logging
from pathlib import Path

import numpy as np
import geopandas as gpd
import rasterio
from rasterstats import zonal_stats

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────────────────────
# 1.  GROWTH MODEL  (Kiviste 1997, Chapman-Richards for Norway spruce)
# ──────────────────────────────────────────────────────────────────────────────

SPRUCE_B = 0.0395   # intrinsic growth-rate parameter (yr⁻¹)
SPRUCE_C = 1.3160   # shape parameter (dimensionless)

MIN_CANOPY_HEIGHT_M = 2.0   # below this the nDSM is unreliable


def height_to_age(H: float, H_inf: float,
                  b: float = SPRUCE_B, c: float = SPRUCE_C) -> float:
    """
    Invert  H(t) = H_inf · (1 − exp(−b·t))^c  to estimate stand age.

        t = −ln(1 − (H / H_inf)^(1/c)) / b

    Returns NaN for invalid inputs, caps at 200 yr when H ≥ H_inf.
    """
    if H <= 0 or H_inf <= 0:
        return float("nan")
    ratio = H / H_inf
    if ratio >= 1.0:
        return 200.0
    inner = 1.0 - ratio ** (1.0 / c)
    if inner <= 0:
        return float("nan")
    return -math.log(inner) / b


def age_to_height(t: float, H_inf: float,
                  b: float = SPRUCE_B, c: float = SPRUCE_C) -> float:
    """Forward model: predict height at age t (for validation)."""
    return H_inf * (1.0 - math.exp(-b * t)) ** c


# ──────────────────────────────────────────────────────────────────────────────
# 2.  SITE-TYPE TABLE  (kasvukohatüüp → H_inf)
# ──────────────────────────────────────────────────────────────────────────────

SITE_TYPE_PARAMS: dict[str, dict] = {
    # Very productive (boniteet Ia)
    "N":   {"H_inf": 36.0, "group": "Ia",   "name": "Naadi"},
    "S":   {"H_inf": 36.0, "group": "Ia",   "name": "Sõnajala"},
    "OS":  {"H_inf": 36.0, "group": "Ia",   "name": "Okasmulla-sõnajala"},
    # Productive (boniteet I)
    "SL":  {"H_inf": 34.0, "group": "I",    "name": "Sinilille"},
    "JK":  {"H_inf": 34.0, "group": "I",    "name": "Jänesekapsa"},
    "LS":  {"H_inf": 34.0, "group": "I",    "name": "Lõhnav sõnajalg"},
    # Moderately productive (I-II)
    "JM":  {"H_inf": 32.0, "group": "I-II",  "name": "Jänesekapsa-mustika"},
    "A":   {"H_inf": 32.0, "group": "I-II",  "name": "Angervaksa"},
    "OA":  {"H_inf": 32.0, "group": "I-II",  "name": "Okasmulla-angervaksa"},
    # Medium (II-III)
    "M":   {"H_inf": 28.0, "group": "II",   "name": "Mustika"},
    "JL":  {"H_inf": 28.0, "group": "II",   "name": "Jänesekapsa-lodu"},
    # Lower productivity (III-IV)
    "P":   {"H_inf": 24.0, "group": "III",  "name": "Pohla"},
    "PM":  {"H_inf": 24.0, "group": "III",  "name": "Pohla-mustika"},
    "KS":  {"H_inf": 22.0, "group": "III",  "name": "Kõdusoo"},
    "SK":  {"H_inf": 22.0, "group": "III",  "name": "Siirdesoo-kõdusoo"},
    # Low productivity (IV-V)
    "SI":  {"H_inf": 20.0, "group": "IV",   "name": "Sinika"},
    "RP":  {"H_inf": 20.0, "group": "IV",   "name": "Rabapõõsastik"},
    "LL":  {"H_inf": 18.0, "group": "V",    "name": "Leesikaloo"},
    "KL":  {"H_inf": 18.0, "group": "V",    "name": "Kastikuloo"},
    # Peat / drained bog
    "SS":  {"H_inf": 24.0, "group": "III",  "name": "Siirdesoo"},
    "RS":  {"H_inf": 18.0, "group": "IV",   "name": "Rabastunud siirdesoo"},
    "RB":  {"H_inf": 16.0, "group": "V",    "name": "Raba"},
}

_DEFAULT_PARAMS = {"H_inf": 28.0, "group": "unknown", "name": "unknown"}


def get_site_params(code: str) -> dict:
    if not code or str(code).lower() in ("none", "nan", ""):
        return _DEFAULT_PARAMS
    return SITE_TYPE_PARAMS.get(str(code).strip().upper(), _DEFAULT_PARAMS)


# ──────────────────────────────────────────────────────────────────────────────
# 3.  VRT BUILDER
# ──────────────────────────────────────────────────────────────────────────────

TIFF_PATTERNS = ["*.tif", "*.tiff", "*.TIF", "*.TIFF"]


def resolve_raster_input(path: str) -> str:
    """
    Resolve the --rasters argument to a single raster path usable by
    rasterstats.  If path is a directory, build a VRT from all GeoTIFFs
    inside it.  If it's already a .vrt or .tif file, return it as-is.
    """
    p = Path(path)

    # ── Single file (VRT or TIF) ──────────────────────────────────────────
    if p.is_file():
        log.info("Using raster file directly: %s", p)
        return str(p)

    # ── Directory → discover TIFFs and build VRT ─────────────────────────
    if not p.is_dir():
        log.error("Raster path does not exist: %s", p)
        sys.exit(1)

    tif_files = []
    for pattern in TIFF_PATTERNS:
        tif_files.extend(glob.glob(str(p / "**" / pattern), recursive=True))
    tif_files = sorted(set(tif_files))

    if not tif_files:
        log.error("No GeoTIFF files found in: %s", p)
        sys.exit(1)

    log.info("Found %d GeoTIFF files in %s", len(tif_files), p)

    vrt_path = p / "ndsm_mosaic.vrt"
    log.info("Building VRT mosaic: %s", vrt_path)

    # ── Try osgeo.gdal (bundled with many rasterio installs) ─────────────
    try:
        from osgeo import gdal
        gdal.UseExceptions()
        vrt_ds = gdal.BuildVRT(str(vrt_path), tif_files)
        vrt_ds.FlushCache()
        vrt_ds = None
        log.info("  VRT built via osgeo.gdal.BuildVRT")
    except ImportError:
        # ── Fallback: write VRT XML by hand from rasterio metadata ───────
        log.info("  osgeo.gdal not available — writing VRT XML manually")
        _build_vrt_manual(tif_files, vrt_path)

    # Quick sanity check
    with rasterio.open(str(vrt_path)) as ds:
        log.info(
            "  VRT: %d x %d px, CRS=%s, res=%.1f m",
            ds.width, ds.height, ds.crs, ds.res[0],
        )

    return str(vrt_path)


def _build_vrt_manual(tif_files: list[str], vrt_path: Path) -> None:
    """
    Write a minimal GDAL VRT XML file by reading each GeoTIFF's metadata
    with rasterio.  No external GDAL CLI or osgeo bindings required.
    """
    # Collect metadata from all tiles
    tile_infos = []
    for tf in tif_files:
        with rasterio.open(tf) as ds:
            tile_infos.append({
                "path": os.path.abspath(tf),
                "width": ds.width,
                "height": ds.height,
                "transform": ds.transform,
                "crs": ds.crs.to_wkt(),
                "dtype": ds.dtypes[0],
                "nodata": ds.nodata,
            })

    if not tile_infos:
        raise ValueError("No valid tiles found")

    # Compute global extent
    x_min = min(t["transform"].c for t in tile_infos)
    y_max = max(t["transform"].f for t in tile_infos)
    x_max = max(t["transform"].c + t["transform"].a * t["width"] for t in tile_infos)
    y_min = min(t["transform"].f + t["transform"].e * t["height"] for t in tile_infos)

    # Use resolution from first tile
    res_x = tile_infos[0]["transform"].a
    res_y = tile_infos[0]["transform"].e  # negative

    total_w = int(round((x_max - x_min) / res_x))
    total_h = int(round((y_min - y_max) / res_y))  # res_y is negative

    dtype = tile_infos[0]["dtype"]
    nodata = tile_infos[0]["nodata"]
    crs_wkt = tile_infos[0]["crs"]

    # Build XML
    nodata_attr = f'<NoDataValue>{nodata}</NoDataValue>' if nodata is not None else ''
    sources = []
    for t in tile_infos:
        # Pixel offset of this tile within the global grid
        dst_x = int(round((t["transform"].c - x_min) / res_x))
        dst_y = int(round((t["transform"].f - y_max) / res_y))
        sources.append(
            f'    <SimpleSource>\n'
            f'      <SourceFilename relativeToVRT="0">{t["path"]}</SourceFilename>\n'
            f'      <SourceBand>1</SourceBand>\n'
            f'      <SourceProperties RasterXSize="{t["width"]}" RasterYSize="{t["height"]}" '
            f'DataType="{dtype.capitalize()}" BlockXSize="{min(t["width"], 256)}" '
            f'BlockYSize="{min(t["height"], 256)}" />\n'
            f'      <SrcRect xOff="0" yOff="0" xSize="{t["width"]}" ySize="{t["height"]}" />\n'
            f'      <DstRect xOff="{dst_x}" yOff="{dst_y}" xSize="{t["width"]}" ySize="{t["height"]}" />\n'
            f'    </SimpleSource>'
        )

    vrt_xml = (
        f'<VRTDataset rasterXSize="{total_w}" rasterYSize="{total_h}">\n'
        f'  <SRS>{crs_wkt}</SRS>\n'
        f'  <GeoTransform>{x_min}, {res_x}, 0.0, {y_max}, 0.0, {res_y}</GeoTransform>\n'
        f'  <VRTRasterBand dataType="{dtype.capitalize()}" band="1">\n'
        f'    {nodata_attr}\n'
        + "\n".join(sources) + "\n"
        f'  </VRTRasterBand>\n'
        f'</VRTDataset>\n'
    )

    with open(vrt_path, "w") as f:
        f.write(vrt_xml)


# ──────────────────────────────────────────────────────────────────────────────
# 4.  FIELD-NAME DETECTION
# ──────────────────────────────────────────────────────────────────────────────

_KKT_CANDIDATES = [
    "kasvukohatyup", "kasvukohatyyp", "kktyup", "kkt",
    "site_type", "sitetype", "kasvukohatuup", "kkt_kood",
]
_SPECIES_CANDIDATES = [
    "peapuuliik", "species", "dominant_species", "puuliik",
]


def detect_field(columns: list[str], candidates: list[str]) -> str | None:
    col_lower = {c.lower(): c for c in columns}
    for c in candidates:
        if c.lower() in col_lower:
            return col_lower[c.lower()]
    return None


# ──────────────────────────────────────────────────────────────────────────────
# 5.  MAIN PIPELINE
# ──────────────────────────────────────────────────────────────────────────────

def process(
    raster_path: str,
    input_path: str,
    output_path: str,
    kkt_field: str | None = None,
    species_field: str | None = None,
    batch_size: int = 50_000,
) -> None:
    # ── Resolve raster ────────────────────────────────────────────────────
    raster_file = resolve_raster_input(raster_path)

    # Check raster CRS
    with rasterio.open(raster_file) as ds:
        raster_crs = ds.crs
        raster_nodata = ds.nodata
    log.info("Raster CRS: %s,  nodata: %s", raster_crs, raster_nodata)

    # ── Load polygons ─────────────────────────────────────────────────────
    log.info("Loading input: %s", input_path)
    gdf = gpd.read_file(input_path)
    log.info("  %d features, CRS: %s", len(gdf), gdf.crs)

    # Reproject polygons to match raster CRS
    if gdf.crs and gdf.crs != raster_crs:
        log.info("  Reprojecting polygons to %s ...", raster_crs)
        gdf = gdf.to_crs(raster_crs)

    # ── Detect attribute fields ───────────────────────────────────────────
    cols = list(gdf.columns)
    if kkt_field is None:
        kkt_field = detect_field(cols, _KKT_CANDIDATES)
    if kkt_field:
        log.info("  Site type field: '%s'", kkt_field)
    else:
        log.warning("  No kasvukohatüüp field found — using default H_inf=28 m")

    sp_field = species_field or detect_field(cols, _SPECIES_CANDIDATES)
    if sp_field:
        log.info("  Species field: '%s'", sp_field)

    # ── Look up site params for every row (vectorised) ────────────────────
    log.info("Looking up H_inf per site type ...")
    if kkt_field:
        site_info = gdf[kkt_field].apply(lambda x: get_site_params(str(x) if x else ""))
    else:
        site_info = gdf.iloc[:, 0].apply(lambda _: _DEFAULT_PARAMS)

    gdf["kkt_code"]   = site_info.apply(lambda s: s.get("name", ""))
    gdf["H_inf_m"]    = site_info.apply(lambda s: s["H_inf"])
    gdf["site_group"] = site_info.apply(lambda s: s["group"])

    # ── Species flag ──────────────────────────────────────────────────────
    if sp_field:
        gdf["_is_spruce"] = gdf[sp_field].apply(
            lambda x: str(x).strip().upper() in ("KU", "KUUSK", "PICEA", "PA")
        )
    else:
        gdf["_is_spruce"] = True

    # ── Zonal statistics — the fast part ──────────────────────────────────
    total = len(gdf)
    log.info("Running zonal statistics on %d polygons (batch_size=%d) ...", total, batch_size)
    t0 = time.time()

    all_stats = []
    for start in range(0, total, batch_size):
        end = min(start + batch_size, total)
        batch = gdf.iloc[start:end]
        log.info("  batch %d–%d / %d ...", start + 1, end, total)

        stats = zonal_stats(
            batch.geometry,
            raster_file,
            stats=["mean", "percentile_80", "count"],
            nodata=raster_nodata,
            all_touched=False,
        )
        all_stats.extend(stats)

    elapsed = time.time() - t0
    log.info("  Zonal stats done in %.1f s  (%.0f polygons/s)", elapsed, total / elapsed)

    # ── Unpack stats into columns ─────────────────────────────────────────
    gdf["ndsm_mean_m"]  = [s["mean"] for s in all_stats]
    gdf["ndsm_p80_m"]   = [s["percentile_80"] for s in all_stats]
    gdf["ndsm_pixels"]  = [s["count"] if s["count"] else 0 for s in all_stats]

    # ── Filter: only pixels >= MIN_CANOPY_HEIGHT_M ────────────────────────
    # The bulk zonal_stats doesn't support per-pixel filtering by value,
    # so if mean < MIN_CANOPY_HEIGHT_M the stand is likely too young / bare.
    # We flag these rather than discarding them.

    # ── Estimate age (vectorised) ─────────────────────────────────────────
    log.info("Applying Kiviste 1997 age model ...")

    def _safe_age(row):
        h = row["ndsm_p80_m"]
        h_inf = row["H_inf_m"]
        if h is None or math.isnan(h) or h < MIN_CANOPY_HEIGHT_M:
            return None
        return round(height_to_age(h, h_inf), 1)

    def _safe_age_mean(row):
        h = row["ndsm_mean_m"]
        h_inf = row["H_inf_m"]
        if h is None or math.isnan(h) or h < MIN_CANOPY_HEIGHT_M:
            return None
        return round(height_to_age(h, h_inf), 1)

    gdf["est_age_p80_yr"]  = gdf.apply(_safe_age, axis=1)
    gdf["est_age_mean_yr"] = gdf.apply(_safe_age_mean, axis=1)

    # ── Quality flag ──────────────────────────────────────────────────────
    def _flag(row):
        if not row["_is_spruce"]:
            return "NOT_SPRUCE"
        if row["ndsm_pixels"] == 0 or row["ndsm_mean_m"] is None:
            return "NO_DATA"
        if row["ndsm_pixels"] < 5:
            return "LOW_PIXELS"
        if row["ndsm_mean_m"] >= row["H_inf_m"]:
            return "HEIGHT_EXCEEDS_HINF"
        if row["ndsm_mean_m"] < MIN_CANOPY_HEIGHT_M:
            return "TOO_SHORT"
        return "OK"

    gdf["quality_flag"] = gdf.apply(_flag, axis=1)

    # ── Clean up internal columns ─────────────────────────────────────────
    gdf.drop(columns=["_is_spruce"], inplace=True)

    # ── Round height columns ──────────────────────────────────────────────
    gdf["ndsm_mean_m"] = gdf["ndsm_mean_m"].round(2)
    gdf["ndsm_p80_m"]  = gdf["ndsm_p80_m"].round(2)

    # ── Write output ──────────────────────────────────────────────────────
    log.info("Writing output: %s", output_path)
    gdf.to_file(output_path, driver="GeoJSON")
    log.info("Done.  %d features written.", len(gdf))

    # ── Summary stats ─────────────────────────────────────────────────────
    for flag, count in gdf["quality_flag"].value_counts().items():
        log.info("  %s: %d", flag, count)

    ok = gdf[gdf["quality_flag"] == "OK"]
    if len(ok) > 0:
        ages = ok["est_age_p80_yr"].dropna()
        log.info(
            "Age summary (p80, OK only): min=%.0f  median=%.0f  mean=%.0f  max=%.0f yr",
            ages.min(), ages.median(), ages.mean(), ages.max(),
        )


# ──────────────────────────────────────────────────────────────────────────────
# 6.  CONFIGURATION — edit these if needed, or leave as-is for auto-discovery
# ──────────────────────────────────────────────────────────────────────────────

# All paths are relative to the folder this script lives in.
# Set to None to auto-discover (finds .tif and .geojson files automatically).

RASTER_PATH = None          # e.g. "."  or  "chm_tiles"  or  "ndsm_mosaic.vrt"
INPUT_GEOJSON = "eraldis_ku.json"        # e.g. "spruce_compartments.geojson"
OUTPUT_GEOJSON = "spruce_ages.geojson"


if __name__ == "__main__":
    # ── Resolve script directory ──────────────────────────────────────────
    SCRIPT_DIR = Path(__file__).resolve().parent
    os.chdir(SCRIPT_DIR)
    log.info("Working directory: %s", SCRIPT_DIR)

    # ── Auto-discover raster path ─────────────────────────────────────────
    raster_path = RASTER_PATH
    if raster_path is None:
        # Look for .tif files in the script directory
        tifs = list(SCRIPT_DIR.glob("*.tif")) + list(SCRIPT_DIR.glob("*.TIF"))
        vrts = list(SCRIPT_DIR.glob("*.vrt"))
        if vrts:
            raster_path = str(vrts[0])
            log.info("Found existing VRT: %s", raster_path)
        elif tifs:
            raster_path = str(SCRIPT_DIR)
            log.info("Found %d .tif files in script folder", len(tifs))
        else:
            log.error(
                "No .tif or .vrt files found in %s\n"
                "  Put your CHM/nDSM GeoTIFF files in the same folder as this script,\n"
                "  or set RASTER_PATH at the top of the file.",
                SCRIPT_DIR,
            )
            sys.exit(1)

    # ── Auto-discover input GeoJSON ───────────────────────────────────────
    input_geojson = INPUT_GEOJSON
    if input_geojson is None:
        geojsons = list(SCRIPT_DIR.glob("*.geojson"))
        if len(geojsons) == 1:
            input_geojson = str(geojsons[0])
            log.info("Found input GeoJSON: %s", geojsons[0].name)
        elif len(geojsons) > 1:
            # Pick the one that isn't the output
            candidates = [g for g in geojsons if g.name != OUTPUT_GEOJSON]
            if len(candidates) == 1:
                input_geojson = str(candidates[0])
                log.info("Found input GeoJSON: %s", candidates[0].name)
            else:
                log.error(
                    "Multiple .geojson files found: %s\n"
                    "  Set INPUT_GEOJSON at the top of the file to pick one.",
                    [g.name for g in geojsons],
                )
                sys.exit(1)
        else:
            log.error(
                "No .geojson file found in %s\n"
                "  Put your input GeoJSON in the same folder as this script,\n"
                "  or set INPUT_GEOJSON at the top of the file.",
                SCRIPT_DIR,
            )
            sys.exit(1)

    # ── Run ───────────────────────────────────────────────────────────────
    output_geojson = str(SCRIPT_DIR / OUTPUT_GEOJSON)

    process(
        raster_path=raster_path,
        input_path=input_geojson,
        output_path=output_geojson,
    )