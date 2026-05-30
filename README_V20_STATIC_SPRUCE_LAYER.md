# V20 staatiline kuusemetsa kiht

See versioon kasutab kasutaja saadetud `eraldis_ku.json` faili, mitte WFS-i päringut.

Töötlemisel jäeti alles ainult veebirakenduse jaoks vajalikud KU ehk kuuseeraldiste väljad:

- id
- katastri_nr
- kvartali_nr
- eraldise_nr
- pindala
- kasvukoht_kood
- peapuuliik_kood
- keskm_vanus
- arengukl_kood
- geomeetria

Algne andmestik oli EPSG:3301 koordinaatsüsteemis. Veebikaardi jaoks teisendati geomeetria EPSG:4326 ehk WGS84 koordinaatidesse.

Kuuseeraldised on jagatud tükkideks:

- `public/data/spruce_index.json`
- `public/data/spruce_chunks/*.geojson`

Rakendus laeb nähtavas kaardivaates olevad tükid järk-järgult. See hoiab ära olukorra, kus brauser peaks korraga laadima ühe väga suure GeoJSON faili.
