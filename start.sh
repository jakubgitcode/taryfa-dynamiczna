#!/usr/bin/env bash
# Pobiera dane TGE RDN za miesiąc, waliduje je i generuje heatmapy (miesięczną i roczne).
#
# Użycie:
#     ./start.sh                 # poprzedni miesiąc
#     ./start.sh <miesiąc> <rok>
#
# Interpreter: zmienna PYTHON, domyślnie .venv/bin/python.
set -euo pipefail
cd "$(dirname "$0")"

PY="${PYTHON:-.venv/bin/python}"

case $# in
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
"$PY" generuj_heatmap.py "$CSV"
"$PY" generuj_rok.py "$ROK"
