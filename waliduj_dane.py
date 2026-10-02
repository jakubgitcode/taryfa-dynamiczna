#!/usr/bin/env python3
"""
Walidacja plików tge_rdn_hourly_YYYY-MM*.csv (tylko biblioteka standardowa).

Użycie:
    python3 waliduj_dane.py [plik.csv ...]      # domyślnie: wszystkie tge_rdn_hourly_*.csv w bieżącym katalogu

Kod wyjścia: 0 = brak błędów, 1 = są błędy (ostrzeżenia nie zmieniają kodu).

Sprawdza:
    - nagłówek,
    - brakujące dni miesiąca,
    - liczbę godzin na dzień (24; 23 w dniu zmiany czasu na letni, 25 na zimowy),
    - duplikaty (date, hour_from) poza dniem zmiany czasu na zimowy,
    - puste ceny,
    - dni dostawy z przyszłości (względem dzisiejszej daty),
    - dni będące dokładną kopią poprzedniego dnia (strona TGE zwraca ostatnie dane dla dat bez notowań),
    - ceny poza zakresem wiarygodności,
    - heurystykę przesunięcia dat (najtańszy dzień tygodnia = sobota zamiast niedzieli).
"""
import csv
import calendar
import glob
import re
import statistics
import sys
from collections import defaultdict
from datetime import date, timedelta

HEADER = ["date", "hour_from", "hour_to", "price_pln_per_mwh", "volume_mwh"]
PRICE_MIN, PRICE_MAX = -5000.0, 5000.0
WEEKDAYS = ["pon", "wt", "śr", "czw", "pt", "sob", "nd"]


def last_sunday(year: int, month: int) -> date:
    d = date(year, month, calendar.monthrange(year, month)[1])
    return d - timedelta(days=(d.weekday() - 6) % 7)


def expected_hours(d: date) -> int:
    if d == last_sunday(d.year, 3):
        return 23
    if d == last_sunday(d.year, 10):
        return 25
    return 24


def validate(path: str) -> tuple[list[str], list[str]]:
    errors, warnings = [], []
    m = re.search(r"tge_rdn_hourly_(\d{4})-(\d{2})", path)
    if not m:
        return ["nazwa pliku nie pasuje do tge_rdn_hourly_YYYY-MM*.csv"], []
    year, month = int(m.group(1)), int(m.group(2))

    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        header = next(reader, None)
        rows = list(reader)
    if header != HEADER:
        errors.append(f"nagłówek {header} != {HEADER}")
        return errors, warnings

    by_day: dict[str, list[tuple[int, float | None]]] = defaultdict(list)
    no_volume = 0
    for r in rows:
        d, h_from, _h_to, price, vol = r
        by_day[d].append((int(h_from), float(price) if price.strip() else None))
        if not vol.strip():
            no_volume += 1

    days_in_month = [date(year, month, i) for i in range(1, calendar.monthrange(year, month)[1] + 1)]
    missing = [d.isoformat() for d in days_in_month if d.isoformat() not in by_day]
    if missing:
        errors.append(f"brakujące dni ({len(missing)}): {', '.join(missing)}")

    foreign = [d for d in by_day if not d.startswith(f"{year}-{month:02d}-")]
    if foreign:
        errors.append(f"dni spoza miesiąca: {', '.join(sorted(foreign))}")

    today = date.today()
    future = [d for d in sorted(by_day) if date.fromisoformat(d) > today]
    if future:
        errors.append(f"dni z przyszłości (dane niekompletne lub skopiowane): {future[0]} … {future[-1]} ({len(future)})")

    prev_prices = None
    copies = []
    for d in sorted(by_day):
        hours = by_day[d]
        exp = expected_hours(date.fromisoformat(d))
        empty = [h for h, p in hours if p is None]
        # stara strona TGE w dniu zmiany czasu na letni pokazuje 24 wiersze, z czego jeden to "-"
        if exp == 23 and len(hours) == 24 and len(empty) == 1:
            hours = [(h, p) for h, p in hours if p is not None]
            empty = []
        if len(hours) != exp:
            (errors if abs(len(hours) - 24) > 1 else warnings).append(
                f"{d}: {len(hours)} godzin, oczekiwano {exp}"
            )
        counts = defaultdict(int)
        for h, _ in hours:
            counts[h] += 1
        dups = [h for h, c in counts.items() if c > 1]
        # w dniu zmiany czasu na zimowy TGE ma dodatkową godzinę H02a -> konwertuj_excel.py daje drugie hour_from=1
        if dups and (exp != 25 or len(dups) > 1):
            errors.append(f"{d}: zduplikowane godziny {dups}")
        if empty:
            (errors if len(empty) > 1 else warnings).append(f"{d}: puste ceny dla godzin {empty}")
        out = [(h, p) for h, p in hours if p is not None and not PRICE_MIN <= p <= PRICE_MAX]
        if out:
            warnings.append(f"{d}: ceny poza [{PRICE_MIN}, {PRICE_MAX}]: {out}")
        # porównujemy z ostatnim niepustym dniem — pusty dzień nie przerywa serii kopii
        prices = [p for _, p in hours]
        if any(p is not None for p in prices):
            if prices == prev_prices:
                copies.append(d)
            prev_prices = prices
    if copies:
        errors.append(f"dni identyczne z poprzednim (kopie): {', '.join(copies)}")

    by_weekday = defaultdict(list)
    for d, hours in by_day.items():
        vals = [p for _, p in hours if p is not None]
        if vals:
            by_weekday[date.fromisoformat(d).weekday()].append(statistics.mean(vals))
    if len(by_weekday) == 7:
        means = {wd: statistics.mean(v) for wd, v in by_weekday.items()}
        cheapest = min(means, key=means.get)
        if cheapest == 5:
            warnings.append(
                "najtańszy dzień tygodnia to sobota (zwykle niedziela) — możliwe przesunięcie dat o 1 dzień "
                "(data obrotu zamiast daty dostawy)"
            )

    if no_volume:
        warnings.append(f"{no_volume} wierszy bez wolumenu (typowe dla danych z konwertuj_excel.py)")

    return errors, warnings


def main() -> int:
    files = sys.argv[1:] or sorted(glob.glob("tge_rdn_hourly_*.csv"))
    if not files:
        print("Brak plików tge_rdn_hourly_*.csv")
        return 1
    total_errors = 0
    for path in files:
        errors, warnings = validate(path)
        status = "BŁĘDY" if errors else ("UWAGI" if warnings else "OK")
        print(f"[{status}] {path}")
        for e in errors:
            print(f"    ✗ {e}")
        for w in warnings:
            print(f"    ! {w}")
        total_errors += len(errors)
    return 1 if total_errors else 0


if __name__ == "__main__":
    sys.exit(main())
