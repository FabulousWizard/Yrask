import streamlit as st
import folium
from streamlit_folium import st_folium

from data.loader import load_rmk, load_eelis
from data.zones import (
    compute_buffer, to_wgs84, simplify_for_display, compute_merged_zone_3301,
)
from data.wfs import fetch_compartments_in_zone
from data.risk import get_risk_style, RISK_CONFIG

# ── Page config ────────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="Bark Beetle Danger Zones",
    page_icon="🌲",
    layout="wide",
)

st.title("🌲 Bark Beetle Danger Zone Map")
st.caption("Data source: Estonian Environmental Register (register.keskkonnaportaal.ee)")

# ── Load data (cached) ────────────────────────────────────────────────────────
@st.cache_resource
def get_data():
    """Load both datasets once and keep in memory."""
    return load_rmk(), load_eelis()


def tooltip_for(gdf):
    """Build a GeoJsonTooltip using whichever species/date fields exist."""
    cols = list(gdf.columns)
    fields, aliases = [], []
    species_field = next((c for c in ("lnimi", "liik") if c in cols), None)
    date_field = next((c for c in ("vaatlus_kp", "vaatluse_kp") if c in cols), None)
    if species_field:
        fields.append(species_field)
        aliases.append("Species")
    if date_field:
        fields.append(date_field)
        aliases.append("Observed")
    if not fields:
        return None
    return folium.GeoJsonTooltip(fields=fields, aliases=aliases, localize=True)


try:
    rmk_gdf, eelis_gdf = get_data()
except FileNotFoundError as e:
    st.error(str(e))
    st.stop()
except Exception as e:
    st.error(f"Failed to load data: {e}")
    st.stop()


# ── Sidebar controls ──────────────────────────────────────────────────────────
with st.sidebar:
    st.header("⚙️ Map Controls")

    radius_km = st.slider(
        "Danger zone radius (km)",
        min_value=1,
        max_value=50,
        value=10,
        step=1,
        help="Buffer drawn around both damage polygons and sighting points",
    )

    st.divider()
    st.subheader("Bug Data Layers")

    show_rmk = st.checkbox("🔴 Damage areas (RMK)", value=True)
    show_rmk_buffer = st.checkbox("🔴 Damage danger zone", value=True)
    show_eelis = st.checkbox("🟡 Sighting points (EELIS)", value=True)
    show_eelis_buffer = st.checkbox("🟡 Sighting danger zone", value=True)

    st.divider()
    st.subheader("Forest Compartments")

    show_compartments = st.checkbox(
        "🌲 Show forest compartments in danger zone",
        value=False,
        help="Fetches compartment data from the Forest Registry (WFS)",
    )

    color_mode = "spruce_dominant"
    if show_compartments:
        color_mode_label = st.radio(
            "Color coding",
            ["Spruce-dominant", "Full vulnerability gradient"],
            horizontal=True,
        )
        color_mode = "spruce_dominant" if color_mode_label == "Spruce-dominant" else "gradient"

        # Legend
        st.caption("**Legend:**")
        config = RISK_CONFIG[color_mode]
        for level in config["levels"]:
            label = level["label"]
            if "High" in label:
                icon = "🔴"
            elif "Medium" in label:
                icon = "🟠"
            else:
                icon = "🟢"
            st.caption(f"{icon} {label}")

    st.divider()
    st.caption(
        f"**RMK features:** {len(rmk_gdf)}  \n"
        f"**EELIS features:** {len(eelis_gdf)}"
    )


# ── Compute buffers ───────────────────────────────────────────────────────────

@st.cache_data
def get_buffer_json(_gdf, radius_km, label):
    """Compute buffer and return GeoJSON string (cached by radius + label)."""
    return compute_buffer(_gdf, radius_km).to_json()

@st.cache_data
def get_display_json(_gdf, label):
    """Simplify + reproject source data and return GeoJSON string (cached)."""
    simplified = simplify_for_display(_gdf)
    return to_wgs84(simplified).to_json()

with st.spinner("Computing danger zones..."):
    rmk_buffer_json = get_buffer_json(rmk_gdf, radius_km, "rmk") if show_rmk_buffer else None
    eelis_buffer_json = get_buffer_json(eelis_gdf, radius_km, "eelis") if show_eelis_buffer else None
    rmk_display_json = get_display_json(rmk_gdf, "rmk")
    eelis_display_json = get_display_json(eelis_gdf, "eelis")


# ── Fetch forest compartments (WFS) ──────────────────────────────────────────

