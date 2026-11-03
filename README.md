# Weak

A personal, offline workout logger for lifting. It runs as an installable web app (PWA) on Android, keeps all data on the phone, and tracks every exercise **variant** separately.

## What makes it different

- **Variants have their own history.** A variant is a base exercise + variation dimensions (laterality, grip, attachment, cable path, bench angle, position, ROM, tempo) + the gym. *Seated Cable Row · Unilateral · D-handle · Home* and *Seated Cable Row · Standard · Downtown* are tracked as separate progressions with separate PRs.
- **Gyms are first-class.** Create any number of gyms in the app. Cable stacks differ between gyms, so loads are never compared across them.
- **Unlimited templates** with folders, targets (sets, rep range, RIR, rest) and a double-progression flag.
- **Personal notes** per exercise.
- **Export that is easy to parse:** a tidy CSV with one row per set and every variation as a column, and a versioned JSON backup that restores exactly.
- **Import from a Strong CSV export,** with a mapping step for exercises, gyms and variations.

## Development

```bash
npm install
npm run dev        # local dev server
npm test           # unit tests
npm run build      # type-check + production build into dist/
```

Pushing to `main` builds and deploys to GitHub Pages via `.github/workflows/deploy.yml`.

## Data

Everything is stored in IndexedDB on the device. Nothing is sent anywhere. Back up from **Settings → Backup and export**. Never commit personal export files to this repository (`*.csv` is git-ignored).

### CSV columns

`session_id, session_start, session_end, session_name, template, gym, exercise, exercise_id, variant_key, laterality, grip, attachment, cable_path, bench_angle, position, rom, tempo, exercise_order, superset_group, set_index, set_type, parent_set_index, load_kg, bodyweight_kg, total_load_kg, reps, reps_left, reps_right, rir, e1rm_kg, rest_s, set_note, exercise_note, session_note`

- Timestamps are ISO-8601 with offset. Unset variation columns read `standard`.
- `load_kg` is per side / per dumbbell for unilateral and dumbbell work, and the *added* load for bodyweight movements (`total_load_kg` adds session bodyweight when known).
- `e1rm_kg` is Epley on reps + RIR, left blank above 10 effective reps.
