const map = L.map("map").setView([58.75, 25.0], 8);

const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "© OpenStreetMap contributors"
}).addTo(map);

// Prototüübi jaoks lihtne näidiskiht.
// Hiljem saab selle asendada Maa- ja Ruumiameti WMS/WMTS kihiga.
const orthoDemo = L.tileLayer("https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "© OpenStreetMap contributors"
});

let currentBase = osm;

const markers = L.layerGroup([
  L.marker([59.437, 24.753]).bindPopup("Tallinn"),
  L.marker([58.378, 26.729]).bindPopup("Tartu"),
  L.marker([58.385, 24.497]).bindPopup("Pärnu")
]).addTo(map);

const parcels = L.layerGroup([
  L.polygon([
    [58.38, 26.72],
    [58.39, 26.72],
    [58.39, 26.75],
    [58.38, 26.75]
  ]).bindPopup("Näidis-katastriüksus")
]);

const forest = L.layerGroup([
  L.circle([58.7, 25.4], {
    radius: 12000
  }).bindPopup("Näidis metsainfo ala")
]);

document.getElementById("closeSidebar").addEventListener("click", () => {
  document.getElementById("sidebar").classList.add("closed");
});

document.getElementById("openSidebar").addEventListener("click", () => {
  document.getElementById("sidebar").classList.remove("closed");
});

document.getElementById("layerMarkers").addEventListener("change", event => {
  toggleLayer(event.target.checked, markers);
});

document.getElementById("layerParcels").addEventListener("change", event => {
  toggleLayer(event.target.checked, parcels);
});

document.getElementById("layerForest").addEventListener("change", event => {
  toggleLayer(event.target.checked, forest);
});

function toggleLayer(isChecked, layer) {
  if (isChecked) {
    layer.addTo(map);
  } else {
    map.removeLayer(layer);
  }
}

document.querySelectorAll(".basemap-btn").forEach(button => {
  button.addEventListener("click", () => {
    map.removeLayer(currentBase);

    if (button.dataset.map === "osm") {
      currentBase = osm;
    } else {
      currentBase = orthoDemo;
    }

    currentBase.addTo(map);
  });
});

map.on("click", event => {
  const lat = event.latlng.lat.toFixed(6);
  const lng = event.latlng.lng.toFixed(6);

  document.getElementById("coords").textContent =
    `Koordinaadid: ${lat}, ${lng}`;

  document.getElementById("infoBox").textContent =
    `Valitud punkt: ${lat}, ${lng}`;
});

document.getElementById("searchBtn").addEventListener("click", () => {
  const query = document.getElementById("searchInput").value.trim().toLowerCase();

  const places = {
    "tallinn": [59.437, 24.753],
    "tartu": [58.378, 26.729],
    "pärnu": [58.385, 24.497],
    "parnu": [58.385, 24.497]
  };

  if (places[query]) {
    map.setView(places[query], 13);
  } else {
    alert("Prototüübis on otsingus näiteks: Tallinn, Tartu, Pärnu");
  }
});

document.getElementById("measureBtn").addEventListener("click", () => {
  alert("Mõõtmise tööriista saab lisada järgmises etapis Leaflet.draw või Leaflet-measure pluginaga.");
});