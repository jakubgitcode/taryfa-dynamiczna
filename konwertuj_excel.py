#!/usr/bin/env python3
"""
Konwertuje pliki Excel z archiwum TGE na format CSV zgodny z pobierz_dane.py
Użycie: python konwertuj_excel.py <miesiac> [rok]
Przykład: python konwertuj_excel.py 10 2025
"""

import sys
import os
import re
import csv
import pandas as pd

def parse_excel_file(filepath):
    """Parsuje plik Excel i zwraca listę (data, godzina, cena)"""
    df = pd.read_excel(filepath, sheet_name='WYNIKI', header=None)
    
    results = []
    for i in range(df.shape[0]):
        row = df.iloc[i]
        instrument = row[1]
        granulacja = row[2]
        cena = row[3]
        
        # Szukamy wierszy godzinowych (granulacja 60, nazwa z _H)
        if pd.notna(instrument) and pd.notna(granulacja) and granulacja == 60:
            match = re.match(r'(\d{2})-(\d{2})-(\d{2})_H(\d{2})', str(instrument))
            if match:
                day, month, year_short, hour = match.groups()
                year = f"20{year_short}"
                date_str = f"{year}-{month}-{day}"
                hour_int = int(hour)
                
                # Cena może być liczbą lub NaN
                price = float(cena) if pd.notna(cena) else None
                results.append((date_str, hour_int, price))
    
    return results

def main():
    if len(sys.argv) < 2:
        print("Użycie: python konwertuj_excel.py <miesiac> [rok]")
        print("Przykład: python konwertuj_excel.py 10 2025")
        sys.exit(1)
    
    month = int(sys.argv[1])
    year = int(sys.argv[2]) if len(sys.argv) > 2 else 2025
    
    archiwum_dir = "archiwum"
    month_str = f"{month:02d}"
    
    # Znajdź wszystkie pliki Excel dla danego miesiąca
    pattern = re.compile(rf'Raport_RDN_dzie_dostawy_delivery_day_{year}_{month_str}_\d+.*\.xlsx')
    files = sorted([f for f in os.listdir(archiwum_dir) if pattern.match(f)])
    
    if not files:
        print(f"Nie znaleziono plików dla miesiąca {month_str}/{year} w katalogu {archiwum_dir}")
        sys.exit(1)
    
    print(f"Znaleziono {len(files)} plików dla {month_str}/{year}")
    
    # Zbierz wszystkie dane
    all_data = []
    for filename in files:
        filepath = os.path.join(archiwum_dir, filename)
        print(f"  Przetwarzam: {filename}...", end=" ")
        try:
            data = parse_excel_file(filepath)
            print(f"{len(data)} godzin")
            all_data.extend(data)
        except Exception as e:
            print(f"BŁĄD: {e}")
    
    # Sortuj po dacie i godzinie
    all_data.sort(key=lambda x: (x[0], x[1]))
    
    # Zapisz do CSV (format zgodny z pobierz_dane.py)
    output_file = f"tge_rdn_hourly_{year}-{month_str}.xlsx.csv"
    with open(output_file, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['date', 'hour_from', 'hour_to', 'price_pln_per_mwh', 'volume_mwh'])
        for date, hour, price in all_data:
            hour_from = hour - 1  # godzina 1 = przedział 0-1
            hour_to = hour
            price_str = f"{price:.2f}" if price is not None else ""
            writer.writerow([date, hour_from, hour_to, price_str, ""])
    
    print(f"\nZapisano {len(all_data)} rekordów do {output_file}")
    
    # Statystyki
    prices = [p for _, _, p in all_data if p is not None]
    if prices:
        print(f"Ceny: min={min(prices):.2f}, max={max(prices):.2f}, średnia={sum(prices)/len(prices):.2f}")

if __name__ == "__main__":
    main()
