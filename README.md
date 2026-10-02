# taryfa-dynamiczna

**Kalkulator online: https://jakubgitcode.github.io/taryfa-dynamiczna/**

Porównanie G11 i modelowej taryfy dynamicznej, z opcjonalnym magazynem energii
oraz PV. Historyczne ceny TGE RDN i heatmapy są dostępne od stycznia 2025.

## Uruchomienie strony

Otwórz **index.html** w przeglądarce. Obok muszą być `formularz.css`,
`formularz.js`, `silnik.js` i `dane_rdn.js`. Nie potrzeba serwera, instalowania
pakietów ani połączenia z internetem.

1. Wybierz ciągły okres dostępnych danych.
2. Wpisz zużycie i własne ceny z faktury. Domyślne wartości są przykładowe.
3. Włącz magazyn i/lub PV oraz podaj parametry.
4. Kliknij **Zapisz i oblicz**. Ustawienia są zapisywane tylko w localStorage.
5. Porównaj koszty, składniki rachunku, miesiące i bilans wybranego dnia.

Zmiana formularza oznacza wyniki jako nieaktualne do następnego obliczenia.
Wyłączenie magazynu/PV usuwa dany wariant z porównania. Przy zablokowanym
localStorage obliczenia nadal działają. Reset wymaga ponownego zapisu.

## Co liczymy

- G11 i taryfę dynamiczną na identycznym profilu zużycia; opcjonalnie warianty
  dynamiczna + magazyn, dynamiczna + PV oraz dynamiczna + magazyn + PV.
- Energię, dystrybucję zmienną, akcyzę, VAT i opłaty stałe. Ceny G11 i RDN są
  bez akcyzy; opłaty wejściowe netto. Koszty inwestycji są brutto.
- Stan magazynu chronologicznie, z przenoszeniem między dobami, rezerwą,
  ograniczeniem obu mocy i stratami. Moce dotyczą strony AC; sprawność kierunku
  jest pierwiastkiem sprawności pełnego cyklu. Nie ma jednoczesnego ładowania
  i rozładowania ani sprzedaży energii z magazynu.
- Dwa modele magazynu opisane poniżej: przybliżenie dobowe i fizyczny bilans
  godzinowy. Podsumowanie inwestycji korzysta wyłącznie z bilansu godzinowego.
- PV zasila dom, potem magazyn, a nadwyżkę eksportujemy. **Eksport ma przychód
  0 zł**. Nie implementujemy jeszcze rozliczenia konkretnego net-billingu.
- Zmiana zapasu energii jest wyceniana osobno: `(SoC początkowy − końcowy) ×
  sprawność rozładowania × max(0, pierwsza stawka zakupu brutto)`. Korekta
  wchodzi do kosztu modelowego, ale nie jest płatnością na fakturze.
- Oszczędność samego magazynu porównujemy z dynamiczną bez magazynu; przy PV
  pokazujemy także przyrost korzyści względem PV bez magazynu.
- Szczegółowy prosty zwrot wymaga pełnego roku. Dodane podsumowanie inwestycji
  ekstrapoluje wynik okresu mnożnikiem 365/liczba dni i oznacza takie wyniki;
  sezonowość zużycia, cen i PV może istotnie zmienić tę prognozę. Oba ujęcia
  pomijają degradację, koszt kapitału i wymianę urządzeń.

## Dwa modele ładowania

Wpisz **X najtańszych godzin doby**. Wybór odbywa się osobno dla każdej doby;
interwały nie muszą być kolejne. Remisy rozstrzyga wcześniejszy numer interwału.
W dobie 23 h przy X=24 wybieramy wszystkie interwały, a powtórzone jesienne
etykiety zachowują oddzielne numery i ceny.

1. **Model prosty:** jeden wirtualny cykl na dobę. Wyznacza energię potrzebną
   do pokrycia dziennego poboru po bezpośrednim zużyciu PV, do granicy pojemności
   użytecznej i mocy rozładowania. Nadwyżka PV ładuje pierwsza, a resztę kupuje
   w X najtańszych interwałach, zaczynając od najtańszego, z limitem mocy i stratami.
   Energię oddaną przypisuje proporcjonalnie do pokrywalnego poboru; reszta
   jest kupowana bezpośrednio po cenach odpowiednich godzin. Pomija kolejność
   zdarzeń, początkowy SoC i zapas między dobami. Nie pokazuje fikcyjnego SoC.
