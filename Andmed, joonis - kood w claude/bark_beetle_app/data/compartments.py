"""
Local forest compartment data loader.

Loads pre-downloaded eraldis GeoJSON files and auto-converts them to
GeoParquet for much faster subsequent loads (~10x speedup).

Danger index:
    If data/danger_index.csv exists, it is joined to compartments by 'id'.
    If it doesn't exist, dummy values are computed for testing:
        2 = KU in prime spruce site types (JK, JM, SL)
        1 = KU in other site types
        0 = non-spruce

    The CSV format is simply:  id,danger_index
    An external programme can overwrite this file to update scores.

Place downloaded files in the data/ folder:
    eraldis_ku.json   — spruce compartments (peapuuliik_kood='KU')
    eraldis_ma.json   — pine compartments   (peapuuliik_kood='MA')
    danger_index.csv  — external danger scores (optional)
"""

import geopandas as gpd
import pandas as pd
from pathlib import Path

DATA_DIR = Path(__file__).parent
ESTONIAN_CRS = "EPSG:3301"

# Columns we actually need — drop the rest to save memory
KEEP_COLUMNS = [
    "geometry", "id", "katastri_nr", "kvartali_nr", "eraldise_nr",
    "pindala", "kasvukoht_kood", "peapuuliik_kood", "omandivorm_kood",
    "korgus", "boniteedi_kood", "arengukl_kood", "keskm_vanus",
    "keskm_raievanus", "juurdekasv", "tagavara_1_ha",
]

# Site types where spruce dominates — highest risk for Ips typographus
PRIME_SPRUCE_SITES = {"JK", "JM", "SL"}


def _load_and_cache(json_path: Path) -> gpd.GeoDataFrame:
    """
    Load a GeoJSON file. On first load, convert to GeoParquet for speed.
    Subsequent loads use the Parquet file directly (~10x faster).
    """
    parquet_path = json_path.with_suffix(".parquet")

    if parquet_path.exists():
        gdf = gpd.read_parquet(parquet_path)
    elif json_path.exists():
        print(f"First load of {json_path.name} — converting to Parquet for faster future loads...")
        gdf = gpd.read_file(json_path)

        if gdf.crs is None:
            gdf = gdf.set_crs(ESTONIAN_CRS)
        elif gdf.crs.to_epsg() != 3301:
            bounds = gdf.total_bounds
            if bounds[0] > 180:
                gdf = gdf.set_crs(ESTONIAN_CRS, allow_override=True)

        available = [c for c in KEEP_COLUMNS if c in gdf.columns]
        gdf = gdf[available].copy()

        try:
            gdf.to_parquet(parquet_path)
            print(f"Saved {parquet_path.name} ({parquet_path.stat().st_size / 1e6:.0f} MB)")
        except Exception as e:
            print(f"Warning: could not save Parquet cache: {e}")
    else:
        raise FileNotFoundError(
            f"Compartment data not found: {json_path}\n"
            "Download from the WFS and place in the data/ folder."
        )

    return gdf


def _compute_dummy_danger_index(gdf: gpd.GeoDataFrame) -> pd.Series:
    """
    Compute placeholder danger index for testing.
    Real values should come from data/danger_index.csv.

    Logic:
        2 = KU in prime spruce sites (JK, JM, SL)
        1 = KU in other site types
        0 = everything else
    """
    index = pd.Series(0, index=gdf.index, dtype=int)

    is_spruce = gdf["peapuuliik_kood"] == "KU"
    is_prime_site = gdf["kasvukoht_kood"].isin(PRIME_SPRUCE_SITES)

    index[is_spruce] = 1
    index[is_spruce & is_prime_site] = 2

    return index


def _apply_danger_index(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """
    Join danger_index to compartments.
    Uses data/danger_index.csv if it exists, otherwise computes dummy values.
    """
    csv_path = DATA_DIR / "danger_index.csv"

    if csv_path.exists():
        scores = pd.read_csv(csv_path)
        if "id" in scores.columns and "danger_index" in scores.columns:
            gdf = gdf.merge(
                scores[["id", "danger_index"]],
                on="id",
                how="left",
            )
            gdf["danger_index"] = gdf["danger_index"].fillna(0).astype(int)
            print(f"Loaded danger index from {csv_path.name} ({len(scores)} scores)")
        else:
            print(f"Warning: {csv_path.name} missing 'id' or 'danger_index' columns, using dummy values")
            gdf["danger_index"] = _compute_dummy_danger_index(gdf)
    else:
        print("No danger_index.csv found — using dummy values for testing")
        gdf["danger_index"] = _compute_dummy_danger_index(gdf)

    return gdf


def load_compartments_ku() -> gpd.GeoDataFrame:
    """Load spruce (KU) compartments."""
    return _load_and_cache(DATA_DIR / "eraldis_ku.json")


def load_compartments_ma() -> gpd.GeoDataFrame:
    """Load pine (MA) compartments."""
    return _load_and_cache(DATA_DIR / "eraldis_ma.json")


def load_all_compartments() -> gpd.GeoDataFrame:
    """
    Load all available compartment files, merge, and apply danger index.
    """
    parts = []

    for loader in [load_compartments_ku, load_compartments_ma]:
        try:
            parts.append(loader())
        except FileNotFoundError:
            continue

    if not parts:
        raise FileNotFoundError(
            "No compartment data files found in data/ folder.\n"
            "Download at least eraldis_ku.json (spruce) from the WFS."
        )

    merged = pd.concat(parts, ignore_index=True)

    if "id" in merged.columns:
        merged = merged.drop_duplicates(subset="id")

    gdf = gpd.GeoDataFrame(merged, geometry="geometry", crs=ESTONIAN_CRS)

    # Apply danger index (from CSV or dummy)
    gdf = _apply_danger_index(gdf)

    return gdf


def filter_compartments_in_zone(
    compartments: gpd.GeoDataFrame,
    zone_3301: gpd.GeoDataFrame,
) -> gpd.GeoDataFrame:
    """
    Spatially filter compartments to only those intersecting the danger zone.
    """
    zone_union = zone_3301.geometry.unary_union
    mask = compartments.sindex.query(zone_union, predicate="intersects")
    candidates = compartments.iloc[mask]
    precise_mask = candidates.intersects(zone_union)
    return candidates[precise_mask].copy()