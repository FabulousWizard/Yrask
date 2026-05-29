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
    req = urllib.request.Request(url, headers={"Accept": "application/xml,text/xml,*/*"})
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
