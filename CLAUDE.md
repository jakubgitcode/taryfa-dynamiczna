@AGENTS.md

## Claude Code

Wspólne instrukcje są w `AGENTS.md` (import powyżej) — tam dopisuj rzeczy ważne dla wszystkich agentów.
Tu tylko to, co specyficzne dla Claude Code.

Skille projektu (`.claude/skills/`):

- `/aktualizuj-miesiac [<miesiąc> <rok>]` — lokalne uruchomienie `start.sh`: pobranie, walidacja, heatmapy.
- `/waliduj-dane [pliki]` — kontrola jakości CSV (`waliduj_dane.py`: brakujące dni, kopie, zmiana czasu, przesunięcie dat).

Git w tym środowisku: `git -c safe.directory='*' -c core.fileMode=false <polecenie>`
(powód w sekcji „Środowisko” w AGENTS.md).
