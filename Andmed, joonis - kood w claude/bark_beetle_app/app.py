import streamlit as st
import folium
from streamlit_folium import st_folium

from data.loader import load_rmk, load_eelis
from data.zones import compute_buffer, to_wgs84

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
# Buffers are recomputed whenever the slider changes (fast with Shapely)
rmk_buffer = compute_buffer(rmk_gdf, radius_km) if show_rmk_buffer else None
eelis_buffer = compute_buffer(eelis_gdf, radius_km) if show_eelis_buffer else None

# Reproject source data to WGS84 for display
rmk_display = to_wgs84(rmk_gdf)
eelis_display = to_wgs84(eelis_gdf)

# ── Build Folium map ───────────────────────────────────────────────────────────
m = folium.Map(
    location=[58.7, 25.5],   # Centred on Estonia
    zoom_start=7,
    tiles="OpenStreetMap",
)

# — RMK damage buffer (drawn first so it sits below everything else)
if show_rmk_buffer and rmk_buffer is not None:
    folium.GeoJson(
        rmk_buffer.to_json(),
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
if show_eelis_buffer and eelis_buffer is not None:
    folium.GeoJson(
        eelis_buffer.to_json(),
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
        rmk_display.to_json(),
        name="Damage areas (RMK)",
        style_function=lambda _: {
            "fillColor": "#e74c3c",
            "color": "#922b21",
            "weight": 1,
            "fillOpacity": 0.55,
        },
        tooltip=folium.GeoJsonTooltip(
            fields=["lnimi", "vaatlus_kp"],
            aliases=["Species", "Observed"],
            localize=True,
        ),
    ).add_to(m)

# — EELIS sighting points
if show_eelis:
    folium.GeoJson(
        eelis_display.to_json(),
        name="Sighting points (EELIS)",
        marker=folium.CircleMarker(
            radius=6,
            color="#d68910",
            fill=True,
            fill_color="#f1c40f",
            fill_opacity=0.9,
            weight=1.5,
        ),
        tooltip=folium.GeoJsonTooltip(
            fields=["lnimi", "vaatlus_kp"],
            aliases=["Species", "Observed"],
            localize=True,
        ),
    ).add_to(m)

folium.LayerControl(collapsed=False).add_to(m)

# ── Render map ─────────────────────────────────────────────────────────────────
st_folium(m, use_container_width=True, height=680, returned_objects=[])
