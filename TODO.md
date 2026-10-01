# TODO — taryfa-dynamiczna

Kontekst i zasady: `AGENTS.md`. Walidator danych: `python3 waliduj_dane.py`.
Na górze to, co zostało; na dole skrót tego, co już zrobione.

## Dane

- [ ] **Spójność indeksu ceny.** Mamy trzy różne indeksy w jednym szeregu: Fixing I (dostawy do 30.09.2025),
      cena z raportu xlsx (1.10–17.11.2025) i średnioważona TGeBase (od 18.11.2025). Ustalić, który odpowiada
      rozliczeniu w taryfie dynamicznej, opisać w README i rozważyć kolumnę `source` w CSV.
      **Dopóki to nie jest zamknięte, porównania 2025 vs 2026 w kalkulatorze są obarczone tym błędem.**
- [ ] **Brak dostawy 2025-09-30.** Nie ma jej w żadnym źródle (szczegóły w `AGENTS.md`). Poszukać raportu
      xlsx TGE albo danych PSE, ewentualnie zostawić udokumentowaną lukę.
- [ ] **Zmiana czasu na zimowy 2026-10-25** — pierwszy taki dzień na endpoincie TGeBase. Po pobraniu
      października sprawdzić, czy doba ma 25 wierszy i jak oznaczona jest dodatkowa godzina
      (zmiana na czas letni już sprawdzona: 24 wiersze z pustą godziną `1-2`).
- [ ] Rozważyć dane 15-minutowe (od 1.10.2025 SDAC ma 15-min MTU; xlsx zawiera kontrakty `_Qhh:mm`).
      Przy magazynie ma to znaczenie — ładowanie reaguje na kwadranse, nie na godziny.

## Kalkulator magazynu energii (`kalkulator.html`)

Pierwsza wersja działa: cztery warianty (G11 / dynamiczna / + magazyn / + magazyn i PV), dane 2025–2026
wbudowane w stronę przez `przygotuj_kalkulator.py`.

- [ ] Podpiąć `przygotuj_kalkulator.py` do `start.sh` (i tym samym do CI), żeby dane w kalkulatorze
      odświeżały się razem z heatmapami. Uwaga: opublikowaną stronę trzeba przepublikować ręcznie.
- [ ] Opłaty stałe i opłata mocowa — dziś pominięte (są takie same w każdym wariancie, ale zmieniają rachunek).
- [ ] Degradacja magazynu (np. −2%/rok) i koszt kapitału — bez tego prosty zwrot jest zbyt optymistyczny.
- [ ] Import profilu zużycia z licznika (CSV z portalu OSD) zamiast profilu modelowego.
- [ ] Produkcja PV z realnych danych (PVGIS dla lokalizacji) zamiast modelu sinusoidalnego.
- [ ] G12/G12w jako dodatkowy punkt odniesienia obok G11.
- [ ] Scenariusz z agregatem (koszt paliwa zł/kWh, motogodziny) — wariant „zamiast magazynu”.
- [ ] Scenariusze przesuwania zużycia: EV, pompa ciepła, bojler (ile kWh da się przenieść w tanie godziny).
- [ ] Odwrócone pytanie: przy jakiej cenie magazynu (zł/kWh) zwrot schodzi poniżej 10 lat.
- [ ] Sprawdzić, czy i na jakich zasadach opłaca się oddawać energię z magazynu do sieci (net-billing).

## Automatyzacja

- [ ] **Sprawdzić harmonogram CI.** Przebieg zaplanowany na 1.10.2026 06:17 UTC nie wystartował
      (ręczne uruchomienia działają, push z runnera potwierdzony). Jeśli 1.11 też nie ruszy —
      poszukać przyczyny (crony GitHuba bywają opóźniane, nowe repo bywa rejestrowane z opóźnieniem).
- [ ] CI: `ruff` + `pytest` na pull requestach.

## Kod i porządki

- [ ] Usunąć zastąpione pliki: `all.png.py`, `all_column.py` (zapisy czatu), `miesac.py`,
      `miesac-stary-format.py` (mają stary błąd dat), `run_year_2025.py` (pusty), `old/`.
- [ ] `pliki.py` (zapis czatu) → prawdziwy `pobierz_archiwum.py` (xlsx z `https://tge.pl/RDN_instrumenty_15`;
      uwaga: ten adres przestał zwracać listę plików — sprawdzić, gdzie TGE trzyma raporty teraz).
- [ ] Usunąć zepsute `myvenv/`; przypiąć wersje w `requirements.txt` (CI instaluje najnowsze — dziś pandas 3.x).
- [ ] Git na vboxsf: `git config core.fileMode false` i `safe.directory` dla tej ścieżki.
- [ ] Zdecydować o `*.xlsx.csv` (surowe wyjście konwertera — te same dane są w miesięcznych CSV).
- [ ] Uporządkować katalogi: `dane/` (CSV), `wykresy/` (PNG), `archiwum/` (xlsx), kod w `skrypty/` lub pakiecie.
- [ ] `argparse` zamiast ręcznego parsowania `sys.argv`; domyślny rok w `konwertuj_excel.py` (wciąż 2025).
- [ ] Tryb „dociągnij tylko brakujące dni” w `pobierz_dane.py`.
- [ ] Testy `pytest`: `pl_number_to_float`, parser HTML na zapisanych stronach (stara z nagłówkiem, TGeBase,
      strona z samymi `-`), `konwertuj_excel.parse_excel_file` (w tym 26.10.2025 z `H02a`), walidator.
- [ ] Heatmapa: oznaczać komórki bez danych, w dniu 25-godzinnym zaznaczyć uśrednioną godzinę.
- [ ] Skille są w dwóch kopiach (`.claude/skills/`, `.agents/skills/`) — rozważyć skrypt sprawdzający, czy się nie rozjechały.

## Zrobione (wrzesień–październik 2026)

- Daty dostawy zamiast dat sesji w całym szeregu + ponowne pobranie 2025-01 … 2026-09
  (kontrola: czerwiec 2025 = stare dane przesunięte o +1 dzień, 720/720 godzin).
- Styczeń 2026 (dni 22–31 były puste albo skopiowane) i brakujące miesiące 2026-02 … 2026-08.
- `pobierz_dane.py`: automatyczny wybór źródła, weryfikacja daty dostawy z nagłówka, odrzucanie dni bez
  notowań, kopii poprzedniego dnia i niezakończonego miesiąca, zapis atomowy, retry, `--pomin-braki`, `--niepelny`.
- `waliduj_dane.py` (kontrola jakości CSV), `generuj_rok.py` (heatmapy roczne), wspólna paleta
  w `generuj_heatmap.py`, `start.sh` jako cały pipeline.
- GitHub Actions: comiesięczne pobranie + walidacja + wykresy + commit (push z runnera potwierdzony).
- `.gitignore`, `AGENTS.md`, `CLAUDE.md`, skille w `.claude/skills` i `.agents/skills`, `.venv` na Pythonie 3.12.
- Kalkulator magazynu energii (`kalkulator.html` + `przygotuj_kalkulator.py`).
