#!/bin/sh
set -eu

DATA_DIR=/usr/share/nginx/html/data
UPDATER=/opt/update_weather_xml.py

mkdir -p "$DATA_DIR"

if [ ! -f "$DATA_DIR/weather.xml" ]; then
  cat > "$DATA_DIR/weather.xml" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<observations timestamp="0"/>
EOF
fi

# Proovi kohe kõige uuemat XML-i alla laadida, et brauser ei jääks bootstrap-faili peale.
python3 "$UPDATER" "$DATA_DIR/weather.xml" >/dev/null 2>&1 || true

(
  while true; do
    sleep 600
    python3 "$UPDATER" "$DATA_DIR/weather.xml" >/dev/null 2>&1 || true
  done
) &

exec nginx -g 'daemon off;'
