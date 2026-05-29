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

    # Simplify the merged geometry to keep GeoJSON small enough for browsers.
    # Tolerance is in CRS units (metres). Larger buffers can tolerate more
    # simplification without visible loss — a 50 km buffer simplified to 100 m
    # is visually identical but orders of magnitude fewer vertices.
    tolerance = max(50, radius_m * 0.005)  # 0.5% of radius, min 50 m
    buffered_union = buffered_union.simplify(tolerance, preserve_topology=True)

    result = gpd.GeoDataFrame(geometry=[buffered_union], crs=ESTONIAN_CRS)
    return result.to_crs(WGS84)


def simplify_for_display(gdf: gpd.GeoDataFrame, tolerance_m: float = 20) -> gpd.GeoDataFrame:
    """Simplify source polygons for lighter web display (keeps topology)."""
    gdf = gdf.copy()
    gdf["geometry"] = gdf.geometry.simplify(tolerance_m, preserve_topology=True)
    return gdf


def to_wgs84(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Reproject any GeoDataFrame to WGS84 for web map display."""
    return gdf.to_crs(WGS84)


def compute_merged_zone_3301(gdf_list: list, radius_km: float) -> gpd.GeoDataFrame:
    """
    Compute a merged danger zone from multiple GeoDataFrames in EPSG:3301.
    Used for spatial queries (WFS bbox) — stays in projected CRS.
    """
    radius_m = radius_km * 1000
    all_buffered = []
    for gdf in gdf_list:
        if gdf.crs is None or gdf.crs.to_epsg() != 3301:
            gdf = gdf.set_crs(ESTONIAN_CRS, allow_override=True)
        all_buffered.extend(list(gdf.geometry.buffer(radius_m)))
    merged = unary_union(all_buffered)
    return gpd.GeoDataFrame(geometry=[merged], crs=ESTONIAN_CRS)


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