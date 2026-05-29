import geopandas as gpd
from shapely.ops import unary_union

ESTONIAN_CRS = "EPSG:3301"  # metres — safe for distance calculations
WGS84 = "EPSG:4326"         # required for web map display


def compute_buffer(gdf: gpd.GeoDataFrame, radius_km: float) -> gpd.GeoDataFrame:
    """
    Generate a merged danger perimeter buffer around all features.

    Buffering is done in L-EST97 (unit = metres) for accurate distances,
    then reprojected to WGS84 for display. Overlapping buffers are dissolved
    into a single geometry so the map overlay looks clean.

    Args:
        gdf:       GeoDataFrame in EPSG:3301
        radius_km: Buffer radius in kilometres

    Returns:
        Single-row GeoDataFrame with merged buffer polygon in WGS84
    """
    radius_m = radius_km * 1000

    # Ensure we're working in the projected CRS
    if gdf.crs is None or gdf.crs.to_epsg() != 3301:
        gdf = gdf.set_crs(ESTONIAN_CRS, allow_override=True)

    buffered_union = unary_union(gdf.geometry.buffer(radius_m))
    result = gpd.GeoDataFrame(geometry=[buffered_union], crs=ESTONIAN_CRS)
    return result.to_crs(WGS84)


def to_wgs84(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Reproject any GeoDataFrame to WGS84 for web map display."""
    return gdf.to_crs(WGS84)


# ── Future extensions ──────────────────────────────────────────────────────────
# def compute_convex_hull(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
#     """Wrap all features in a convex hull polygon."""
#     hull = unary_union(gdf.geometry).convex_hull
#     result = gpd.GeoDataFrame(geometry=[hull], crs=gdf.crs)
#     return result.to_crs(WGS84)
#
# def compute_heatmap_data(gdf: gpd.GeoDataFrame) -> list[tuple[float, float]]:
#     """Return (lat, lon) centroid list for use with folium.plugins.HeatMap."""
#     centroids = gdf.to_crs(WGS84).geometry.centroid
#     return [(pt.y, pt.x) for pt in centroids]
