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
MAX_FEATURES = 50000  # Safety cap — raise if needed


def fetch_compartments_bbox(
    bbox_3301: tuple,
    max_features: int = MAX_FEATURES,
    species_filter: list[str] | None = None,
) -> tuple[gpd.GeoDataFrame, bool]:
    """
    Fetch forest compartments within a bounding box from WFS.

    Args:
        bbox_3301:      (minx, miny, maxx, maxy) in EPSG:3301
        max_features:   safety cap on total features returned
        species_filter: if set, only fetch these peapuuliik_kood values (CQL filter)

    Returns:
        (GeoDataFrame in EPSG:3301, was_truncated)
    """
    minx, miny, maxx, maxy = bbox_3301
    all_features = []
    start_index = 0
    total_available = None
    was_truncated = False

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
            "count": count,
            "startIndex": start_index,
        }

        # GeoServer can't combine bbox param + cql_filter param in WFS 2.0.0.
        # When species_filter is set, merge both into a single cql_filter.
        bbox_cql = f"BBOX(shape,{minx},{miny},{maxx},{maxy},'EPSG:3301')"

        if species_filter:
            if len(species_filter) == 1:
                species_cql = f"peapuuliik_kood='{species_filter[0]}'"
            else:
                codes = ",".join(f"'{s}'" for s in species_filter)
                species_cql = f"peapuuliik_kood IN ({codes})"
            params["cql_filter"] = f"{bbox_cql} AND {species_cql}"
        else:
            # No species filter — bbox alone works fine as a standard param
            params["bbox"] = f"{minx},{miny},{maxx},{maxy},{ESTONIAN_CRS}"

        try:
            resp = requests.get(WFS_URL, params=params, timeout=120)
            resp.raise_for_status()
            data = resp.json()
        except requests.RequestException as e:
            raise ConnectionError(f"WFS request failed: {e}") from e

        # Track total available from server
        if total_available is None:
            total_available = data.get("numberMatched", None)

        features = data.get("features", [])
        if not features:
            break

        all_features.extend(features)

        if len(features) < count:
            break  # Last page

        start_index += len(features)

    # Check if we hit the cap before getting everything
    if total_available and len(all_features) < total_available:
        was_truncated = True

    if not all_features:
        return gpd.GeoDataFrame(), False

    fc = {"type": "FeatureCollection", "features": all_features}
    gdf = gpd.GeoDataFrame.from_features(fc)
    gdf = gdf.set_crs(ESTONIAN_CRS)
    return gdf, was_truncated


def fetch_compartments_in_zone(
    zone_gdf_3301: gpd.GeoDataFrame,
    max_features: int = MAX_FEATURES,
    species_filter: list[str] | None = None,
) -> tuple[gpd.GeoDataFrame, bool]:
    """
    Fetch compartments that intersect a danger zone:
      1. Bounding box + optional species CQL filter (fast, server-side)
      2. Spatial intersection (precise, client-side)

    Returns:
        (GeoDataFrame of matching compartments in EPSG:3301, was_truncated)
    """
    bbox = tuple(zone_gdf_3301.total_bounds)

    compartments, was_truncated = fetch_compartments_bbox(bbox, max_features, species_filter)

    if compartments.empty:
        return compartments, was_truncated

    # Precise spatial filter against actual zone shape (not just bbox)
    zone_union = zone_gdf_3301.geometry.unary_union
    mask = compartments.intersects(zone_union)
    return compartments[mask].copy(), was_truncated