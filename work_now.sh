#!/usr/bin/env bash
# Plan wdrożenia, aktualizacja: 2026-10-02.
# Uruchomienie: bash work_now.sh — wyświetla plan, nie wykonuje wdrożenia.
# Oznaczenia: [x] wykonane, [ ] do wykonania.
cat <<'PLAN'
STATUS WDROŻENIA (2026-10-02)
Działa wersja podstawowa offline: formularz → silnik → dane → wyniki.
Lokalnie przechodzi 16 testów silnika, 9 testów DOM i 15 testów Pythona,
ruff, eksport danych i kontrola zgodności wygenerowanego pliku.
Etapy połączono w jeden spójny PR, aby nie tworzyć zależnych gałęzi:
https://github.com/jakubgitcode/taryfa-dynamiczna/pull/1
Testy PR: sukces — https://github.com/jakubgitcode/taryfa-dynamiczna/actions/runs/36995070564
Eksport CI: sukces — https://github.com/jakubgitcode/taryfa-dynamiczna/actions/runs/36995090280
Pozostałe pozycje [ ] wymagają przeglądarki, konkretnej umowy, przyszłych
notowań lub odbioru PR. Rozszerzenia na końcu nie należą do wersji podstawowej.

CEL
Kalkulator działający lokalnie w przeglądarce: formularz → symulacja
chronologiczna → porównanie kosztów. Python służy do przygotowania danych.
Każdy etap kończymy działającym przyrostem, testami i aktualizacją TODO.md.

STAN POCZĄTKOWY
[x] index.html, formularz.css, formularz.js: formularz, podsumowanie parametrów,
    opcjonalny magazyn/PV, walidacja oraz zapis i odczyt localStorage.
[x] Statyczna kontrola identyfikatorów HTML, etykiet, zasobów i git diff --check.
[ ] Weryfikacja wizualna i interakcyjna formularza w przeglądarce.
    Poprzednia próba podglądu file:// została zablokowana przez politykę
    narzędzia przeglądarkowego. Nie obchodzić blokady; użyć dozwolonej ścieżki
    weryfikacji lub jasno przekazać użytkownikowi pozostałą kontrolę ręczną.
    kalkulator.html pozostaje wcześniejszym prototypem, nie wzorcem poprawności.

1. PRZYGOTOWANIE PRACY
[x] Sprawdzić status, diff, gałąź i remote; zachować istniejące lokalne zmiany.
    Oddzielić zmiany tego zadania od ewentualnych zmian użytkownika.
[x] Sprawdzić dostępność Node.js, Pythona 3.12 oraz narzędzi testowych.
    Brak node w PATH był odnotowany przy tworzeniu formularza.
[x] Ustalić komendy uruchamiania i testów w README, przypiąć zależności
    developerskie; działanie strony nie może wymagać Node ani Pythona.
[x] Przygotować gałąź codex/… i małe PR-y zgodnie z etapami poniżej.
    Użytkownik zezwolił w tej rozmowie na testy, PR-y i uruchamianie workflow.
    Nie zakładać na tej podstawie zgody na merge ani publiczne wdrożenie.

2. DOKOŃCZENIE FORMULARZA — PR 1
[ ] Sprawdzić desktop, wąski ekran, klawiaturę, etykiety i komunikaty błędów.
[x] Sprawdzić: puste/ujemne wartości, zakresy procentowe, początkowy SoC
    poniżej minimum, wyłączenie magazynu/PV, ponowne włączenie sekcji.
[x] Sprawdzić zapis, przeładowanie, reset, uszkodzony zapis i niedostępny storage.
[x] Ustalić wersjonowany format konfiguracji i walidację niezależną od DOM,
    używaną także przez przyszły silnik; nie zamieniać błędnych danych na zera.
[x] Doprecyzować jednostki, netto/brutto, akcyzę, koszty inwestycji oraz
    znaczenie SoC. Wartości przykładowe nie są aktualną ofertą sprzedawcy.
    Gotowe: konfiguracja daje się poprawnie zapisać i odtworzyć; na tym etapie
    strona nie pokazuje wyników kosztowych ani zwrotu inwestycji.

3. KONTRAKT DANYCH I ZAŁOŻENIA OBLICZEŃ
[x] Zdefiniować interwał: jednoznaczny czas, długość w godzinach, cena PLN/MWh,
    źródło/indeks i status jakości. Zachować kolejność dostawy i Europe/Warsaw.
[ ] Zweryfikować mapowanie oznaczeń TGE na czas przed przypisaniem UTC;
    rozróżnić powtórzone godziny. Doba 23/25 h nie może stać się sztuczną dobą 24 h.
[x] Określić zasady okresu obliczeń, luk, niepełnych lat oraz normalizacji
    zużycia i PV. Nie przenosić SoC przez nieznaną lukę bez jawnej polityki.
