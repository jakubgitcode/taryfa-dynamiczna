---
name: aktualizuj-miesiac
description: Pobiera godzinowe ceny TGE RDN dla wskazanego miesiąca z tge.pl, waliduje CSV i generuje heatmapy PNG (miesięczną i roczne). Użyj, gdy użytkownik chce dodać/odświeżyć dane za miesiąc, uzupełnić brakujące miesiące albo wygenerować heatmapę dla miesiąca.
argument-hint: "[<miesiąc> <rok>]"
---

# Aktualizacja miesiąca: $ARGUMENTS

To samo robi automatycznie workflow `.github/workflows/aktualizuj-dane.yml` (1. dnia miesiąca, za poprzedni miesiąc).
Lokalnie pracuj z katalogu głównego repo.

## 1. Sprawdzenia wstępne

- Miesiąc powinien być **zakończony**. `pobierz_dane.py` pobierze niezakończony miesiąc tylko do dzisiejszej
  dostawy, a walidator zgłosi brakujące dni — taki plik nadaje się do podglądu, nie do commita.
- Źródło danych jest wybierane automatycznie wg daty dostawy (stara strona / `archiwum/*.xlsx` / TGeBase) —
  flaga `--stary` nie jest potrzebna.
- Jeśli plik `tge_rdn_hourly_YYYY-MM.csv` już istnieje, zostanie nadpisany; po pobraniu pokaż
  `git -c safe.directory='*' -c core.fileMode=false diff --stat`.

## 2. Środowisko

```bash
.venv/bin/python -c "import pandas, matplotlib, lxml, requests, openpyxl" 2>/dev/null || echo "brak venva"
```

Jeśli venva brak — odtwórz go przepisem z sekcji „Środowisko” w `AGENTS.md` (na vboxsf `uv venv` nie działa).

## 3. Pobranie, walidacja, heatmapy

```bash
./start.sh <miesiąc> <rok>     # bez argumentów: poprzedni miesiąc
```

`start.sh` kolejno: `pobierz_dane.py` → `waliduj_dane.py` → `generuj_heatmap.py` → `generuj_rok.py`.
Zatrzymuje się na pierwszym błędzie (np. walidacja) — wtedy zgłoś użytkownikowi wynik walidatora.
Pobieranie: jedno zapytanie na dzień, sekwencyjnie z pauzą, ok. 1 min na miesiąc.

## 4. Kontrola wizualna

Obejrzyj `tge_rdn_heatmap_<rok>-<MM>.png` (Read na pliku): czy nie ma pustych wierszy, powtarzających się
identycznych dni ani przesunięć (niedziele i święta powinny być tańsze).

## 5. Raport

Krótko: zakres dni, min/max/średnia cena, liczba godzin z ceną ujemną, wynik walidatora, zmienione pliki.
Nie commituj bez prośby użytkownika.
