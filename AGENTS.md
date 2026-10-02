# AGENTS.md — taryfa-dynamiczna

Instrukcje dla agentów AI (Claude Code, Codex, Copilot itp.) pracujących w tym repo.
Lista zadań: [TODO.md](TODO.md).

## Cel projektu

Ocena opłacalności **taryfy dynamicznej** (cena energii zależna od godzinowej ceny
z Rynku Dnia Następnego TGE). Projekt pobiera godzinowe ceny RDN z tge.pl i rysuje heatmapy (dzień × godzina).
`kalkulator.html` zawiera wcześniejszy prototyp porównania G11, taryfy dynamicznej, magazynu i PV.
Nowa wersja: `index.html` + `formularz.css` + `formularz.js` to formularz i wyniki,
`silnik.js` liczy chronologiczny bilans w przeglądarce, `dane_rdn.js` zawiera dane offline.
`eksportuj_dane.py` przygotowuje je z miesięcznych CSV; Python nie jest wymagany do otwarcia strony.
Testy: `pnpm test`, `python -m pytest -q`, `python -m ruff check .`.
Plan etapów i ograniczenia: `work_now.sh`, `TODO.md`, `README.md`.

Wynik jest modelem RDN, nie implementacją konkretnej umowy. Nie dodawaj domyślnego
przychodu z eksportu PV bez modelu rozliczeń. Zachowuj rzeczywiste interwały 23/25 h;
nie uśredniaj ich na potrzeby kalkulatora. Eksporter blokuje nowe luki i nieznane układy
czasu; wyjątek to jawny brak 2025-09-30. Symulacja nie przechodzi przez tę lukę.

## Struktura

Wszystko leży płasko w katalogu głównym; skrypty czytają i zapisują pliki w bieżącym katalogu,
więc **uruchamiaj je z katalogu głównego repo**.

| Plik | Status | Rola |
|---|---|---|
| `index.html`, `formularz.css`, `formularz.js` | **aktualne** | statyczna strona i formularz z lokalnym zapisem |
| `silnik.js` | **aktualny** | czysty silnik chronologiczny, bez DOM i zależności |
| `eksportuj_dane.py`, `dane_rdn.js` | **aktualne** | zwalidowane CSV → dane strony offline |
| `testy/`, `.github/workflows/testy.yml` | **aktualne** | testy silnika, DOM, parserów, walidacji i eksportu |
| `start.sh` | **aktualny** | cały pipeline dla miesiąca: pobierz → waliduj → eksport strony → heatmapa → heatmapy roczne (`[<miesiąc> <rok>]`, domyślnie poprzedni miesiąc) |
| `pobierz_dane.py` | **aktualny** | tge.pl / `archiwum/` → `tge_rdn_hourly_YYYY-MM.csv` (`<miesiąc> [rok]`) |
| `waliduj_dane.py` | **aktualny** | kontrola jakości CSV (tylko stdlib), kod wyjścia 1 przy błędach |
| `generuj_heatmap.py` | **aktualny** | CSV → `tge_rdn_heatmap_YYYY-MM.png`; tu jest paleta `RDN_CMAP` i `load_pivot()` |
| `generuj_rok.py` | **aktualny** | → `tge_rdn_heatmap_<rok>_all.png` (siatka 4×3) i `_column.png` |
| `konwertuj_excel.py` | **aktualny** | `archiwum/*.xlsx` → `tge_rdn_hourly_YYYY-MM.xlsx.csv`; jego `parse_excel_file` używa też `pobierz_dane.py` |
| `.github/workflows/aktualizuj-dane.yml` | **aktualny** | 1. dnia miesiąca uruchamia `start.sh` za poprzedni miesiąc i commituje CSV + PNG + dane strony |
| `.claude/skills/`, `.agents/skills/` | **aktualne** | te same skille w dwóch miejscach (Claude Code i narzędzia czytające `.agents/`) — **zmieniasz jeden, skopiuj do drugiego** |
| `miesac.py`, `miesac-stary-format.py` | przestarzałe | stare wersje scraper+heatmapa w jednym, **z błędem dat** — nie używać |
| `all.png.py`, `all_column.py`, `pliki.py` | **to nie jest Python** | zapisy czatu Copilota; zastąpione przez `generuj_rok.py` (`pliki.py` = sposób pobrania `archiwum/`) |
| `run_year_2025.py` | pusty | — |
| `archiwum/*.xlsx` | dane źródłowe | raporty TGE „dzień dostawy” 2025-10-01 … 2025-11-17, **nie modyfikuj** |
| `old/` | śmieci | stare wersje PNG |
| `tge_rdn_hourly_*.csv`, `tge_rdn_heatmap_*.png` | dane/wyniki | commitowane do repo (także przez workflow) |

## Środowisko

- Python 3.12 (tak jak w CI). Na tym udziale vboxsf **nie da się tworzyć symlinków**, więc `uv venv`
  i zwykłe `python -m venv` nie działają. Przepis (katalog `lib64` z góry, żeby venv nie robił symlinka):
  ```bash
  rm -rf .venv && mkdir -p .venv/lib64
  ~/.local/share/uv/python/cpython-3.12-linux-x86_64-gnu/bin/python3.12 -m venv --copies --without-pip .venv
  UV_LINK_MODE=copy uv pip install --python .venv/bin/python -r requirements.txt
  ```
  (`uv python install 3.12`, jeśli brak interpretera). `myvenv/` jest zepsute — nie używać.
