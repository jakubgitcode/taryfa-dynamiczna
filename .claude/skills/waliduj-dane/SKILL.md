---
name: waliduj-dane
description: Sprawdza jakość plików tge_rdn_hourly_*.csv (ceny godzinowe TGE RDN) — brakujące dni, puste ceny, dni-kopie, liczba godzin przy zmianie czasu, duplikaty, przesunięcie dat. Użyj po każdym pobraniu lub konwersji danych, przed generowaniem heatmap i przed każdą analizą cen albo opłacalności, a także gdy użytkownik pyta, czy dane są kompletne lub poprawne.
argument-hint: "[plik.csv ...]"
---

# Walidacja danych TGE RDN

Uruchom z katalogu głównego repo (działa na systemowym `python3`, bez venva):

```bash
python3 waliduj_dane.py $ARGUMENTS
```

Bez argumentów sprawdza wszystkie `tge_rdn_hourly_*.csv`. Kod wyjścia 1 = są błędy (`✗`); ostrzeżenia (`!`) go nie zmieniają.
Ten sam walidator uruchamia `start.sh` i workflow `.github/workflows/aktualizuj-dane.yml` — błąd blokuje commit danych.

## Jak czytać wynik

| Komunikat | Co to znaczy | Co zrobić |
|---|---|---|
| `brakujące dni` | pobieranie przerwane albo miesiąc nie jest skończony | dociągnąć miesiąc ponownie (`pobierz_dane.py` nadpisuje plik atomowo) |
| `dni z przyszłości` | data dostawy późniejsza niż dziś — nie powinno się zdarzyć | sprawdzić, skąd pochodzi plik |
| `dni identyczne z poprzednim (kopie)` | tge.pl dla dat bez notowań zwraca ostatnie dostępne dane | pobrać ponownie; `pobierz_dane.py` powinien był to odrzucić |
| `puste ceny` | brak notowania w danej godzinie | sprawdzić stronę TGE dla tej sesji |
| `N godzin, oczekiwano 23/25` | dzień zmiany czasu nie pasuje | sprawdzić, czy daty to daty dostawy |
| `najtańszy dzień tygodnia to sobota` | heurystyka przesunięcia dat o 1 dzień (data sesji zamiast dostawy) | sprawdzić, czy plik powstał starą wersją scrapera |
| `wierszy bez wolumenu` | dni z archiwum xlsx (1.10–17.11.2025) nie mają wolumenu | informacyjne |

Pliki `*.xlsx.csv` to wyjście `konwertuj_excel.py` — `2025-11.xlsx.csv` kończy się 17.11 i to jest poprawne.

W raporcie dla użytkownika podaj: pliki z błędami, co jest nowe względem „Znanych problemów” w `AGENTS.md` i proponowany następny krok. Nie poprawiaj danych bez zgody.
