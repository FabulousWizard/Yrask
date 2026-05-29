XML-põhine ilmalahendus

Kuidas see töötab:
- entrypoint.sh proovib enne Nginxi käivitamist alla laadida Ilmateenistuse XML-i
- sama skript uuendab XML-faili iga 10 minuti järel
- brauser ei suhtle API-ga otse, vaid loeb ainult kohalikku /data/weather.xml faili
- app.js parsib XML-ist temperatuur, tuule kiiruse ja tuule suuna ning koondab need maakondade kaupa

Failid:
- index.html
- style.css
- app.js
- Dockerfile
- docker-compose.yml
- nginx.conf
- entrypoint.sh
- update_weather_xml.py
- data/weather.xml

Käivitus:
docker compose up --build

Ava:
http://localhost:8080
