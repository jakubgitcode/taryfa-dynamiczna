"""
Skrypt do pobierania danych godzinowych TGE RDN.

Użycie:
    python pobierz_dane.py <miesiąc> [rok] [--pomin-braki]

Przykłady:
    python pobierz_dane.py 12 2025      # grudzień 2025
    python pobierz_dane.py 1            # styczeń bieżącego roku

Kolumna `date` w CSV to data DOSTAWY. Strona tge.pl przyjmuje w `date_start` datę sesji
(obrotu), a pokazuje ceny dla dostawy następnego dnia — dla dnia dostawy D pytamy o D-1.

Źródło zależy od dnia dostawy (wybierane automatycznie):
    do 2025-09-30              stara strona RDN, tabela Fixing I (data dostawy z nagłówka jest sprawdzana)
    2025-10-01 .. 2025-11-17   raporty xlsx z katalogu archiwum/ (strona nie ma dla nich cen godzinowych)
    od 2025-11-18              strona „TGeBase i średnioważone ceny godzinowe”

Dni późniejsze niż dzisiaj są pomijane. Plik wynikowy jest zapisywany dopiero po pobraniu
wszystkich dni — przy błędzie poprzednia wersja pliku zostaje nietknięta.

--pomin-braki  pomija dni, dla których źródło nie ma notowań, zamiast przerywać. Potrzebne tylko
               dla dostawy 2025-09-30, której tge.pl nie pokazuje już w żadnej tabeli godzinowej.
"""
import csv
import os
import re
import sys
import time
import calendar
from datetime import date, timedelta

import requests
from lxml import html

from konwertuj_excel import parse_excel_file

# URL dla nowego formatu (dostawy od 2025-11-18)
URL_NEW = "https://tge.pl/energia-elektryczna-rdn-tge-base?date_start={d}&iframe=1"
# URL dla starego formatu (dostawy do 2025-09-30)
URL_OLD = "https://tge.pl/energia-elektryczna-rdn?date_start={d}"

LAST_OLD_DELIVERY = date(2025, 9, 30)
FIRST_NEW_DELIVERY = date(2025, 11, 18)
ARCHIWUM_DIR = "archiwum"
PAUSE_S = 0.5
RETRIES = 3

http = requests.Session()
http.headers["User-Agent"] = "taryfa-dynamiczna/1.0 (python-requests)"


def pl_number_to_float(s: str) -> float | None:
    s = s.strip()
    if s == "-" or s == "":
        return None
    # "3 759,20" -> 3759.20
    s = s.replace("\xa0", "").replace(" ", "").replace(",", ".")
    return float(s)


def get(url: str) -> requests.Response:
    for attempt in range(1, RETRIES + 1):
        try:
            r = http.get(url, timeout=30)
            r.raise_for_status()
            return r
        except requests.RequestException as e:
            if attempt == RETRIES:
                raise
            print(f"  błąd ({e}), ponawiam za {5 * attempt} s")
            time.sleep(5 * attempt)


class BrakDanych(RuntimeError):
    """Źródło nie ma notowań dla tego dnia."""


def fetch_day(delivery: date, url_template: str, check_header: bool):
    session = delivery - timedelta(days=1)
    url = url_template.format(d=session.isoformat())
    print(f"Fetching: {delivery} <- {url}")
    r = get(url)

    tree = html.fromstring(r.content)

    if check_header:
        # Stara strona podaje datę dostawy, np. "Kontrakty godzinowe dla dostawy w dniu 11-06-2025"
        m = re.search(r"dostawy w dniu (\d{2})-(\d{2})-(\d{4})", tree.text_content())
        if not m or date(int(m[3]), int(m[2]), int(m[1])) != delivery:
            found = m.group(0) if m else "brak nagłówka z datą dostawy"
            raise RuntimeError(f"{delivery}: strona zwróciła dane innej dostawy ({found})")

    # Znajdź tabelę z danymi godzinowymi
    table = tree.xpath('//table[@id="footable_kontrakty_godzinowe"]//tbody//tr')

    rows = []
    for tr in table:
        cells = tr.xpath('.//td')
        if len(cells) >= 3:
            # Pierwsza kolumna: czas (np. "0-1")
            time_text = cells[0].text_content().strip()
            time_match = re.match(r"(\d{1,2})-(\d{1,2})", time_text)
            if not time_match:
                continue
            h_from = int(time_match.group(1))
            h_to = int(time_match.group(2))

            # Druga kolumna: cena
            price_text = cells[1].text_content().strip()
            price = pl_number_to_float(price_text)

            # Trzecia kolumna: wolumen
            vol_text = cells[2].text_content().strip()
            vol = pl_number_to_float(vol_text)

            rows.append((h_from, h_to, price, vol))

    # Brak tabeli godzinowej albo same "-" = strona nie ma notowań dla tego dnia
    if not rows:
        raise BrakDanych(f"{delivery}: strona nie ma tabeli z cenami godzinowymi")
    if all(price is None for _, _, price, _ in rows):
        raise BrakDanych(f"{delivery}: brak notowań (same '-') — dane jeszcze nieopublikowane?")
    # Akceptuj 23, 24 lub 25 godzin (zmiana czasu letni/zimowy)
    if len(rows) not in (23, 24, 25):
        raise RuntimeError(f"{delivery}: expected 23-25 rows, got {len(rows)} (page format may have changed)")

    return rows