2. **Bilans godzinowy:** rzeczywiste przepływy i SoC. W oknach ładuje tyle,
   ile uzasadnia droższe zużycie do końca doby. Prognoza uwzględnia ograniczoną
   moc późniejszych tańszych godzin i PV: kilka równych tanich godzin może być
   potrzebnych do przygotowania zapasu. Poza oknem doładowuje przy pustym
   zapasie lub cenie niższej od kosztu zgromadzonej energii, jeśli późniejszy
   pobór uzasadnia zakup po uwzględnieniu strat. Może kupić brakującą energię
   bezpośrednio. Nie musi wykorzystać każdego wybranego okna ani wyczerpać
   magazynu w ciągu doby. Nie ładuje i nie rozładowuje jednocześnie.

Model 2 jest heurystyką, nie globalnym optymalizatorem. Korzysta z cen i
modelowego zużycia/PV do końca bieżącej doby, bez podglądania kolejnego dnia.
Horyzont obejmujący następny dzień po publikacji cen pozostaje rozszerzeniem.

Tabela pokazuje dla obu modeli energię i koszt ładowania z sieci, koszt całych
zakupów, korektę zapasu i łączny koszt. Koszt ładowania obejmuje wszystkie
zmienne opłaty i VAT; średnia dotyczy pobranej kWh AC, nie kWh oddanej po stratach.
Opłaty stałe są uwzględnione tylko w łącznym koszcie. Różnica to **model 2 minus
model 1**. Model 1 nie jest gwarantowaną dolną granicą: pomija chronologię,
lecz ogranicza liczbę cykli. To porównanie przybliżeń, nie samodzielny pomiar
korzyści z aktywnego sterowania względem fizycznego sztywnego okna.

Rozwijane szczegóły doby zawierają wybrane okna, ceny RDN i brutto, ładowanie
z sieci/PV, rozładowanie, zakupy, zapas i koszty każdego interwału. Opis wskazuje
doładowania poza oknem i pierwsze dojście do rezerwy, jeśli wystąpiło.
Przycisk w tabeli miesięcznej otwiera pierwszy dostępny dzień tego miesiąca.

## Profil godzinowy

Opcja **Własne 24 wartości w kW** stosuje moce bez skalowania do zużycia rocznego:
energia interwału = moc × czas. Ten sam profil jest używany każdego dnia;
w dobie 23/25 h odpowiednia moc jest pomijana/powtarzana. Roczne pole zużycia
jest wtedy nieaktywne. Edycja, zapis i reset obejmują wszystkie 24 wartości.

Przykładowy profil z wieczornym szczytem daje dokładnie 21,7 kWh w dobie 24 h.
Presety zimowy i letni są ilustracyjnymi skalowaniami ×1,2 i ×0,75 tego profilu,
nie pomiarami ani automatycznym modelem sezonowym. Wszystkie wartości można edytować.

Dla dotychczasowych profili zużycie roczne dzielimy przez liczbę dni roku,
a dzienne przez wagi profilu w 23/24/25 interwałach. Produkcja PV ma modelowy
rozkład miesięczny i sinusoidalny profil dobowy. Część opłat stałych przypadająca
na dzień wynika z kalendarzowej liczby dni miesiąca.

## Dane i ograniczenia

CSV: `date,hour_from,hour_to,price_pln_per_mwh,volume_mwh`.
`date` oznacza dzień **dostawy**, nie dzień sesji.

| Dostawa | Źródło | Indeks |
|---|---|---|
| do 30.09.2025 | strona RDN TGE | Fixing I |
| 1.10–17.11.2025 | raporty XLSX w archiwum | cena raportu dnia dostawy |
| od 18.11.2025 | strona TGeBase | średnioważona godzinowa |