@st.cache_data(ttl=600, show_spinner=False)
def fetch_compartments_cached(_rmk_gdf, _eelis_gdf, radius_km):
    """
    Fetch compartments from WFS within the merged danger zone.
    Cached by radius (source data is fixed during a session).
    Returns (geojson_string, feature_count).
    """
    zone_3301 = compute_merged_zone_3301([_rmk_gdf, _eelis_gdf], radius_km)
    compartments = fetch_compartments_in_zone(zone_3301)

    if compartments.empty:
        return "", 0

    simplified = simplify_for_display(compartments, tolerance_m=15)
    display = to_wgs84(simplified)
    return display.to_json(), len(display)


compartments_json = ""
compartments_count = 0

if show_compartments:
    try:
        with st.spinner("Fetching forest compartments from WFS..."):
            compartments_json, compartments_count = fetch_compartments_cached(
                rmk_gdf, eelis_gdf, radius_km
            )
        if compartments_count > 0:
            st.sidebar.caption(f"**Compartments loaded:** {compartments_count}")
        else:
            st.info("No forest compartments found within the danger zone.")
    except ConnectionError as e:
        st.warning(f"Could not reach the Forest Registry WFS: {e}")
    except Exception as e:
        st.warning(f"Error fetching compartments: {e}")


# ── Build Folium map ──────────────────────────────────────────────────────────

m = folium.Map(
    location=[58.7, 25.5],   # Centred on Estonia
    zoom_start=7,
    tiles="OpenStreetMap",
)

# — RMK damage buffer (drawn first so it sits below everything else)
if show_rmk_buffer and rmk_buffer_json:
    folium.GeoJson(
        rmk_buffer_json,
        name=f"Damage danger zone ({radius_km} km)",
        style_function=lambda _: {
            "fillColor": "#e74c3c",
            "color": "#c0392b",
            "weight": 1.5,
            "fillOpacity": 0.12,
            "dashArray": "6 4",
        },
    ).add_to(m)

# — EELIS sighting buffer
if show_eelis_buffer and eelis_buffer_json:
    folium.GeoJson(
        eelis_buffer_json,
        name=f"Sighting danger zone ({radius_km} km)",
        style_function=lambda _: {
            "fillColor": "#f39c12",
            "color": "#d68910",
            "weight": 1.5,
            "fillOpacity": 0.12,
            "dashArray": "6 4",
        },
    ).add_to(m)

# — Forest compartments (color-coded by risk)
if show_compartments and compartments_json:
    current_mode = color_mode  # capture for closure

    def compartment_style(feature, _mode=current_mode):
        species = feature["properties"].get("peapuuliik_kood", "")
        risk = get_risk_style(species, _mode)
        return {
            "fillColor": risk["color"],
            "color": "#555555",
            "weight": 0.5,
            "fillOpacity": risk["fill_opacity"],
        }

    # Build tooltip with available fields
    comp_tooltip_fields = [
        "peapuuliik_kood", "keskm_vanus", "pindala",
        "katastri_nr", "kasvukoht_kood", "arengukl_kood",
    ]
    comp_tooltip_aliases = [
        "Main species", "Age (years)", "Area (ha)",
        "Cadastral No.", "Site type", "Dev. class",
    ]

    folium.GeoJson(
        compartments_json,
        name="Forest compartments",
        style_function=compartment_style,
        tooltip=folium.GeoJsonTooltip(
            fields=comp_tooltip_fields,
            aliases=comp_tooltip_aliases,
            localize=True,
        ),
    ).add_to(m)

# — RMK damage polygons
if show_rmk:
    folium.GeoJson(
        rmk_display_json,
        name="Damage areas (RMK)",
        style_function=lambda _: {
            "fillColor": "#e74c3c",
            "color": "#922b21",
            "weight": 1,
            "fillOpacity": 0.55,
        },
        tooltip=tooltip_for(rmk_gdf),
    ).add_to(m)

# — EELIS sighting points
if show_eelis:
    folium.GeoJson(
        eelis_display_json,
        name="Sighting points (EELIS)",
        marker=folium.CircleMarker(
            radius=6,
            color="#d68910",
            fill=True,
            fill_color="#f1c40f",
            fill_opacity=0.9,
            weight=1.5,
        ),
        tooltip=tooltip_for(eelis_gdf),
    ).add_to(m)

folium.LayerControl(collapsed=False).add_to(m)

# ── Render map ────────────────────────────────────────────────────────────────
st_folium(m, use_container_width=True, height=680, returned_objects=[])