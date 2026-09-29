# taryfa-dynamiczna
oplacalnosc taryfy dynamicznej

Godzinowe ceny energii z Rynku Dnia Następnego TGE (RDN) od stycznia 2025 i heatmapy dzień × godzina
(`tge_rdn_heatmap_YYYY-MM.png`, zbiorczo za rok: `tge_rdn_heatmap_<rok>_all.png` i `_column.png`).
Nowy miesiąc dociąga automatycznie GitHub Actions (`.github/workflows/aktualizuj-dane.yml`, 1. dnia miesiąca).

## Użycie

```bash
pip install -r requirements.txt       # Python 3.12
./start.sh                            # poprzedni miesiąc: pobierz → waliduj → heatmapy
./start.sh 3 2026                     # wybrany miesiąc
```

Pojedyncze kroki: `pobierz_dane.py <miesiąc> [rok]`, `waliduj_dane.py [csv…]`,
`generuj_heatmap.py <csv>`, `generuj_rok.py <rok>`.

## Dane

`tge_rdn_hourly_YYYY-MM.csv`: `date,hour_from,hour_to,price_pln_per_mwh,volume_mwh`, gdzie `date` to **data dostawy**.

| Dostawa | Źródło | Cena |
|---|---|---|
| do 30.09.2025 | strona RDN tge.pl (stare API) | Fixing I |
| 1.10–17.11.2025 | raporty xlsx TGE z `archiwum/` | cena z raportu dnia dostawy |
| od 18.11.2025 | strona „TGeBase i średnioważone ceny godzinowe” (nowe API) | średnioważona godzinowa |

Ceny z różnych okresów to różne indeksy, więc mogą mieć drobne przekłamanie cenowe — chodziło bardziej
o poznanie wizualne rozkładu cen w ciągu dnia.

Do września 2026 daty w CSV były datami sesji zamiast dostawy (przesunięcie o jeden dzień, bo strona TGE
dla `date_start=D` pokazuje ceny dostawy D+1). Dane zostały pobrane ponownie z poprawnymi datami.
