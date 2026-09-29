# TODO — taryfa-dynamiczna

Priorytety: **P0** = poprawność danych, **P1** = środowisko/porządek, **P2** = jakość kodu,
**P3** = właściwy cel projektu (opłacalność), **P4** = automatyzacja.
Kontekst: `AGENTS.md`. Walidator: `python3 waliduj_dane.py`.

## P0 — poprawność danych

- [x] **P0-1 Przesunięcie dat o 1 dzień** (wrzesień 2026). `date_start` na tge.pl to data sesji, ceny dotyczą
      dostawy następnego dnia — potwierdzone nagłówkiem starej strony i adresem iframe'a TGeBase, który
      używa tego samego `date_start`. `pobierz_dane.py` pyta o `D-1`, na starej stronie sprawdza datę dostawy
      z nagłówka; wszystkie miesiące pobrane ponownie; kontrola: czerwiec 2025 = stare dane +1 dzień (720/720).
- [x] **P0-2 2026-01 błędny od 22.01** — pobrany ponownie.
- [x] **P0-3 Zabezpieczenia scrapera:** pomijanie dostaw po dzisiejszej dacie, odrzucanie dnia z samymi `-`
      i dnia identycznego z poprzednim, zapis atomowy (`.tmp` + `os.replace`), retry, User-Agent.
- [x] **P0-4 Brakujące miesiące 2026-02 … 2026-08** — pobrane.
- [ ] **P0-5 Spójność indeksu ceny.** Fixing I (do 30.09.2025) vs xlsx (1.10–17.11.2025) vs średnioważona
      TGeBase (od 18.11.2025). Ustalić, która cena odpowiada rozliczeniu w taryfie dynamicznej
      i ew. zapisywać kolumnę `source`.
- [x] **P0-6 Listopad 2025** — teraz spójnie: xlsx (1–17) + TGeBase (18–30), obie części z datami dostawy.
- [x] **P0-7 (częściowo)** Zmiana czasu na letni na nowym endpoincie: 2026-03-29 ma 24 wiersze z pustą
      godziną `1-2` — tak samo jak stara strona. Zostaje do sprawdzenia zmiana na czas zimowy (2026-10-25).
- [ ] **P0-8 Dostawa 2025-09-30** — brak w źródłach (patrz `AGENTS.md`). Poszukać innego źródła
      (raport xlsx TGE, PSE) albo zostawić udokumentowaną lukę.

## P1 — środowisko i porządek w repo

- [x] Odtworzyć `.venv` (Python 3.12, przepis w `AGENTS.md` — na vboxsf bez symlinków).
- [ ] Usunąć zepsute `myvenv/`. Przypiąć wersje w `requirements.txt` (CI instaluje najnowsze — dziś pandas 3.x).
- [ ] Dodać `.gitignore` (`.venv/`, `myvenv/`, `__pycache__/`, `*.pyc`, `*.tmp`).
- [ ] Git na vboxsf: `git config core.fileMode false` i `safe.directory` dla tej ścieżki.
- [x] Naprawić `start.sh` — teraz cały pipeline dla miesiąca, używany też przez CI.
- [x] `all.png.py` + `all_column.py` → `generuj_rok.py <rok> [--uklad siatka|kolumna]`.
- [ ] Usunąć zastąpione pliki: `all.png.py`, `all_column.py`, `miesac.py`, `miesac-stary-format.py`
      (mają stary błąd dat), `run_year_2025.py` (pusty), `old/`.
- [ ] `pliki.py` (zapis czatu) → prawdziwy `pobierz_archiwum.py` (xlsx z `https://tge.pl/RDN_instrumenty_15`).
- [ ] Zdecydować o `*.xlsx.csv` (surowe wyjście konwertera — dane są już w miesięcznych CSV).
- [ ] Uporządkować katalogi: `dane/` (CSV), `wykresy/` (PNG), `archiwum/` (xlsx), kod w `skrypty/` lub pakiecie.
- [x] Domyślny rok w `pobierz_dane.py` = bieżący (w `konwertuj_excel.py` nadal 2025).

## P2 — jakość kodu

- [x] Wspólna paleta i `load_pivot()` w `generuj_heatmap.py`, używane przez `generuj_rok.py`.
- [ ] `argparse` zamiast ręcznego parsowania `sys.argv`.
- [ ] Tryb „dociągnij tylko brakujące dni” w `pobierz_dane.py`.
- [ ] Testy `pytest`: `pl_number_to_float`, parser HTML na zapisanych stronach (stara z nagłówkiem, TGeBase,
      strona z samymi `-`), `konwertuj_excel.parse_excel_file` (w tym 26.10.2025 z `H02a`), walidator.
- [x] Walidator w repo (`waliduj_dane.py`), wołany przez `start.sh` i CI.
- [ ] `ruff` (lint + format).
- [ ] Heatmapa: oznaczać komórki bez danych, w dniu 25 h zaznaczyć uśrednioną godzinę.
- [ ] Rozważyć dane 15-minutowe (od 1.10.2025 SDAC ma 15-min MTU; xlsx zawiera `_Qhh:mm`).

## P3 — właściwy cel: analiza opłacalności taryfy dynamicznej

- [ ] Model kosztu: `Σ zużycie_h × (cena_RDN_h + marża/opłata handlowa)` + akcyza + VAT + opłaty
      dystrybucyjne (zmienne strefowe + stałe). Parametry w pliku konfiguracyjnym, per sprzedawca/OSD.
- [ ] Taryfy porównawcze: G11, G12, G12w (+ ewentualnie ceny maksymalne w danym okresie), z datą obowiązywania stawek.
- [ ] Profil zużycia: (a) standardowy profil godzinowy, (b) import danych z licznika z portalu OSD.
- [ ] Wynik: koszt miesięczny i roczny w każdej taryfie, różnica, próg opłacalności.
- [ ] Scenariusze przesuwania zużycia: pompa ciepła, EV, bojler.
- [ ] Statystyki cen: średnia arytmetyczna vs ważona profilem, dzienny spread, godziny ujemne,
      najtańsze okna 2/3/4 h.
- [ ] Raport (HTML/Markdown z wykresami) + skill `analiza-oplacalnosci`, gdy powstanie kalkulator.

## P4 — automatyzacja

- [x] Comiesięczne pobieranie w GitHub Actions (`.github/workflows/aktualizuj-dane.yml`): 1. dnia miesiąca,
      walidacja blokuje commit, ręczne uruchomienie z wyborem miesiąca.
- [ ] CI: `ruff` + `pytest` na PR.