[ ] Sprawdzić w aktualnych źródłach pierwotnych indeks właściwy dla wybranego
    produktu dynamicznego. Gdy nie wybrano produktu, oznaczyć model RDN jako
    przybliżenie, bez deklarowania zgodności z rzeczywistą fakturą.
[x] Zdefiniować po której stronie magazynu mierzymy moce, energię i sprawność,
    jak rozdzielamy straty cyklu oraz rozliczamy energię początkową i końcową.
    Gotowe: udokumentowany kontrakt wejścia/wyjścia i syntetyczne przykłady,
    które można policzyć ręcznie; silnik nie zależy od struktury formularza.

4. CHRONOLOGICZNY SILNIK JAVASCRIPT — PR 2
[x] Wydzielić czyste funkcje obliczeniowe działające w przeglądarce i testach.
[x] Policzyć warianty G11 i dynamiczna bez magazynu na identycznym zużyciu.
[x] Dodać bilans magazynu dla każdego interwału: SoC, minimum i maksimum,
    ładowanie, rozładowanie, straty, import oraz przenoszenie SoC między dobami.
[x] Ograniczyć oba kierunki mocą × czas interwału; wykluczyć jednoczesne
    ładowanie i rozładowanie. Energia z przyszłości nie pokrywa wcześniejszego poboru.
[x] Dodać harmonogram z cen znanych na etapie planowania; jasno opisać
    horyzont i założenia prognoz. Uwzględnić straty przy wyborze arbitrażu;
    pozwolić na brak cyklu, jeśli ładowanie nie daje korzyści.
[x] Dodać PV: bezpośrednia autokonsumpcja, ładowanie nadwyżką w granicach mocy,
    eksport lub ograniczenie produkcji. Obsłużyć również PV bez magazynu.
[x] Do czasu weryfikacji zasad rozliczenia nie przedstawiać prostego przychodu
    cena RDN × eksport jako wiernego modelu net-billingu.
[x] Testy: bilans energii, granice SoC, moce, sprawność 100% i straty,
    ceny stałe/ujemne, brak zużycia/PV/magazynu, ograniczona pojemność,
    tani wieczór i drogi poranek, północ, interwały 0,25/1 h, doby 23/25 h.
[x] Porównać małe przykłady z niezależnym ręcznym wyliczeniem; sprawdzić,
    że saldo początkowe i końcowe nie tworzy pozornej oszczędności.
    Gotowe: testy fizyki i kosztów przechodzą bez dostępu do TGE i sieci.

5. DANE HISTORYCZNE W PRZEGLĄDARCE — PR 3
[x] Użyć skilla waliduj-dane i uruchomić walidator przed analizą/konwersją.
    Zachować jawną lukę 2025-09-30; inne błędy blokują generowanie wyników.
