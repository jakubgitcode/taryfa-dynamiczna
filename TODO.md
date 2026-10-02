# TODO — taryfa-dynamiczna

Kontekst i zasady: `AGENTS.md`. Walidator danych: `python3 waliduj_dane.py`.
Na górze to, co zostało; na dole skrót tego, co już zrobione.

## Nowa strona (przeglądarka)

- [x] Formularz offline, walidacja, opcjonalny magazyn/PV, zapis/reset localStorage.
- [x] Chronologiczny silnik JS: bilans, SoC, oba limity mocy, sprawność, przenoszenie między dobami.
- [x] Testy obliczeń i DOM formularza, parserów HTML/XLSX oraz walidacji/eksportu.
- [x] Zwalidowane ceny offline z metadanymi źródeł, bez uśredniania 25. godziny i interpolacji luk.
- [x] Porównanie wariantów, miesięczne koszty, składniki rachunku i bilans wybranego dnia.
- [x] Oszczędność magazynu względem dynamicznej bez magazynu; pełny rok wymagany do prostego zwrotu.
- [x] Opłaty stałe, jawna korekta zapasu początkowego/końcowego oraz oznaczanie nieaktualnych wyników.
- [ ] Odbiór wizualny na komputerze/telefonie i ręczna kontrola klawiatury w przeglądarce.
      Testy jsdom sprawdzają zachowanie DOM, nie renderowanie CSS.
- [ ] Zweryfikowane mapowanie etykiet TGE na czas licznika przed importem profilu OSD.
- [ ] Akceptacja PR i publikacja strony (osobny etap po przeglądzie).

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

- [x] Nowy eksporter `eksportuj_dane.py` jest częścią `start.sh` i CI; `dane_rdn.js` odświeża się z heatmapami.
      Starszy `kalkulator.html` pozostaje zamrożonym prototypem. Publikacja hostowanej strony jest osobna.
- [x] Nowa strona uwzględnia łączną miesięczną opłatę stałą z formularza (w tym wpisaną opłatę mocową).
### Modele ładowania magazynu (`index.html` + `silnik.js`)

Ceny RDN na dobę D są znane w dniu D-1, więc harmonogram ładowania można ustalić z 24 h wyprzedzeniem —
na danych historycznych liczymy dokładnie tak, jakbyśmy je wtedy znali. To nie jest wróżenie z przyszłości.

- [ ] **Ładowanie przez X najtańszych godzin doby** jako jawny parametr (dziś liczba godzin wynika pośrednio
      z mocy ładowania). Pokazywać, które godziny wypadły — zimą zwykle 1:00–5:00, latem 10:00–15:00
      (dolina cen od fotowoltaiki).
- [ ] **Model 1 — prosty.** Koszt = energia naładowana w tych X godzinach × ceny tych godzin. Bez sprawdzania,
      czy zapas wystarczy na konkretną godzinę doby. Punkt odniesienia i górna granica optymizmu.
- [ ] **Model 2 — bilans godzina po godzinie.** Symulacja stanu naładowania: zużycie zjada zapas, a gdy się
      skończy (typowo zimą około 13:00, przy drogim prądzie), model decyduje między:
      (a) dokupieniem brakujących kWh po bieżącej cenie, a
      (b) doładowaniem magazynu na zapas, jeśli znane ceny kolejnych godzin są wyższe —
      np. o 13:00 widać, że do 20:00 cena tylko rośnie, więc dokupujemy wtedy 6 kWh z góry.
      Decyzja na podstawie cen znanych do końca doby (a po publikacji — także następnej),
      z uwzględnieniem mocy ładowania, wolnej pojemności i strat.
- [ ] **Porównanie obu modeli** w wynikach — różnica pokazuje, ile kosztuje uproszczenie i czy warto
      sterować magazynem aktywnie, czy wystarczy sztywne okno nocne.
