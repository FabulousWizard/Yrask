# Bark Beetle Danger Zone Map

Interactive web map showing bark beetle (*Ips typographus*) damage areas and sighting locations in Estonia, with configurable danger zone buffers.

---

## Setup

### 1. Install dependencies

```bash
pip install -r requirements.txt
```

### 2. Download the data

1. Go to [register.keskkonnaportaal.ee](https://register.keskkonnaportaal.ee/register)
2. Under **Kaardikihid → Mets**, find:
   - **Kooreürask (RMK)** — damage polygons → download as JSON → save as `data/rmk.json`
   - **Kooreürask (EELIS)** — sighting points → download as JSON → save as `data/eelis.json`

### 3. Run locally

```bash
streamlit run app.py
```

---

## Deploying to Streamlit Community Cloud (free)

1. Push this project to a **GitHub repository**
2. Go to [share.streamlit.io](https://share.streamlit.io) and sign in
3. Click **New app** → select your repo and `app.py`
4. Deploy — your forestry colleagues get a shareable URL

> **Note:** The `data/` folder with the JSON files must be committed to the repo.  
> When you download fresh data, replace the files and push to update the map.

---

## Project structure

```
bark_beetle_app/
├── app.py                  # Streamlit UI and Folium map
├── requirements.txt
├── data/
│   ├── loader.py           # Reads GeoJSON files, fixes CRS (L-EST97 → WGS84)
│   ├── zones.py            # Buffer generation (+ stubs for future hull/heatmap)
│   ├── rmk.json            # ← place downloaded RMK data here
│   └── eelis.json          # ← place downloaded EELIS data here
```

---

## Planned extensions

- **Phase 2 — File upload in UI:** Replace static `data/` files with an in-app uploader so forestry professionals can load fresh data without a redeploy.
- **Convex hull mode:** Wrap all damage clusters in a single bounding polygon.
- **Heatmap mode:** Density-based spread visualisation using `folium.plugins.HeatMap`.
- **Multi-species support:** Filter by `lnimi` field to compare species on the same map.
- **Date range filter:** Slider to show only features within a selected observation window.
