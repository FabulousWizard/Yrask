import streamlit as st
import folium
from streamlit_folium import st_folium

from data.loader import load_rmk, load_eelis
from data.zones import compute_buffer, to_wgs84, simplify_for_display

# ── Page config ────────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="Bark Beetle Danger Zones",
    page_icon="🌲",
    layout="wide",
)

st.title("🌲 Bark Beetle Danger Zone Map")
st.caption("Data source: Estonian Environmental Register (register.keskkonnaportaal.ee)")

# ── Load data (cached — reload only when app restarts or files change) ─────────
@st.cache_resource
def get_data():
    """Load both datasets once and keep in memory."""
    return load_rmk(), load_eelis()


def tooltip_for(gdf):
    """
    Build a GeoJsonTooltip using whichever species/date fields exist.
    RMK uses lnimi/vaatlus_kp; EELIS uses liik/vaatluse_kp.
    """
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


# ── Sidebar controls ───────────────────────────────────────────────────────────
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
    st.subheader("Layers")

    show_rmk = st.checkbox("🔴 Damage areas (RMK)", value=True)
    show_rmk_buffer = st.checkbox("🔴 Damage danger zone", value=True)
    show_eelis = st.checkbox("🟡 Sighting points (EELIS)", value=True)
    show_eelis_buffer = st.checkbox("🟡 Sighting danger zone", value=True)

    st.divider()
    st.caption(
        f"**RMK features:** {len(rmk_gdf)}  \n"
        f"**EELIS features:** {len(eelis_gdf)}"
    )

# ── Compute buffers ────────────────────────────────────────────────────────────

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

# ── Build Folium map ───────────────────────────────────────────────────────────
m = folium.Map(
    location=[58.7, 25.5],   # Centred on Estonia
    zoom_start=7,
    tiles="OpenStreetMap",
)

# — RMK damage buffer (drawn first so it sits below everything else)
if show_rmk_buffer and rmk_buffer_json is not None:
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
if show_eelis_buffer and eelis_buffer_json is not None:
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

# ── Render map ─────────────────────────────────────────────────────────────────
st_folium(m, use_container_width=True, height=680, returned_objects=[])