[x] Przygotować osobny eksport danych do nowej strony z CSV i metadanymi,
    bez zaokrąglania cen do pełnych PLN/MWh, uśredniania powtórzeń lub
    interpolowania nieoczekiwanych braków. Nie zmieniać archiwum/*.xlsx.
[x] Zapewnić otwieranie index.html offline, np. lokalnym plikiem danych JS,
    bez fetch wymagającego serwera. Generator zapisuje wynik atomowo.
[x] Pokazać zakres danych, pokrycie, źródła i luki; pozwolić wybrać okres.
    Luka nie może po cichu zmniejszać rachunku lub zwiększać produkcji PV.
[x] Testy eksportera: format, źródła, zmiany czasu, znana luka, odrzucanie
    nowych błędów, zgodność wyeksportowanych cen z CSV, deterministyczny wynik.
[x] Po przetworzeniu ponownie uruchomić walidator i sprawdzić git diff.
    Gotowe: strona uruchamia silnik na lokalnych danych z jawną jakością.

6. WYNIKI I INTERAKCJE — PR 4
[x] Połączyć zatwierdzony formularz, wybór okresu i silnik; dodać obsługę
    błędów, stan obliczania i oznaczenie nieaktualnych wyników po zmianie pól.
[x] Pokazać porównanie scenariuszy, miesięczne koszty, import/eksport,
    straty i przebieg SoC wybranego dnia, wraz z czytelną tabelą wyników.
[x] Rozdzielić koszt energii, dystrybucję, akcyzę, VAT i opłaty stałe;
    nie dublować opłat już zawartych w danych wejściowych.
[x] Liczyć oszczędność samego magazynu względem dynamicznej bez magazynu,
    a oszczędność całego scenariusza osobno względem G11.
[x] Dla niepełnego roku pokazać wynik za dostępny okres. Nie mnożyć
    sezonowych oszczędności przez 365/liczba_dni jako podstawy zwrotu.
[x] Prosty zwrot oznaczyć jako uproszczony; przy braku oszczędności nie
    pokazywać ujemnej liczby lat. Degradację i dyskonto dodać jako jawne
    założenia kolejnego wariantu analizy inwestycji.
[ ] Testy integracyjne: zmiana formularza → wynik, wyłączone warianty,
    przeładowanie konfiguracji, błędy danych, mobile i klawiatura.
    Gotowe: pełny przepływ działa offline, bez backendu i ukrytych założeń.

7. TESTY W CI I AKTUALIZACJA MIESIĘCZNA — PR 5
[x] Dodać workflow PR: testy JS, testy eksportera/parserów/walidatora,
    ruff dla aktualnych skryptów oraz testy strony, jeśli runner je obsługuje.
    Nie obejmować zapisów czatu *.py kontrolą składni programu.
[x] Rozdzielić deterministyczne testy na fixture'ach od pobierania z TGE.
[x] Włączyć eksport nowej strony do start.sh po walidacji wymaganych danych;
    uwzględnić cały zestaw używany przez eksport, nie tylko nowy miesiąc.
[x] Zaktualizować workflow aktualizacji: commit danych strony i metadanych
    obok CSV/PNG. Zachować sekwencyjne pobieranie, retry i atomowy zapis.
[x] Najpierw uruchomić lokalnie testy i eksport na istniejących CSV.
    Sprawdzić powtórne generowanie bez zmian i zachowanie przy błędzie.
[x] Wysłać PR-y, uruchomić odpowiednie workflow na właściwej gałęzi,
    sprawdzić logi i wyniki; nie uruchamiać pełnego pobierania archiwum.
    Workflow z automatycznym commitem najpierw sprawdzić na gałęzi testowej.
[x] Zdiagnozować harmonogram: domyślna gałąź, aktywność workflow, zdarzenia
    i historia uruchomień. Ręczny sukces nie dowodzi działania harmonogramu.
    Gotowe: lokalne kontrole i CI przechodzą dla aktualnej wersji zmian.

8. ODBIÓR I DOKUMENTACJA
[x] Dla każdego PR: konkretny zakres, założenia i wykonane testy; poprawić
    wykryte regresje i ponownie sprawdzić zmieniony zakres.
[x] Zaktualizować README, AGENTS.md i TODO.md: start offline, przygotowanie
    danych, komendy testów, ograniczenia indeksów i status starszego prototypu.
[x] Dostarczyć linki do strony/plików, PR-ów i przebiegów CI oraz listę
    ewentualnych ograniczeń; nie oznaczać niewykonanych kontroli jako zaliczone.
[ ] Po udostępnieniu dostawy 2026-10-25 zweryfikować rzeczywistą dobę 25 h
    z TGeBase. Do tego czasu pokryć przypadek fixture'ami i pozostawić kontrolę
    rzeczywistych danych otwartą; nie pobierać przyszłego dnia.

DWA MODELE ŁADOWANIA — KOLEJNY ETAP PO MERGE PR #1
[x] Jawne X najtańszych godzin i stabilny wybór oddzielnych interwałów DST.
[x] Model 1: jeden cykl dobowy bez chronologii, z pojemnością, mocą i stratami.
[x] Model 2: bilans godzinowy, planowanie z ograniczeniem mocy i doładowanie
    przed droższym poborem. Horyzont pozostaje do końca bieżącej doby.
[x] Porównanie kosztu ładowania oraz całego kosztu obu modeli, bez fikcyjnego SoC.
[x] Wspólny profil: 24 edytowalne moce, przykładowe presety, zapis i reset.
[x] Szczegóły doby z tabeli miesiąca: ceny, przepływy, koszty i opis działania.
[x] Zachowane podsumowanie inwestycji dodane na main; korzysta tylko z modelu 2.
[x] Testy lokalne: 33 silnika/modeli + 14 DOM + 15 Python; lint i eksport danych.
[ ] Weryfikacja UI w rzeczywistej przeglądarce; jsdom nie ocenia renderowania.
[ ] Rozszerzenie horyzontu o następną dobę po potwierdzonej publikacji cen.

NASTĘPNE ROZSZERZENIA (PO DZIAŁAJĄCEJ WERSJI PODSTAWOWEJ)
[ ] Profil zużycia z CSV OSD, PVGIS, G12/G12w i zweryfikowane net-billing.
[ ] Degradacja, koszt kapitału, wrażliwość wyniku i graniczna cena magazynu.
[ ] Dane 15-minutowe, przesuwanie zużycia EV/pompy/bojlera i wariant z agregatem.
[ ] Porządki katalogów i usunięcie przestarzałych plików w osobnym zakresie.
PLAN
