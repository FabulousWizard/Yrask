import streamlit as st
import folium
from streamlit_folium import st_folium

from data.loader import load_rmk, load_eelis
from data.zones import to_wgs84, simplify_for_display
from data.compartments import load_all_compartments

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
    """Load bug datasets once and keep in memory."""
    return load_rmk(), load_eelis()

@st.cache_resource
def get_compartments():
    """Load all available compartment files (one-time, cached)."""
    return load_all_compartments()


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
    st.error(f"Failed to load bug data: {e}")
    st.stop()

try:
    all_compartments = get_compartments()
    compartments_available = True
except FileNotFoundError as e:
    st.warning(str(e))
    compartments_available = False
except Exception as e:
    st.warning(f"Error loading compartments: {e}")
    compartments_available = False


# ── Sidebar controls ──────────────────────────────────────────────────────────
with st.sidebar:
    st.header("⚙️ Map Controls")

    st.subheader("Bug Data Layers")
    show_rmk = st.checkbox("🔴 Damage areas (RMK)", value=True)
    show_eelis = st.checkbox("🟡 Sighting points (EELIS)", value=True)

    if compartments_available:
        st.divider()
        st.subheader("Forest Compartments")

        show_compartments = st.checkbox("🌲 Show spruce compartments", value=True)

        min_danger = 1
        if show_compartments:
            min_danger = st.slider(
                "Minimum danger index",
                min_value=0,
                max_value=2,
                value=1,
                step=1,
                help="Only show compartments at or above this danger level (0–2)",
            )

            st.caption("**Danger index:**")
            st.caption("🔴 2 — High (spruce in prime sites)")
            st.caption("🟠 1 — Medium (spruce in other sites)")
            st.caption("⚪ 0 — Low (not shown by default)")
    else:
        show_compartments = False
        min_danger = 1

    st.divider()
    st.caption(
        f"**RMK features:** {len(rmk_gdf)}  \n"
        f"**EELIS features:** {len(eelis_gdf)}"
    )
    if compartments_available:
        st.caption(f"**Compartments loaded:** {len(all_compartments)}")


# ── Prepare display data ─────────────────────────────────────────────────────

@st.cache_data
def get_display_json(_gdf, label):
    """Simplify + reproject source data and return GeoJSON string."""
    simplified = simplify_for_display(_gdf)
    return to_wgs84(simplified).to_json()

@st.cache_data
def get_compartments_json(_gdf, min_danger_index):
    """Filter by danger index, simplify, and convert for display."""
    filtered = _gdf[_gdf["danger_index"] >= min_danger_index]
    if filtered.empty:
        return "", 0
    simplified = simplify_for_display(filtered, tolerance_m=50)
    display = to_wgs84(simplified)
    return display.to_json(), len(display)

with st.spinner("Preparing map data..."):
    rmk_display_json = get_display_json(rmk_gdf, "rmk")
    eelis_display_json = get_display_json(eelis_gdf, "eelis")

compartments_json = ""
compartments_count = 0

if show_compartments and compartments_available:
    try:
        with st.spinner(f"Filtering compartments (danger index ≥ {min_danger})..."):
            compartments_json, compartments_count = get_compartments_json(
                all_compartments, min_danger
            )
        if compartments_count > 0:
            st.sidebar.caption(f"**Compartments shown:** {compartments_count}")
        else:
            st.info("No compartments match the current danger index filter.")
    except Exception as e:
        st.warning(f"Error preparing compartments: {e}")


# ── Build Folium map ──────────────────────────────────────────────────────────

m = folium.Map(
    location=[58.7, 25.5],
    zoom_start=7,
    tiles="OpenStreetMap",
)

# — Forest compartments (drawn first so they sit below bug data)
if show_compartments and compartments_json:

    # Color by danger index
    DANGER_COLORS = {
        2: {"fillColor": "#e74c3c", "fillOpacity": 0.55},  # red — high
        1: {"fillColor": "#f39c12", "fillOpacity": 0.35},  # orange — medium
        0: {"fillColor": "#27ae60", "fillOpacity": 0.20},  # green — low
    }

    def compartment_style(feature):
        danger = feature["properties"].get("danger_index", 0)
        style = DANGER_COLORS.get(danger, DANGER_COLORS[0])
        return {
            "fillColor": style["fillColor"],
            "color": "#555555",
            "weight": 0.5,
            "fillOpacity": style["fillOpacity"],
        }

    comp_tooltip_fields = [
        "danger_index", "peapuuliik_kood", "kasvukoht_kood",
        "keskm_vanus", "pindala", "katastri_nr", "arengukl_kood",
    ]
    comp_tooltip_aliases = [
        "Danger index", "Main species", "Site type",
        "Age (years)", "Area (ha)", "Cadastral No.", "Dev. class",
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