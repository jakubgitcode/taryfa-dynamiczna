#!/usr/bin/env bash
# Pobiera ceny, waliduje dane i generuje heatmapy oraz dane statycznej strony.
#
# Użycie:
#     ./start.sh                 # poprzedni miesiąc
#     ./start.sh <miesiąc> <rok>
#     ./start.sh --tylko-eksport  # istniejące CSV → strona, bez pobierania i wykresów
#
# Interpreter: zmienna PYTHON, domyślnie .venv/bin/python.
set -euo pipefail
cd "$(dirname "$0")"

PY="${PYTHON:-.venv/bin/python}"

case $# in
    1)
        if [[ $1 == --tylko-eksport ]]; then
            "$PY" eksportuj_dane.py
            exit 0
        fi
        echo "Nieznany argument: $1" >&2
        exit 1
        ;;
    0)
        poprzedni=$(date -d "$(date +%Y-%m-01) -1 day" +%Y-%m)
        ROK=${poprzedni%-*}
        MIESIAC=${poprzedni#*-}
        ;;
    2)
        MIESIAC=$1
        ROK=$2
        ;;
    *)
        echo "Użycie: $0 [<miesiąc> <rok>]" >&2
        exit 1
        ;;
esac

if ! [[ $MIESIAC =~ ^[0-9]{1,2}$ && $ROK =~ ^[0-9]{4}$ ]]; then
    echo "Niepoprawny miesiąc/rok: '$MIESIAC' '$ROK'" >&2
    exit 1
fi
MIESIAC=$((10#$MIESIAC))
CSV=$(printf 'tge_rdn_hourly_%s-%02d.csv' "$ROK" "$MIESIAC")

"$PY" pobierz_dane.py "$MIESIAC" "$ROK"
"$PY" waliduj_dane.py "$CSV"
"$PY" eksportuj_dane.py
"$PY" generuj_heatmap.py "$CSV"
"$PY" generuj_rok.py "$ROK"
