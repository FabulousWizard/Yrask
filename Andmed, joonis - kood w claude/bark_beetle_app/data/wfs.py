"""
WFS client for Estonian Forest Registry (metsaregister).
Fetches forest compartment (eraldis) data from GeoServer with spatial filtering.

Endpoint: https://gsavalik.envir.ee/geoserver/metsaregister/ows
Layer:    metsaregister:eraldis
Limit:    5000 features per request (server-enforced) — handled via paging
"""

import geopandas as gpd
import requests

WFS_URL = "https://gsavalik.envir.ee/geoserver/metsaregister/ows"
LAYER = "metsaregister:eraldis"
ESTONIAN_CRS = "EPSG:3301"
PAGE_SIZE = 5000
MAX_FEATURES = 15000  # Safety cap — raise if needed


def fetch_compartments_bbox(
    bbox_3301: tuple,
    max_features: int = MAX_FEATURES,
) -> gpd.GeoDataFrame:
    """
    Fetch forest compartments within a bounding box from WFS.

    Args:
        bbox_3301:    (minx, miny, maxx, maxy) in EPSG:3301
        max_features: safety cap on total features returned

    Returns:
        GeoDataFrame in EPSG:3301, or empty GeoDataFrame on failure
    """
    minx, miny, maxx, maxy = bbox_3301
    all_features = []
    start_index = 0

    while len(all_features) < max_features:
        remaining = max_features - len(all_features)
        count = min(PAGE_SIZE, remaining)

        params = {
            "service": "WFS",
            "version": "2.0.0",
            "request": "GetFeature",
            "typeName": LAYER,
            "outputFormat": "application/json",
            "srsName": ESTONIAN_CRS,
            "bbox": f"{minx},{miny},{maxx},{maxy},{ESTONIAN_CRS}",
            "count": count,
            "startIndex": start_index,
        }

        try:
            resp = requests.get(WFS_URL, params=params, timeout=120)
            resp.raise_for_status()
            data = resp.json()
        except requests.RequestException as e:
            raise ConnectionError(f"WFS request failed: {e}") from e

        features = data.get("features", [])
        if not features:
            break

        all_features.extend(features)

        if len(features) < count:
            break  # Last page

        start_index += len(features)

    if not all_features:
        return gpd.GeoDataFrame()

    fc = {"type": "FeatureCollection", "features": all_features}
    gdf = gpd.GeoDataFrame.from_features(fc)
    gdf = gdf.set_crs(ESTONIAN_CRS)
    return gdf


def fetch_compartments_in_zone(
    zone_gdf_3301: gpd.GeoDataFrame,
    max_features: int = MAX_FEATURES,
) -> gpd.GeoDataFrame:
    """
    Fetch compartments that intersect a danger zone:
      1. Bounding box filter (fast, server-side)
      2. Spatial intersection (precise, client-side)

    Args:
        zone_gdf_3301: danger zone geometry in EPSG:3301
        max_features:  safety cap

    Returns:
        GeoDataFrame of matching compartments in EPSG:3301
    """
    bbox = tuple(zone_gdf_3301.total_bounds)

    compartments = fetch_compartments_bbox(bbox, max_features)

    if compartments.empty:
        return compartments

    # Precise spatial filter against actual zone shape (not just bbox)
    zone_union = zone_gdf_3301.geometry.unary_union
    mask = compartments.intersects(zone_union)
    return compartments[mask].copy()