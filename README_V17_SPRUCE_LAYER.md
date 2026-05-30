# v17 muudatus: kuusemetsa eraldised

Uuest `andmed.zip` failist leitud vajalik info:

- `bark_beetle_app/data/compartments.py` kirjeldas vajalikke metsaeraldiste välju ja KU ehk kuuse filtrit.
- `bark_beetle_app/data/wfs.py` andis Metsaregistri WFS teenuse aadressi ja kihi nime:
  - `https://gsavalik.envir.ee/geoserver/metsaregister/ows`
  - `metsaregister:eraldis`
  - filter `peapuuliik_kood='KU'`

ZIP-is ei olnud kaasas valmis kuuseeraldiste GeoJSON/Parquet faili (`eraldis_ku.json` puudus). Seetõttu ei kopeeritud projekti suuri ebavajalikke andmeid ega backup-faile. Rakendus pärib kuuseeraldised Dockeris jooksvalt Metsaregistri WFS-ist ainult nähtava kaardiala kohta ja küsib ainult vajalikud väljad.

Värviloogika:

- RMK kolle: punane polügon.
- Levikuala: hele oranžikas ala.
- Kuusemetsa eraldis levikualas: tumedam oranžikas-punane.
- Kuusemetsa eraldis levikualast väljas: hall.

Märkus: kuusemetsa kiht vajab Docker-konteineris internetiühendust, sest lähte-ZIP ei sisaldanud päris kuuseeraldiste andmefaili.
