# Real tournament data

Drop your real tournament data file here as **`tournament_data.json`** (this exact filename — the importer looks for it by default), matching the schema below, then run:

```bash
cd backend
./venv/bin/python -m app.scripts.import_tournament_data
```

Or point it at a different file:

```bash
./venv/bin/python -m app.scripts.import_tournament_data --file /path/to/your/data.json
```

## Schema

```json
{
  "teams": [
    {
      "name": "Red Dragons",
      "group": "A",
      "color": "#d0483f",
      "logo_url": "/assets/teams/red-dragons.png",
      "players": [
        {
          "dcl_id": "DCL-001",
          "name": "Prahlad",
          "number": 1,
          "position": "GK",
          "is_manager": false,
          "photo_url": "/assets/players/DCL-001.jpg"
        }
      ]
    }
  ]
}
```

| Field | Required | Notes |
|---|---|---|
| `teams[].name` | yes | Must be unique (case-insensitive) across the file and the database. |
| `teams[].group` | yes | `"A"` or `"B"`. The tournament format is fixed at 2 groups of 3 teams (6 teams total) — the importer warns if your file doesn't match that shape, but does not block the import, in case you're still assembling data. |
| `teams[].color` | yes | Hex color used for the team's UI accent (stripe/avatar gradient), e.g. `"#d0483f"`. |
| `teams[].logo_url` | no | Path to the team crest, served from `frontend/public/assets/teams/`. Defaults to `/assets/teams/<slugified-name>.png` if omitted — put the actual image file at that path yourself. |
| `teams[].players[].dcl_id` | no | Your tournament's player ID (e.g. `"DCL-001"`). If given, it's what re-running the import matches this player against (so you can safely re-run after fixing a typo). If omitted, one is auto-assigned and matching falls back to (team, jersey number) instead. |
| `teams[].players[].name` | yes | |
| `teams[].players[].number` | yes | Jersey number, unique within the team. |
| `teams[].players[].position` | yes | One of `"GK"`, `"DEF"`, `"MID"`, `"FWD"`. |
| `teams[].players[].is_manager` | no | Defaults to `false`. At most one `true` per team — the importer will error if a team's file has more than one. |
| `teams[].players[].photo_url` | no | Path to the player's photo, served from `frontend/public/assets/players/`. Defaults to `/assets/players/<dcl_id>.jpg` if omitted (or is skipped if there's no `dcl_id` to key off) — put the actual image file at that path yourself. |

## Behavior

- **Idempotent**: re-running the import against an updated file upserts in place — it matches existing teams by name and existing players by `dcl_id` (or by team+number, if no `dcl_id`), updates their fields, and never creates duplicates.
- **Validates everything before writing anything**: every row is checked (required fields, duplicate names/numbers/DCL IDs within the file, valid `position`/`group` values, at most one manager per team) and all problems are reported together; if anything is invalid, nothing is written to the database.
- **Never touches matches, events, lineups, or standings** — those belong to Part 2/3's match-management system, not this import. Re-running the import after matches have already been played is safe (it only touches `teams`, `groups`/`group_teams`, and `players`).
- **Group assignment** happens after teams are upserted, based on each team's `group` field.
- Image files themselves are **not** part of this JSON — place the actual `.jpg`/`.png` files under `frontend/public/assets/players/` and `frontend/public/assets/teams/` yourself; the JSON only records the *paths* the frontend will request them at (see `docs/DATABASE_DESIGN.md` §14).

`tournament_data.example.json` in this directory is a filled-out example (using the same placeholder roster as the dev seed script) to show the exact shape expected — copy it to `tournament_data.json` and replace the values with your real data, or write your own file from scratch following the schema above.

## Match schedule (dates, times, venues)

Drop your real schedule as **`match_schedule.json`**, then run:

```bash
./venv/bin/python -m app.scripts.import_match_schedule
```

### Schema

```json
{
  "matches": [
    {
      "match_number": 1,
      "stage": "group",
      "group": "A",
      "label": null,
      "team1": "Red Dragons",
      "team2": "Golden Hawks",
      "date": "2026-10-04",
      "time": "18:00",
      "venue": "DCL Arena, Court 1",
      "duration_minutes": 40,
      "notes": null
    }
  ]
}
```

| Field | Required | Notes |
|---|---|---|
| `matches[].match_number` | yes | 1–9 — this tournament's fixed slot numbering (group A: 1–3, group B: 4–6, semis: 7–8, final: 9). This is the key re-running the import matches against, so it's stable across re-imports. |
| `matches[].stage` | yes | `"group"`, `"semi"`, or `"final"`. |
| `matches[].group` | required for `stage="group"`, must be `null` otherwise | `"A"` or `"B"`. |
| `matches[].label` | no | Display label for knockout matches, e.g. `"Semi-final 1"`, `"Final"`. Group matches don't need one (the UI derives "Group A"/"Group B" from `group`). |
| `matches[].team1` / `matches[].team2` | no | Team **names** (matched case-insensitively against existing teams — import fails clearly if a name doesn't match). Required in practice for group matches (so standings/results attach to the right teams); leave `null` for semi/final until those teams are actually decided by the tournament (the admin `generate-semis`/`generate-final` actions fill them in later) — you can still schedule a date/venue for a knockout match before its teams are known. |
| `matches[].date` | no | `"YYYY-MM-DD"`. |
| `matches[].time` | no | `"HH:MM"`, 24-hour. |
| `matches[].venue` | no | Free text, e.g. `"DCL Arena, Court 1"`. |
| `matches[].duration_minutes` | no | e.g. `40` for a 7-a-side match. |
| `matches[].notes` | no | Free-text admin metadata. |

### Behavior

- **Idempotent**, keyed by `match_number` — re-running upserts scheduling fields in place.
- The 6 group-stage match slots only exist once you've generated them (via `POST /api/matches/generate-group-fixtures` after assigning teams to groups, or the dev seed script) — **or** this importer will create them itself if a match with that `match_number` doesn't exist yet, using the `stage`/`group`/`team1`/`team2` you give it. The 3 knockout slots (7, 8, 9) always already exist (created by migration `0004_knockout_match_slots`), so importing a schedule for them just fills in date/time/venue.
- **Never sets `status`, score, or anything event-related** — those are owned by the match lifecycle endpoints (`start`/`end`/`reopen`/`cancel`) and match-event endpoints, not this importer. A newly created match always starts as `"upcoming"`.
- `match_schedule.example.json` in this directory shows the full 9-match shape using the same placeholder team names as `tournament_data.example.json` — copy and replace with your real dates/times/venues.
