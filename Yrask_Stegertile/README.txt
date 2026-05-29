Proxy fix for day/month/season weather modes

What changed:
- app.js now uses /api instead of https://publicapi.envir.ee
- nginx.conf proxies /api/ to https://publicapi.envir.ee/

After replacing these files:
docker compose down
docker compose build --no-cache
docker compose up -d
