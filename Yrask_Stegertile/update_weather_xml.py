#!/usr/bin/env python3
from __future__ import annotations

import os
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET

URL = "https://www.ilmateenistus.ee/ilma_andmed/xml/observations.php"
DEFAULT_OUT = "/usr/share/nginx/html/data/weather.xml"
TIMEOUT = 8


def load_xml(url: str) -> bytes:
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
        "Accept": "application/xml,text/xml,*/*;q=0.8",
        "Accept-Language": "et-EE,et;q=0.9,en;q=0.8",
        "Referer": "https://www.ilmateenistus.ee/teenused/ilmainfo/eesti-vaatlusandmed-xml/",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
    }
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=TIMEOUT) as response:
        raw = response.read()
    # Kontrollime, et XML on parsitav, enne kui kirjutame selle kettale.
    ET.fromstring(raw)
    return raw


def main() -> int:
    out_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_OUT
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    try:
        raw = load_xml(URL)
        tmp_path = out_path + ".tmp"
        with open(tmp_path, "wb") as fh:
            fh.write(raw)
        os.replace(tmp_path, out_path)
        return 0
    except Exception as exc:
        # Olemasolevat XML-i ei kustutata, kui värske päring ebaõnnestub.
        sys.stderr.write(f"weather xml update failed: {exc}\n")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())