- [ ] **Rozwijane szczegóły dla pojedynczej doby.** Tabela: godzina, cena RDN, cena po opłatach, zużycie,
      ładowanie/rozładowanie, stan magazynu, zakup z sieci, koszt godziny — plus krótki opis słowny,
      co w tej dobie robimy („ładujemy 1:00–5:00 po 180 zł/MWh, zapas kończy się o 13:00, dokupujemy
      6 kWh przed wieczornym szczytem”). Do klikania z tabeli miesięcznej.

- [ ] Degradacja magazynu (np. −2%/rok) i koszt kapitału — bez tego prosty zwrot jest zbyt optymistyczny.
- [ ] Import profilu zużycia z licznika (CSV z portalu OSD) zamiast profilu modelowego.
- [ ] Produkcja PV z realnych danych (PVGIS dla lokalizacji) zamiast modelu sinusoidalnego.
- [ ] G12/G12w jako dodatkowy punkt odniesienia obok G11.
- [ ] Scenariusz z agregatem (koszt paliwa zł/kWh, motogodziny) — wariant „zamiast magazynu”.
- [ ] Scenariusze przesuwania zużycia: EV, pompa ciepła, bojler (ile kWh da się przenieść w tanie godziny).
- [ ] Odwrócone pytanie: przy jakiej cenie magazynu (zł/kWh) zwrot schodzi poniżej 10 lat.
- [ ] Sprawdzić, czy i na jakich zasadach opłaca się oddawać energię z magazynu do sieci (net-billing).

## Automatyzacja

- [x] Harmonogram CI: przebieg `schedule` 1.10.2026 wystartował o 13:10 UTC i zakończył się sukcesem.
      [Przebieg 36866818782](https://github.com/jakubgitcode/taryfa-dynamiczna/actions/runs/36866818782).
- [x] Workflow testów PR/push: Node + jsdom, pytest, ruff, zgodność danych i eksport bez pobierania.
- [x] Testy PR oraz ręczny eksport przeszły na gałęzi `codex/kalkulator-przegladarka`.
      [PR #1](https://github.com/jakubgitcode/taryfa-dynamiczna/pull/1),
      [testy](https://github.com/jakubgitcode/taryfa-dynamiczna/actions/runs/36995070564),
      [eksport](https://github.com/jakubgitcode/taryfa-dynamiczna/actions/runs/36995090280).

## Kod i porządki

- [ ] Usunąć zastąpione pliki: `all.png.py`, `all_column.py` (zapisy czatu), `miesac.py`,
      `miesac-stary-format.py` (mają stary błąd dat), `run_year_2025.py` (pusty), `old/`.
- [ ] `pliki.py` (zapis czatu) → prawdziwy `pobierz_archiwum.py` (xlsx z `https://tge.pl/RDN_instrumenty_15`;
      uwaga: ten adres przestał zwracać listę plików — sprawdzić, gdzie TGE trzyma raporty teraz).
- [x] Przypięte wersje w `requirements.txt`, `requirements-dev.txt`, `package.json` i lockfile pnpm.
- [ ] Usunąć zepsute `myvenv/`.
- [ ] Git na vboxsf: `git config core.fileMode false` i `safe.directory` dla tej ścieżki.
- [ ] Zdecydować o `*.xlsx.csv` (surowe wyjście konwertera — te same dane są w miesięcznych CSV).
- [ ] Uporządkować katalogi: `dane/` (CSV), `wykresy/` (PNG), `archiwum/` (xlsx), kod w `skrypty/` lub pakiecie.
- [ ] `argparse` zamiast ręcznego parsowania `sys.argv`; domyślny rok w `konwertuj_excel.py` (wciąż 2025).
- [ ] Tryb „dociągnij tylko brakujące dni” w `pobierz_dane.py`.
- [x] Testy parserów na syntetycznych fragmentach HTML, liczb PL, XLSX 26.10.2025 (H02a),
      walidatora i eksportera; dodatkowe przypadki rozbudowywać przy zmianach formatów źródłowych.
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
