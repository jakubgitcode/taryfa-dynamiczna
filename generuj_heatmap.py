"""
Skrypt do generowania heatmapy z danych TGE RDN.

Użycie:
    python generuj_heatmap.py <plik_csv>

Przykłady:
    python generuj_heatmap.py tge_rdn_hourly_2025-03.csv
    python generuj_heatmap.py tge_rdn_hourly_2025-12.csv

Plik CSV powinien mieć kolumny:
    date, hour_from, hour_to, price_pln_per_mwh, volume_mwh
"""
import sys
import calendar

import pandas as pd
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.colors import LinearSegmentedColormap

# Stała skala kolorów, żeby miesiące były porównywalne
VMIN, VMAX = -100, 800

# Niestandardowa paleta kolorów:
# fioletowy (ujemne) -> zielony (0-400) -> żółty (400-600) -> czerwony (>600)
colors = [
    (0.5, 0.0, 0.5),    # fioletowy dla ujemnych (-100)
    (0.0, 0.5, 0.0),    # ciemnozielony (0)
    (0.0, 0.8, 0.0),    # zielony (200)
    (0.5, 1.0, 0.0),    # żółtozielony (400)
    (1.0, 1.0, 0.0),    # żółty (500)
    (1.0, 0.5, 0.0),    # pomarańczowy (600)
    (1.0, 0.0, 0.0),    # czerwony (800)
]
# Pozycje kolorów w zakresie 0-1 (mapowane na -100 do 800)
positions = [0.0, 0.111, 0.333, 0.556, 0.667, 0.778, 1.0]
RDN_CMAP = LinearSegmentedColormap.from_list('custom_rdn', list(zip(positions, colors)))


def text_color(val: float) -> str:
    # Fioletowy (ujemne) i pomarańczowy/czerwony (>600) - biały tekst, reszta - czarny
    return 'white' if val < 0 or val > 600 else 'black'


def load_pivot(csv_file: str) -> pd.DataFrame:
    """Wczytuje CSV i zwraca tabelę dzień × godzina z cenami."""
    df = pd.read_csv(csv_file)
    df['date'] = pd.to_datetime(df['date'])
    df['day'] = df['date'].dt.day
    # Obsłuż duplikaty (np. zmiana czasu - 25h w październiku) - bierzemy średnią
    df = df.groupby(['day', 'hour_from'], as_index=False).agg({'price_pln_per_mwh': 'mean'})
    # Pivot table: days as rows, hours as columns
    return df.pivot(index='day', columns='hour_from', values='price_pln_per_mwh').reindex(columns=range(24))


def draw_values(ax, pivot: pd.DataFrame, fontsize: float):
    for i in range(len(pivot.index)):
        for j in range(24):
            val = pivot.values[i, j]
            if not np.isnan(val):
                ax.text(j, i, f'{val:.0f}', ha='center', va='center',
                        fontsize=fontsize, color=text_color(val))


def generate_heatmap(csv_file: str):
    # Wczytaj dane
    pivot = load_pivot(csv_file)

    # Wyciągnij rok i miesiąc z danych
    first = pd.to_datetime(pd.read_csv(csv_file, usecols=['date'], nrows=1)['date'].iloc[0])
    year, month = first.year, first.month
    month_name = calendar.month_name[month]
    month_str = f"{year}-{month:02d}"

    # Create heatmap
    fig, ax = plt.subplots(figsize=(14, 10))

    im = ax.imshow(pivot.values, aspect='auto', cmap=RDN_CMAP, vmin=VMIN, vmax=VMAX)

    # Set labels
    ax.set_xticks(np.arange(24))
    ax.set_xticklabels([f'{h}-{h+1}' for h in range(24)])
    ax.set_yticks(np.arange(len(pivot.index)))
    ax.set_yticklabels([f'{month_name[:3]} {d}' for d in pivot.index])

    ax.set_xlabel('Hour')
    ax.set_ylabel('Day')
    ax.set_title(f'TGE RDN Hourly Prices - {month_name} {year} (PLN/MWh)')

    # Add colorbar
    cbar = plt.colorbar(im, ax=ax)
    cbar.set_label('Price (PLN/MWh)')

    # Add values in cells
    draw_values(ax, pivot, fontsize=6)

    plt.tight_layout()

    heatmap_file = f'tge_rdn_heatmap_{month_str}.png'
    plt.savefig(heatmap_file, dpi=150)
    print(f"Saved: {heatmap_file}")
    plt.close()

    return heatmap_file


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    csv_file = sys.argv[1]
    generate_heatmap(csv_file)