To trzy różne indeksy. Bez wskazania produktu sprzedawcy nie deklarujemy
zgodności z jego formułą rozliczenia. Porównanie między okresami jest orientacyjne.

Brakuje dostawy **2025-09-30**. Strona odrzuca okres obejmujący ten dzień;
można policzyć osobno okresy po obu stronach luki. Nie uzupełniamy jej cenami.

Eksporter zachowuje precyzję cen, kolejność źródłowych godzin i powtórzony
interwał jesienią. Wiosną pomija tylko znany pusty interwał źródłowy `1–2`.
Nowy układ godzin lub inna pusta cena blokuje eksport. Para dzień + numer
interwału identyfikuje wiersz jednoznacznie, ale **nie jest znacznikiem UTC**.
Etykiety TGE wykorzystujemy do modelowego profilu. Integracja z licznikiem
wymaga osobnej weryfikacji mapowania czasu, szczególnie w dniach zmiany czasu.
Rzeczywista doba TGeBase 25.10.2026 pozostaje do sprawdzenia po publikacji.

## Aktualizacja danych

Python 3.12, uruchamianie z katalogu głównego repo:

```bash
pip install -r requirements.txt
./start.sh                    # poprzedni miesiąc → walidacja → dane strony → heatmapy
./start.sh 3 2026             # wybrany miesiąc
./start.sh --tylko-eksport    # tylko istniejące CSV → dane strony; bez pobierania
python3 eksportuj_dane.py --sprawdz  # kontrola zgodności bez zapisu
```

`start.sh` używa `.venv/bin/python`, chyba że ustawiono `PYTHON`.
Eksporter czyta wyłącznie miesięczne CSV (bez surowych `*.xlsx.csv`), sprawdza
cały zakres i zapisuje `dane_rdn.js` atomowo. Dopuszcza wyłącznie udokumentowaną
lukę 2025-09-30; inne braki blokują aktualizację.

Pełną diagnostykę daje `python3 waliduj_dane.py`. Bez argumentów zgłasza także
znany brak 30.09 oraz brak końca surowego listopadowego `*.xlsx.csv` — plik ten
nie jest źródłem dla eksportera. Nie należy ignorować nowych błędów.

GitHub Actions 1. dnia miesiąca wykonuje pipeline i commituje CSV, PNG oraz
dane strony. Ręczne uruchomienie z `tylko_eksport=true` nie pobiera cen z TGE.
Testy PR i push sprawdzają silnik, DOM formularza, parsowanie, eksport i lint.
Workflow testów nie publikuje strony. Publikację hostowanej strony wykonuje się
osobno po zaakceptowaniu zmian.

## Testy developerskie

Node.js 24 i pnpm 11.19.0 potrzebne są tylko do testów; kod strony nie ma
zależności runtime. jsdom to wyłącznie środowisko testowania DOM.

```bash
pip install -r requirements-dev.txt
pnpm install --frozen-lockfile --ignore-scripts
pnpm test
python -m pytest -q
python -m ruff check .
python3 eksportuj_dane.py --sprawdz
bash -n start.sh work_now.sh
```

Na vboxsf zależności Node należy umieścić poza udziałem:
`pnpm install --frozen-lockfile --ignore-scripts --modules-dir /tmp/taryfa-node_modules
--store-dir /tmp/taryfa-pnpm-store`, a testy uruchomić przez
`NODE_PATH=/tmp/taryfa-node_modules node --test testy/*.test.js`.
Instrukcja tworzenia środowiska Pythona na vboxsf znajduje się w AGENTS.md.

Testy obejmują bilans energii, ograniczenia magazynu, ceny ujemne, dobę 23/25 h,
rok przestępny, luki, granice źródeł, parser HTML/XLSX i zapis/reset formularza.
jsdom nie sprawdza renderowania CSS. Wygląd na desktopie/telefonie i obsługa
klawiaturą wymagają osobnego odbioru w rzeczywistej przeglądarce.

`kalkulator.html` i `przygotuj_kalkulator.py` pozostają wcześniejszym prototypem.
Nowy pipeline aktualizuje `dane_rdn.js`, a nie dane osadzone w prototypie.