- `start.sh` bierze interpreter ze zmiennej `PYTHON` (domyślnie `.venv/bin/python`).
- Repo leży na udziale VirtualBox (`vboxsf`, właściciel root, tryb 0770):
  - git zgłasza „dubious ownership” → `git -c safe.directory='*' …`;
  - wszystkie pliki widać jako zmienione (100644→100755) — to tylko tryb pliku →
    `git -c core.fileMode=false …`. Nowe pliki wykonywalne dodawaj z `git add --chmod=+x`.
  - `/home/kubaai/shared/git3/taryfa-dynamiczna` i `/home/kubaai/workspace/git3/taryfa-dynamiczna` to **ten sam katalog**.

## Format danych

`tge_rdn_hourly_YYYY-MM.csv`, UTF-8, separator `,`, kropka dziesiętna:

```
date,hour_from,hour_to,price_pln_per_mwh,volume_mwh
2025-12-06,0,1,431.3,3332.18
```

- **`date` to data dostawy.** Strona tge.pl przyjmuje w `date_start` datę **sesji**, a pokazuje ceny
  dostawy następnego dnia — `pobierz_dane.py` pyta więc o `D-1` dla dostawy `D`.
- Źródło zależy od daty dostawy (wybierane automatycznie w `pobierz_dane.py`):

  | Dostawa | Źródło | Cena |
  |---|---|---|
  | do 2025-09-30 | `…/energia-elektryczna-rdn?date_start=` — tabela `footable_kontrakty_godzinowe`; data dostawy z nagłówka „dla dostawy w dniu DD-MM-RRRR” jest sprawdzana | Fixing I |
  | 2025-10-01 … 2025-11-17 | `archiwum/*.xlsx` (strona nie ma dla tego okresu cen godzinowych) | arkusz `WYNIKI`, kolumna 3, wiersze `_Hnn` |
  | od 2025-11-18 | `…/energia-elektryczna-rdn-tge-base?date_start=…&iframe=1` (bez nagłówka z datą) | średnioważona godzinowa (TGeBase) |

- 24 wiersze na dzień; w dniu zmiany czasu 23/25. Na 25 h TGE ma godzinę `H02a` → drugi wiersz
  `hour_from=1`. W dniu zmiany na czas letni obie strony (stara i TGeBase) dają 24 wiersze z pustą ceną
  w godzinie `1-2` (sprawdzone dla 2025-03-30 i 2026-03-29) — walidator to akceptuje.
  Heatmapy uśredniają duplikaty.
- `volume_mwh` puste dla dni z archiwum xlsx.
- `*.xlsx.csv` — surowe wyjście `konwertuj_excel.py` (`2025-11.xlsx.csv` kończy się 17.11 i tak ma być).

## Znane problemy z danymi

1. ~~Przesunięcie dat o 1 dzień~~ — **naprawione we wrześniu 2026**: scraper poprawiony, wszystkie miesiące
   2025-01 … 2026-08 pobrane ponownie. Kontrola: czerwiec 2025 po poprawce = stare dane przesunięte
   o +1 dzień (720/720 godzin). Pliki sprzed poprawki (stara historia gita, `*.org.csv`, `miesac*.py`)
   mają daty sesji, nie dostawy.
2. **Brak dostawy 2025-09-30** — tge.pl nie pokazuje dla tej sesji żadnej tabeli godzinowej (ostatni dzień
   przed przejściem na 15-min SDAC), a strona z raportami xlsx już nie działa. Wrzesień 2025 ma 29 dni
   i walidator stale zgłasza ten brak. Pobrano flagą `--pomin-braki` (pomija dni bez notowań w źródle).
3. Ceny z trzech źródeł to różne indeksy (Fixing I / xlsx / średnioważona) — porównania między
   okresami traktuj ostrożnie (TODO P0-5).
4. Od 1.10.2025 SDAC działa w 15-minutowych okresach rozliczeniowych; xlsx zawiera też kontrakty 15-min
   (`_Qhh:mm`), których na razie nie używamy.

Po każdym pobraniu/przetworzeniu danych uruchom `python3 waliduj_dane.py` (skill `waliduj-dane`).

## Zasady pracy

- Język projektu: **polski** (nazwy plików, komentarze, komunikaty CLI, docstringi). Tytuły na wykresach są po angielsku — trzymaj się tego, dopóki użytkownik nie zdecyduje inaczej.
- Styl kodu: jak w `pobierz_dane.py` — proste skrypty, `sys.argv`, docstring modułu z sekcją „Użycie”, adnotacje typów w sygnaturach.
- Skala kolorów heatmap jest **stała** (`VMIN=-100`, `VMAX=800`, `RDN_CMAP` w `generuj_heatmap.py`), żeby miesiące były porównywalne. Zmieniaj ją tylko tam.
- tge.pl to zewnętrzny serwis: zapytania sekwencyjnie z pauzą (`PAUSE_S`), bez równoległości, nie odświeżaj całego archiwum bez potrzeby.
- `pobierz_dane.py` odrzuca dzień bez notowań i dzień identyczny z poprzednim, a plik zapisuje atomowo — nie obchodź tych zabezpieczeń.
- Nie nadpisuj danych w repo bez sprawdzenia walidatora i `git diff`; nie edytuj `archiwum/`.
- Workflow commituje dane sam — lokalnie nie commituj i nie pushuj bez prośby użytkownika.

## Kontekst domenowy (zweryfikuj aktualne stawki przed użyciem)

Koszt energii w taryfie dynamicznej ≈ Σ_h zużycie_h × (cena_RDN_h + opłata/marża sprzedawcy)
+ akcyza + VAT; do tego opłaty dystrybucyjne OSD (zmienne i stałe), które zależą od taryfy
dystrybucyjnej (G11/G12…), a nie od sprzedawcy. Porównanie ma sens dla całego rachunku,
z profilem zużycia (standardowy profil lub dane z licznika).