def archive_day(delivery: date):
    prefix = f"Raport_RDN_dzie_dostawy_delivery_day_{delivery:%Y_%m_%d}"
    files = sorted(f for f in os.listdir(ARCHIWUM_DIR) if f.startswith(prefix) and f.endswith(".xlsx"))
    if not files:
        raise BrakDanych(
            f"{delivery}: brak pliku {ARCHIWUM_DIR}/{prefix}*.xlsx "
            f"(tge.pl nie ma cen godzinowych dla dostaw {LAST_OLD_DELIVERY + timedelta(days=1)}..{FIRST_NEW_DELIVERY - timedelta(days=1)})"
        )
    print(f"Archiwum: {delivery} <- {files[-1]}")
    data = parse_excel_file(os.path.join(ARCHIWUM_DIR, files[-1]))
    # sort stabilny: dodatkowa godzina H02a (zmiana czasu) zostaje po H02
    hours = sorted((hour, price) for d, hour, price in data if d == delivery.isoformat())
    return [(hour - 1, hour, price, None) for hour, price in hours]


def get_day(delivery: date):
    if delivery <= LAST_OLD_DELIVERY:
        return fetch_day(delivery, URL_OLD, check_header=True)
    if delivery < FIRST_NEW_DELIVERY:
        return archive_day(delivery)
    return fetch_day(delivery, URL_NEW, check_header=False)


def daterange(d1: date, d2: date):
    d = d1
    while d <= d2:
        yield d
        d += timedelta(days=1)


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        print(__doc__)
        sys.exit(1)
    pomin_braki = "--pomin-braki" in sys.argv
    if "--stary" in sys.argv:
        print("Uwaga: --stary nie jest już potrzebne — źródło jest wybierane automatycznie wg daty dostawy")

    month = int(args[0])
    year = int(args[1]) if len(args) > 1 else date.today().year

    if month < 1 or month > 12:
        print("Miesiąc musi być liczbą od 1 do 12")
        sys.exit(1)

    last_day = calendar.monthrange(year, month)[1]
    start = date(year, month, 1)
    end = min(date(year, month, last_day), date.today())
    if end < start:
        print(f"{year}-{month:02d} jeszcze się nie zaczął")
        sys.exit(1)
    if end.day != last_day:
        print(f"Uwaga: miesiąc niezakończony — pobieram dostawy do {end}")

    month_str = f"{year}-{month:02d}"

    out_csv = f"tge_rdn_hourly_{month_str}.csv"
    tmp_csv = out_csv + ".tmp"
    try:
        with open(tmp_csv, "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["date", "hour_from", "hour_to", "price_pln_per_mwh", "volume_mwh"])

            prev_prices = None
            for d in daterange(start, end):
                try:
                    day_rows = get_day(d)
                except BrakDanych as e:
                    if not pomin_braki:
                        raise
                    print(f"  pomijam: {e}")
                    continue
                # Strona potrafi zwrócić ostatnie dostępne dane zamiast właściwego dnia
                prices = [price for _, _, price, _ in day_rows]
                if prices == prev_prices:
                    raise RuntimeError(f"{d}: ceny identyczne jak dzień wcześniej — strona zwróciła nieaktualne dane")
                prev_prices = prices
                for h_from, h_to, price, vol in day_rows:
                    w.writerow([d.isoformat(), h_from, h_to, price, vol])
                if not LAST_OLD_DELIVERY < d < FIRST_NEW_DELIVERY:
                    time.sleep(PAUSE_S)
        os.replace(tmp_csv, out_csv)
    finally:
        if os.path.exists(tmp_csv):
            os.remove(tmp_csv)

    print(f"Saved: {out_csv}")
