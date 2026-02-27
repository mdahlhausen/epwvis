#!/usr/bin/env python3
"""
Scrape climate.onebuilding.org for all TMYx.2009-2023 EPW zip files
and produce data/stations.js for the epwvis location search feature.

Example URL resolved by this script:
  https://climate.onebuilding.org/WMO_Region_4_North_and_Central_America/
    USA_United_States_of_America/CO_Colorado/
    USA_CO_Denver-Centennial.AP.724666_TMYx.2009-2023.zip

Run:   python build_station_index.py
Output: data/stations.js  (commit this file alongside index.html)
"""
import json, re, sys, time, warnings
import requests
from bs4 import BeautifulSoup
from pathlib import Path
from urllib.parse import urljoin

warnings.filterwarnings("ignore")   # suppress SSL self-signed cert warning

BASE = "https://climate.onebuilding.org"

# All seven WMO region folder names on the site
REGIONS = [
    "WMO_Region_1_Africa",
    "WMO_Region_2_Asia",
    "WMO_Region_3_South_America",
    "WMO_Region_4_North_and_Central_America",
    "WMO_Region_5_Southwest_Pacific",
    "WMO_Region_6_Europe",
    "WMO_Region_7_Antarctica",
]

SESSION = requests.Session()
SESSION.headers["User-Agent"] = "epwvis-station-indexer/1.0"
SESSION.verify = False


def get(url, retries=3):
    for attempt in range(retries):
        try:
            r = SESSION.get(url, timeout=30)
            r.raise_for_status()
            return r
        except Exception as e:
            if attempt == retries - 1:
                print(f"  WARN: failed {url} — {e}", file=sys.stderr)
                return None
            time.sleep(2)


def friendly_name(filename):
    """
    Turn  USA_CO_Denver-Centennial.AP.724666_TMYx.2009-2023.zip
    into  Denver-Centennial AP (CO, USA)
    """
    stem = re.sub(r'_TMYx\.\d{4}-\d{4}\.zip$', '', filename)
    stem = re.sub(r'\.zip$', '', stem)
    parts = stem.split("_", 2)
    if len(parts) < 3:
        return stem.replace(".", " ")
    country, state, city_raw = parts
    city = city_raw.replace(".", " ")
    # strip trailing 5-7 digit WMO station id
    city = re.sub(r'\s+\w{5,7}\s*$', '', city).strip()
    return f"{city} ({state}, {country})"


def scrape_country_page(country_index_url):
    """
    Fetch a country index page (e.g. .../USA_United_States_of_America/index.html)
    and return [{name, url, file}, …] for every TMYx.2009-2023 zip found.

    Links on the page look like:
      CO_Colorado/USA_CO_Denver-Centennial.AP.724666_TMYx.2009-2023.zip
    which resolve relative to the index.html URL into the full path.
    """
    r = get(country_index_url)
    if not r:
        return []
    soup = BeautifulSoup(r.text, "html.parser")
    stations = []
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if "TMYx.2009-2023" not in href or not href.endswith(".zip"):
            continue
        # urljoin handles relative paths correctly from the index.html base
        full_url = urljoin(country_index_url, href)
        filename = full_url.split("/")[-1]
        # Compact form: strip base URL + common suffix to reduce file size
        path_stem = full_url[len("https://climate.onebuilding.org/"):]
        path_stem = path_stem.removesuffix("_TMYx.2009-2023.zip")
        stations.append({
            "n": friendly_name(filename),
            "u": path_stem,
        })
    return stations


def discover_country_pages(region_name):
    """
    Fetch /REGION/ index and return list of country index.html URLs.
    Country folder links look like: USA_United_States_of_America/index.html
    """
    region_url = f"{BASE}/{region_name}/"
    r = get(region_url)
    if not r:
        return []
    soup = BeautifulSoup(r.text, "html.parser")
    seen, urls = set(), []
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if not href or href in (".", "./", "#", "../", "/"):
            continue
        # Skip links that point back up to region or root level
        if href.startswith("..") or href.startswith("/WMO") or href.startswith("http"):
            continue
        # Country folders match  XXX_Country_Name/  or  XXX_Country_Name/index.html
        if re.match(r'^[A-Z]{3}_.+', href):
            full = urljoin(region_url, href)
            if not full.endswith("index.html"):
                full = full.rstrip("/") + "/index.html"
            if full not in seen:
                seen.add(full)
                urls.append(full)
    return urls


def scrape_all():
    all_stations = []

    for region_name in REGIONS:
        print(f"\n=== {region_name} ===")
        country_pages = discover_country_pages(region_name)
        print(f"  {len(country_pages)} country pages found")

        for c_url in country_pages:
            label = c_url.split("/")[-2]   # e.g. USA_United_States_of_America
            stations = scrape_country_page(c_url)
            if stations:
                print(f"  {label}: {len(stations)} stations")
            all_stations.extend(stations)
            time.sleep(0.1)   # polite crawl delay

    # Deduplicate by URL then sort alphabetically
    seen, unique = set(), []
    for s in all_stations:
        if s["u"] not in seen:
            seen.add(s["u"])
            unique.append(s)
    unique.sort(key=lambda x: x["n"].lower())
    return unique


if __name__ == "__main__":
    stations = scrape_all()
    print(f"\nTotal unique TMYx.2009-2023 stations: {len(stations)}")

    out = json.dumps(stations, ensure_ascii=False, separators=(",", ":"))

    # Write as a JS file so it can be loaded via <script> tag
    # without needing an HTTP server (works with file:// URLs too)
    dest_js = Path("data/stations.js")
    dest_js.parent.mkdir(exist_ok=True)
    dest_js.write_text("var ONE_BUILDING_EPW_STATIONS = " + out + ";", encoding="utf-8")
    print(f"Written \u2192 {dest_js}  ({dest_js.stat().st_size // 1024} KB)")
    print("Done. Commit data/stations.js to your repository.")
