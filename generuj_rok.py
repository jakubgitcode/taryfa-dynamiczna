"""
Skrypt do generowania zbiorczej heatmapy roku z miesięcznych plików tge_rdn_hourly_<rok>-MM.csv.

Użycie:
    python generuj_rok.py <rok> [--uklad siatka|kolumna]

Przykłady:
    python generuj_rok.py 2025                   # oba układy
    python generuj_rok.py 2026 --uklad siatka    # tylko tge_rdn_heatmap_2026_all.png

Układy:
    siatka   4×3 miesiące  -> tge_rdn_heatmap_<rok>_all.png
    kolumna  miesiące pod sobą -> tge_rdn_heatmap_<rok>_column.png

Brakujące miesiące są pomijane (w siatce zostaje puste pole).
"""
import os
import sys
import calendar

import matplotlib.pyplot as plt
import numpy as np

from generuj_heatmap import RDN_CMAP, VMIN, VMAX, load_pivot, draw_values


def load_year(year: int) -> dict:
    pivots = {}
    for month in range(1, 13):
        csv_file = f'tge_rdn_hourly_{year}-{month:02d}.csv'
        if os.path.exists(csv_file):
            pivots[month] = load_pivot(csv_file)
    return pivots


def draw_month(ax, pivot, title: str, tick_fs: tuple[float, float], label_fs: float, title_fs: float, value_fs: float):
    im = ax.imshow(pivot.values, aspect='auto', cmap=RDN_CMAP, vmin=VMIN, vmax=VMAX)
    ax.set_xticks(np.arange(24))
    ax.set_xticklabels([f'{h}' for h in range(24)], fontsize=tick_fs[0])
    ax.set_yticks(np.arange(len(pivot.index)))
    ax.set_yticklabels([f'{d}' for d in pivot.index], fontsize=tick_fs[1])
    ax.set_xlabel('Hour', fontsize=label_fs)
    ax.set_ylabel('Day', fontsize=label_fs)
    ax.set_title(title, fontsize=title_fs, fontweight='bold')
    draw_values(ax, pivot, fontsize=value_fs)
    return im


def grid(year: int, pivots: dict):
    fig, axes = plt.subplots(4, 3, figsize=(24, 28))
    fig.suptitle(f'TGE RDN Hourly Prices - {year} (PLN/MWh)', fontsize=20, fontweight='bold')

    im = None
    for idx, month in enumerate(range(1, 13)):
        ax = axes[idx // 3, idx % 3]
        title = f'{calendar.month_name[month]} {year}'
        if month not in pivots:
            ax.set_title(f'{title} - no data', fontsize=12, fontweight='bold')
            ax.axis('off')
            continue
        im = draw_month(ax, pivots[month], title, tick_fs=(6, 6), label_fs=8, title_fs=12, value_fs=4)

    cbar = fig.colorbar(im, ax=axes, orientation='horizontal', fraction=0.02, pad=0.04)
    cbar.set_label('Price (PLN/MWh)', fontsize=12)

    plt.tight_layout(rect=[0, 0.03, 1, 0.97])
    out = f'tge_rdn_heatmap_{year}_all.png'
    plt.savefig(out, dpi=150)
    plt.close()
    print(f'Saved: {out}')


def column(year: int, pivots: dict):
    months = sorted(pivots)
    fig, axes = plt.subplots(len(months), 1, figsize=(20, 70 * len(months) / 12), squeeze=False)
    fig.suptitle(f'TGE RDN Hourly Prices - {year} (PLN/MWh)', fontsize=24, fontweight='bold', y=0.995)

    for ax, month in zip(axes[:, 0], months):
        im = draw_month(ax, pivots[month], f'{calendar.month_name[month]} {year}',
                        tick_fs=(8, 7), label_fs=10, title_fs=14, value_fs=5)

    # Colorbar na dole
    cbar = fig.colorbar(im, ax=axes, orientation='horizontal', fraction=0.01, pad=0.02, aspect=50)
    cbar.set_label('Price (PLN/MWh)', fontsize=12)

    plt.tight_layout(rect=[0, 0.01, 1, 0.995])
    out = f'tge_rdn_heatmap_{year}_column.png'
    plt.savefig(out, dpi=150)
    plt.close()
    print(f'Saved: {out}')


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        print(__doc__)
        sys.exit(1)

    year = int(args[0])
    layouts = ['siatka', 'kolumna']
    if '--uklad' in sys.argv:
        layouts = [sys.argv[sys.argv.index('--uklad') + 1]]
        if layouts[0] not in ('siatka', 'kolumna'):
            print("--uklad musi być: siatka albo kolumna")
            sys.exit(1)

    pivots = load_year(year)
    if not pivots:
        print(f"Brak plików tge_rdn_hourly_{year}-MM.csv")
        sys.exit(1)

    if 'siatka' in layouts:
        grid(year, pivots)
    if 'kolumna' in layouts:
        column(year, pivots)
