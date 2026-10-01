"""
Skrypt wstawiający ceny godzinowe do kalkulatora magazynu energii (kalkulator.html).

Użycie:
    python przygotuj_kalkulator.py

Czyta wszystkie tge_rdn_hourly_YYYY-MM.csv i podmienia w kalkulator.html blok danych
między znacznikami // DANE-START i // DANE-KONIEC. Format:

    const CENY = {"2025-01-01":[420,412,...24 wartości w PLN/MWh...], ...};

Ceny są zaokrąglane do pełnych PLN/MWh (0,001 PLN/kWh — bez znaczenia dla rachunku).
Duplikaty godzin (zmiana czasu na zimowy) są uśredniane, brakująca godzina (zmiana na letni)
dostaje średnią z sąsiednich godzin.
"""
import csv
import glob
import json
import re
import sys

PLIK_HTML = "kalkulator.html"


def wczytaj_ceny() -> dict[str, list[int]]:
    dni: dict[str, dict[int, list[float]]] = {}
    for sciezka in sorted(glob.glob("tge_rdn_hourly_[0-9][0-9][0-9][0-9]-[0-9][0-9].csv")):
        for r in csv.DictReader(open(sciezka, newline="", encoding="utf-8")):
            if not r["price_pln_per_mwh"].strip():
                continue
            dni.setdefault(r["date"], {}).setdefault(int(r["hour_from"]), []).append(
                float(r["price_pln_per_mwh"])
            )

    ceny = {}
    for data, godziny in sorted(dni.items()):
        doba = []
        for h in range(24):
            wartosci = godziny.get(h)
            doba.append(round(sum(wartosci) / len(wartosci)) if wartosci else None)
        # brakująca godzina (zmiana czasu na letni) — średnia z sąsiadów
        for h, wartosc in enumerate(doba):
            if wartosc is None:
                sasiedzi = [doba[i] for i in (h - 1, h + 1) if 0 <= i < 24 and doba[i] is not None]
                doba[h] = round(sum(sasiedzi) / len(sasiedzi)) if sasiedzi else 0
        ceny[data] = doba
    return ceny


def main() -> int:
    ceny = wczytaj_ceny()
    if not ceny:
        print("Nie znaleziono plików tge_rdn_hourly_YYYY-MM.csv")
        return 1

    blok = "// DANE-START\nconst CENY = " + json.dumps(ceny, separators=(",", ":")) + ";\n// DANE-KONIEC"
    html = open(PLIK_HTML, encoding="utf-8").read()
    nowy, ile = re.subn(r"// DANE-START.*?// DANE-KONIEC", lambda _: blok, html, flags=re.S)
    if ile != 1:
        print(f"{PLIK_HTML}: oczekiwano jednego bloku // DANE-START ... // DANE-KONIEC, znaleziono {ile}")
        return 1
    open(PLIK_HTML, "w", encoding="utf-8").write(nowy)

    dni = sorted(ceny)
    print(f"{PLIK_HTML}: {len(dni)} dni ({dni[0]} … {dni[-1]}), blok danych {len(blok) // 1024} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
