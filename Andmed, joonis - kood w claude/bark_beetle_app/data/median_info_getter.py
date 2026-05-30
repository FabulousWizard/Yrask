from pathlib import Path
import json

import fiona
import numpy as np
import rasterio
from rasterio.features import geometry_window, geometry_mask

# This script calculates the median raster value for each polygon in a GeoJSON file.
# Used to get the meadian NDVI value for each plot in the bark beetle app.
# The results are saved to a JSON file with the plot ID as the key and the median value as the value.

def polygon_medians(raster_path, geojson_path, id_field="id", all_touched=False):
    results = {}

    raster_path = Path(raster_path)
    geojson_path = Path(geojson_path)

    if not raster_path.exists():
        raise FileNotFoundError(f"Raster file not found: {raster_path.resolve()}")

    if not geojson_path.exists():
        raise FileNotFoundError(f"GeoJSON file not found: {geojson_path.resolve()}")

    with rasterio.open(raster_path) as src, fiona.open(geojson_path) as layer:
        scale = src.scales[0] if src.scales and src.scales[0] not in (None, 0) else 1.0

        for feature in layer:
            geom = feature["geometry"]
            plot_id = feature["properties"][id_field]

            try:
                window = geometry_window(src, [geom], pad_x=0, pad_y=0)
            except ValueError:
                results[plot_id] = None
                continue

            data = src.read(1, window=window, masked=True)
            transform = src.window_transform(window)

            inside = geometry_mask(
                [geom],
                transform=transform,
                out_shape=data.shape,
                invert=True,
                all_touched=all_touched
            )

            values = data[inside]

            if values.size == 0:
                results[plot_id] = None
            else:
                median_raw = np.median(values.compressed())
                results[plot_id] = float(median_raw * scale)

    return results


def save_medians_to_json(medians, output_path):
    output_path = Path(output_path)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(medians, f, indent=2, ensure_ascii=False)


if __name__ == "__main__":
    base_dir = Path(__file__).resolve().parent

    raster_file = base_dir / "est_s2_ndvi_median_2025-06-01_2025-08-31_cog.tif"
    geojson_file = base_dir / "eraldis_ku.json"
    output_file = base_dir / "plot_medians_summmer2025.json"

    print("Raster exists:", raster_file.exists(), raster_file)
    print("GeoJSON exists:", geojson_file.exists(), geojson_file)

    medians = polygon_medians(
        raster_path=raster_file,
        geojson_path=geojson_file,
        id_field="id",
        all_touched=False
    )

    save_medians_to_json(medians, output_file)

    print(f"Saved {len(medians)} plot medians to {output_file}")