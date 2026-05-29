import geopandas as gpd
from pathlib import Path

DATA_DIR = Path(__file__).parent
ESTONIAN_CRS = "EPSG:3301"  # L-EST97 — used by Estonian environmental datasets


def _is_projected(gdf: gpd.GeoDataFrame) -> bool:
    """
    Detect whether coordinates are in L-EST97 rather than WGS84.
    L-EST97 x-values are in the ~300k–700k range — impossible in WGS84 longitude.
    """
    bounds = gdf.total_bounds  # [minx, miny, maxx, maxy]
    return bounds[0] > 180 or bounds[2] > 180


def _load(path: Path) -> gpd.GeoDataFrame:
    """
    Load a GeoJSON file and ensure CRS is correctly set to L-EST97.
    Estonian open data is often saved with L-EST97 coordinates but no CRS
    header, or with an incorrect WGS84 declaration. We detect and fix this.
    """
    if not path.exists():
        raise FileNotFoundError(
            f"Data file not found: {path}\n"
            "Download the dataset from register.keskkonnaportaal.ee and place it in the data/ folder."
        )

    gdf = gpd.read_file(path)

    if gdf.empty:
        raise ValueError(f"File loaded but contains no features: {path}")

    if _is_projected(gdf):
        # Coordinates are clearly not WGS84 — force L-EST97
        gdf = gdf.set_crs(ESTONIAN_CRS, allow_override=True)
    elif gdf.crs is None:
        gdf = gdf.set_crs(ESTONIAN_CRS)

    return gdf


def load_rmk() -> gpd.GeoDataFrame:
    """Load RMK bark beetle damage polygons (MultiPolygon)."""
    return _load(DATA_DIR / "rmk.json")


def load_eelis() -> gpd.GeoDataFrame:
    """Load EELIS bark beetle sighting points (Point)."""
    return _load(DATA_DIR / "eelis.json")
