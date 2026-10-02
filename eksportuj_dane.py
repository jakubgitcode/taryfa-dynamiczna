#!/usr/bin/env python3
"""Eksport zwalidowanych cen do statycznej strony (tylko stdlib).

Użycie:
    python3 eksportuj_dane.py [--sprawdz]

Czyta wyłącznie miesięczne CSV, pomija surowe *.xlsx.csv. Jedyny dopuszczony
brak to 2025-09-30. --sprawdz porównuje wynik bez zapisu. Nie pobiera danych.
Oznaczenia godzin pozostają oznaczeniami TGE, nie udajemy znaczników UTC.
"""

import calendar
import csv
import json
import math
import os
import sys
import tempfile
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

from waliduj_dane import expected_hours, validate

BRAK = "2025-09-30"
PLIK = Path("dane_rdn.js")


def zrodlo(dzien: str) -> str:
    if dzien < "2025-10-01":
        return "fixing1"
    if dzien <= "2025-11-17":
        return "xlsx"
    return "tgebase"


def eksportuj(pliki: list[Path]) -> dict:
    """Sprawdza kompletność i zachowuje ceny oraz kolejność godzin źródłowych."""
    if not pliki:
        raise ValueError("Nie znaleziono miesięcznych CSV")
    dni = {}
    for plik in sorted(pliki):
        bledy, _ = validate(str(plik))
        dozwolony = f"brakujące dni (1): {BRAK}"
        nowe = [b for b in bledy if not (plik.name == "tge_rdn_hourly_2025-09.csv" and b == dozwolony)]
        if nowe:
            raise ValueError(f"{plik}: {'; '.join(nowe)}")
        grupy = defaultdict(list)
        with plik.open(encoding="utf-8", newline="") as src:
            for r in csv.DictReader(src):
                d = r["date"]
                h = int(r["hour_from"])
                if int(r["hour_to"]) != h + 1:
                    raise ValueError(f"{d}: niespójny przedział godziny")
                p = float(r["price_pln_per_mwh"]) if r["price_pln_per_mwh"].strip() else None
                if p is not None and not math.isfinite(p):
                    raise ValueError(f"{d}: cena nie jest skończoną liczbą")
                grupy[d].append([h, p])
        for d, godziny in sorted(grupy.items()):
            if d in dni:
                raise ValueError(f"{d}: powtórzony dzień")
            oczekiwane = expected_hours(date.fromisoformat(d))
            wzor = list(range(24))
            if oczekiwane == 23:
                # Obserwowany format TGE: brak notowania w źródłowym 1–2.
                godziny = [g for g in godziny if not (g[0] == 1 and g[1] is None)]
                wzor.remove(1)
            elif oczekiwane == 25:
                wzor.insert(2, 1)
            if [h for h, _ in godziny] != wzor or any(p is None for _, p in godziny):
                raise ValueError(f"{d}: nieznany układ godzin lub pusta cena; wymaga sprawdzenia źródła")
            dni[d] = {"data": d, "zrodlo": zrodlo(d), "ceny": godziny}
    daty = sorted(dni)
    # Pełny zakres miesięcy; brak całego miesiąca nie może przejść niezauważony.
    poczatek = date.fromisoformat(daty[0]).replace(day=1)
    koniec = date.fromisoformat(daty[-1])
    koniec = koniec.replace(day=calendar.monthrange(koniec.year, koniec.month)[1])
    braki = []
    d = poczatek
    while d <= koniec:
        if d.isoformat() not in dni:
            braki.append(d.isoformat())
        d += timedelta(days=1)
    if any(d != BRAK for d in braki):
        raise ValueError(f"Nieoczekiwane brakujące dni: {braki}")
    return {
        "wersja": 1,
        "od": poczatek.isoformat(), "do": koniec.isoformat(), "braki": braki,
        "czas": "Kolejność interwałów dostawy TGE; etykiety źródłowe, nie UTC. Każdy interwał trwa godzinę.",
        "zrodla": {"fixing1": "Fixing I", "xlsx": "Raport TGE XLSX", "tgebase": "Średnioważona TGeBase"},
        "dni": [dni[d] for d in daty],
    }


def tekst(dane: dict) -> str:
    return "// Wygenerowano przez eksportuj_dane.py; nie edytuj ręcznie.\n" + "globalThis.DANE_RDN = " + json.dumps(dane, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + ";\n"


def main() -> int:
    if sys.argv[1:] not in ([], ["--sprawdz"]):
        print("Użycie: python3 eksportuj_dane.py [--sprawdz]", file=sys.stderr)
        return 1
    try:
        pliki = list(Path('.').glob('tge_rdn_hourly_[0-9][0-9][0-9][0-9]-[0-9][0-9].csv'))
        dane = eksportuj(pliki)
        wynik = tekst(dane)
        if "--sprawdz" in sys.argv:
            if not PLIK.exists() or PLIK.read_text(encoding="utf-8") != wynik:
                raise ValueError("dane_rdn.js jest nieaktualny; uruchom python3 eksportuj_dane.py")
        else:
            nazwa = None
            try:
                with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=".", suffix=".tmp", delete=False) as tmp:
                    nazwa = tmp.name
                    tmp.write(wynik)
                os.replace(nazwa, PLIK)
            finally:
                if nazwa and os.path.exists(nazwa):
                    os.unlink(nazwa)
        print(f"{PLIK}: {len(dane['dni'])} dni, {dane['od']} … {dane['do']}; luki: {dane['braki']}")
        return 0
    except (ValueError, OSError) as e:
        print(f"Błąd eksportu: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
