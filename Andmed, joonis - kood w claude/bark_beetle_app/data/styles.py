"""
Visual style configuration for the Bark Beetle Danger Zone Map.

Change any value here and restart the app to see the effect.
All map element styles are controlled from this single file.

Color values: any CSS color string — hex (#e74c3c), named (red), rgb(255,0,0)
Opacity:      0.0 (invisible) to 1.0 (fully opaque)
Weight:       border thickness in pixels
Dash array:   stroke dash pattern, e.g. "6 4" = 6px dash, 4px gap. Use "" for solid.
"""

# ─── Danger index levels (compartment coloring) ──────────────────────────────
# Each level defines how compartments with that danger_index value appear.

DANGER_INDEX_STYLES = {
    2: {
        "fill_color":   "#e74c3c",   # red
        "fill_opacity": 0.55,
        "border_color": "#922b21",
        "border_weight": 0.8,
        "dash_array":   "",           # solid
    },
    1: {
        "fill_color":   "#f39c12",   # orange
        "fill_opacity": 0.35,
        "border_color": "#d68910",
        "border_weight": 0.5,
        "dash_array":   "",
    },
    0: {
        "fill_color":   "#27ae60",   # green
        "fill_opacity": 0.20,
        "border_color": "#1e8449",
        "border_weight": 0.5,
        "dash_array":   "",
    },
}

# ─── RMK damage areas (confirmed bark beetle damage polygons) ────────────────

RMK_STYLE = {
    "fill_color":   "#e74c3c",
    "fill_opacity": 0.55,
    "border_color": "#922b21",
    "border_weight": 1.0,
    "dash_array":   "",
}

# ─── EELIS sighting points (bark beetle observation locations) ───────────────

EELIS_STYLE = {
    "fill_color":   "#f1c40f",
    "fill_opacity": 0.9,
    "border_color": "#d68910",
    "border_weight": 1.5,
    "marker_radius": 6,              # circle marker size in pixels
}

# ─── Map defaults ────────────────────────────────────────────────────────────

MAP_DEFAULTS = {
    "center_lat":  58.7,
    "center_lon":  25.5,
    "zoom_start":  7,
    "tile_layer":  "OpenStreetMap",   # or "CartoDB positron", "CartoDB dark_matter"
}