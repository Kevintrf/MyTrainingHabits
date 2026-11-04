#!/usr/bin/env python3
"""
Imports the free-exercise-db dataset (https://github.com/yuhonas/free-exercise-db,
public domain / Unlicense) into this app's exercise library.

Run from the repo root:

    python3 scripts/import-free-exercise-db.py

Expects the free-exercise-db repo checked out at ./free-exercise-db (sibling of app/).
Regenerate this way whenever the source dataset is updated — it's idempotent, safe to
re-run, and always overwrites its own generated output files.

Also merges in the hand-curated additions from scripts/extra-exercises.json (exercises
free-exercise-db doesn't have, e.g. former custom exercises), appended after the upstream
data. Their images live in app/assets/exercises-extra/, which this script never touches,
or reuse free-exercise-db images by path. Edit that JSON and re-run to change them.

Produces:
  - app/src/db/seedExercisesData.ts   structured exercise data (name, muscle group,
                                       type, equipment, level, category, instructions)
  - app/assets/exercises/<slug>/*.jpg  copied exercise images
  - app/src/assets/exerciseImages.ts   static require() manifest mapping slug -> images
                                       (Metro needs static string-literal requires, so
                                       this can't be a runtime dictionary of paths)
"""
import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE_DIR = ROOT / "free-exercise-db"
SOURCE_JSON = SOURCE_DIR / "dist" / "exercises.json"
SOURCE_IMAGES = SOURCE_DIR / "exercises"
EXTRA_JSON = ROOT / "scripts" / "extra-exercises.json"

APP_DIR = ROOT / "app"
ASSETS_DIR = APP_DIR / "assets"
DATA_OUT = APP_DIR / "src" / "db" / "seedExercisesData.ts"
IMAGES_OUT_DIR = ASSETS_DIR / "exercises"
MANIFEST_OUT = APP_DIR / "src" / "assets" / "exerciseImages.ts"

# This app's enums (exercises.muscle_group / exercises.type CHECK constraints in schema.ts)
MUSCLE_GROUPS = {"CHEST", "BACK", "LEGS", "SHOULDERS", "ARMS", "CORE", "CARDIO", "OTHER"}
EXERCISE_TYPES = {"STRENGTH", "CARDIO", "BODYWEIGHT"}

# Renames applied on top of the raw free-exercise-db name for entries whose upstream name is
# outdated/obscure jargon (old "-SMR" self-myofascial-release naming, old bodybuilding-forum
# terms, etc.) with a name that's clearly more common/searchable today, verified against
# mainstream fitness sources. Keyed by slug (stable) rather than name, since name is exactly
# what's being overridden — re-running this script keeps these renames rather than reverting
# to the upstream name.
NAME_OVERRIDES = {
    "Adductor": "Adductor Foam Rolling",
    "Anterior_Tibialis-SMR": "Anterior Tibialis Foam Rolling",
    "Brachialis-SMR": "Brachialis Foam Rolling",
    "Calves-SMR": "Calves Foam Rolling",
    "Foot-SMR": "Foot Foam Rolling",
    "Hamstring-SMR": "Hamstring Foam Rolling",
    "Iliotibial_Tract-SMR": "IT Band Foam Rolling",
    "Latissimus_Dorsi-SMR": "Lat Foam Rolling",
    "Lower_Back-SMR": "Lower Back Foam Rolling",
    "Neck-SMR": "Neck Foam Rolling",
    "Peroneals-SMR": "Peroneals Foam Rolling",
    "Piriformis-SMR": "Piriformis Foam Rolling",
    "Quadriceps-SMR": "Quad Foam Rolling",
    "Rhomboids-SMR": "Rhomboids Foam Rolling",
    "Air_Bike": "Bicycle Crunch",
    "Alternate_Heel_Touchers": "Heel Touches",
    "Ab_Roller": "Ab Wheel Rollout",
    "Ankle_On_The_Knee": "Figure 4 Stretch",
    "Butt_Lift_Bridge": "Glute Bridge",
    "Butterfly": "Pec Deck Fly",
    "Ball_Leg_Curl": "Stability Ball Leg Curl",
    "Physioball_Hip_Bridge": "Stability Ball Hip Bridge",
    "Body-Up": "Plank Up-Down",
    "Body_Tricep_Press": "Bodyweight Tricep Extension",
}

# free-exercise-db's primaryMuscles vocabulary -> this app's MuscleGroup enum
MUSCLE_MAP = {
    "abdominals": "CORE",
    "abductors": "LEGS",
    "adductors": "LEGS",
    "biceps": "ARMS",
    "calves": "LEGS",
    "chest": "CHEST",
    "forearms": "ARMS",
    "glutes": "LEGS",
    "hamstrings": "LEGS",
    "lats": "BACK",
    "lower back": "BACK",
    "middle back": "BACK",
    "neck": "OTHER",
    "quadriceps": "LEGS",
    "shoulders": "SHOULDERS",
    "traps": "BACK",
    "triceps": "ARMS",
}


def map_muscle_group(primary_muscles):
    if not primary_muscles:
        return "OTHER"
    return MUSCLE_MAP.get(primary_muscles[0], "OTHER")


def map_type(category, equipment):
    if category == "cardio":
        return "CARDIO"
    if equipment == "body only":
        return "BODYWEIGHT"
    return "STRENGTH"


def ts_string(value: str) -> str:
    """Escape a Python string for a TS single-quoted string literal."""
    escaped = value.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n")
    return f"'{escaped}'"


def ts_string_or_null(value):
    return "null" if value is None else ts_string(value)


def ts_string_list(values):
    return "[" + ", ".join(ts_string(v) for v in values) + "]"


def load_extras(taken_slugs, taken_names):
    """Loads and sanity-checks scripts/extra-exercises.json. Run after the upstream images are
    copied, since curated entries may reuse those by path."""
    extras = json.loads(EXTRA_JSON.read_text())["exercises"]
    taken_slugs = set(taken_slugs)
    taken_names = {n.lower() for n in taken_names}
    replaced = set()  # custom names are matched case-insensitively on the phone
    for ex in extras:
        problems = []
        if ex["slug"] in taken_slugs:
            problems.append("slug already used")
        if ex["name"].lower() in taken_names:
            problems.append("name already used (exercises.name is UNIQUE)")
        for custom in ex.get("replaces_custom") or []:
            if custom.strip().lower() in replaced:
                problems.append(f"custom name {custom!r} already replaced by another entry")
            replaced.add(custom.strip().lower())
        if ex["muscle_group"] not in MUSCLE_GROUPS:
            problems.append(f"unknown muscle_group {ex['muscle_group']!r}")
        if ex["type"] not in EXERCISE_TYPES:
            problems.append(f"unknown type {ex['type']!r}")
        if not ex.get("instructions"):
            problems.append("no instructions")
        problems += [f"missing image {rel}" for rel in ex["images"] if not (ASSETS_DIR / rel).is_file()]
        if problems:
            raise SystemExit(f"{EXTRA_JSON.name}: {ex['slug']}: " + "; ".join(problems))
        taken_slugs.add(ex["slug"])
        taken_names.add(ex["name"].lower())
    return extras


def main():
    if not SOURCE_JSON.exists():
        raise SystemExit(f"Source dataset not found at {SOURCE_JSON} — is free-exercise-db checked out at {SOURCE_DIR}?")

    exercises = json.loads(SOURCE_JSON.read_text())
    print(f"Loaded {len(exercises)} exercises from {SOURCE_JSON}")

    # ── Copy images + build the data array ──────────────────────────────────
    if IMAGES_OUT_DIR.exists():
        shutil.rmtree(IMAGES_OUT_DIR)
    IMAGES_OUT_DIR.mkdir(parents=True)

    data_entries = []
    manifest_entries = []
    copied_images = 0

    for ex in exercises:
        slug = ex["id"]
        name = NAME_OVERRIDES.get(slug, ex["name"])
        muscle_group = map_muscle_group(ex.get("primaryMuscles") or [])
        ex_type = map_type(ex.get("category"), ex.get("equipment"))
        equipment = ex.get("equipment")
        level = ex.get("level") or "beginner"
        category = ex.get("category") or "strength"
        instructions = "\n".join(ex.get("instructions") or []) or None

        data_entries.append(
            "  { slug: %s, name: %s, muscle_group: %s, type: %s, equipment: %s, "
            "level: %s, category: %s, instructions: %s }"
            % (
                ts_string(slug),
                ts_string(name),
                ts_string(muscle_group),
                ts_string(ex_type),
                ts_string_or_null(equipment),
                ts_string(level),
                ts_string(category),
                ts_string_or_null(instructions),
            )
        )

        image_rel_paths = ex.get("images") or []
        if image_rel_paths:
            dest_dir = IMAGES_OUT_DIR / slug
            dest_dir.mkdir(parents=True, exist_ok=True)
            require_paths = []
            for rel in image_rel_paths:
                src_file = SOURCE_IMAGES / rel
                dest_file = dest_dir / Path(rel).name
                shutil.copyfile(src_file, dest_file)
                copied_images += 1
                require_paths.append(f"require('../../assets/exercises/{slug}/{Path(rel).name}')")
            manifest_entries.append(f"  {ts_string(slug)}: [{', '.join(require_paths)}],")

    # ── Hand-curated additions (scripts/extra-exercises.json) ────────────────
    upstream_names = [NAME_OVERRIDES.get(ex["id"], ex["name"]) for ex in exercises]
    extras = load_extras((ex["id"] for ex in exercises), upstream_names)
    for ex in extras:
        data_entries.append(
            "  { slug: %s, name: %s, muscle_group: %s, type: %s, equipment: %s, "
            "level: %s, category: %s, instructions: %s, replaces_custom: %s }"
            % (
                ts_string(ex["slug"]),
                ts_string(ex["name"]),
                ts_string(ex["muscle_group"]),
                ts_string(ex["type"]),
                ts_string_or_null(ex.get("equipment")),
                ts_string(ex["level"]),
                ts_string(ex["category"]),
                ts_string("\n".join(ex["instructions"])),
                ts_string_list(ex.get("replaces_custom") or []),
            )
        )
        require_paths = [f"require('../../assets/{rel}')" for rel in ex["images"]]
        manifest_entries.append(f"  {ts_string(ex['slug'])}: [{', '.join(require_paths)}],")
    print(f"Merged {len(extras)} hand-curated exercises from {EXTRA_JSON}")

    # ── Write the data file ──────────────────────────────────────────────────
    DATA_OUT.parent.mkdir(parents=True, exist_ok=True)
    data_ts = (
        "// AUTO-GENERATED by scripts/import-free-exercise-db.py from free-exercise-db\n"
        "// (https://github.com/yuhonas/free-exercise-db, public domain), followed by the\n"
        "// hand-curated additions in scripts/extra-exercises.json. Do not hand-edit —\n"
        "// edit that JSON or re-run the script if the source dataset changes.\n\n"
        "export interface SeedExerciseData {\n"
        "  slug: string;\n"
        "  name: string;\n"
        "  muscle_group: string;\n"
        "  type: string;\n"
        "  equipment: string | null;\n"
        "  level: string;\n"
        "  category: string;\n"
        "  instructions: string | null;\n"
        "  // Hand-curated additions only: names of the custom exercises this entry replaces. A\n"
        "  // custom exercise with one of these names becomes this library entry in place, keeping\n"
        "  // its id (see promoteCustomExercises() in schema.ts and importBackup() in backup.ts).\n"
        "  replaces_custom?: string[];\n"
        "}\n\n"
        "export const SEED_EXERCISES_FULL: SeedExerciseData[] = [\n"
        + ",\n".join(data_entries)
        + ",\n];\n"
    )
    DATA_OUT.write_text(data_ts)
    print(f"Wrote {len(data_entries)} exercises to {DATA_OUT}")

    # ── Write the image manifest ─────────────────────────────────────────────
    MANIFEST_OUT.parent.mkdir(parents=True, exist_ok=True)
    manifest_ts = (
        "// AUTO-GENERATED by scripts/import-free-exercise-db.py. Do not hand-edit —\n"
        "// re-run the script if the source dataset changes. Hand-curated entries (from\n"
        "// scripts/extra-exercises.json) come last and point into assets/exercises-extra/\n"
        "// or reuse free-exercise-db images.\n"
        "//\n"
        "// Metro (React Native's bundler) only supports static, string-literal require()\n"
        "// calls for local assets — it can't resolve a variable path at runtime. This\n"
        "// manifest is the standard workaround: one explicit require() per image, generated\n"
        "// ahead of time, looked up by exercise slug at render time.\n\n"
        "// eslint-disable-next-line @typescript-eslint/no-explicit-any\n"
        "export const EXERCISE_IMAGES: Record<string, any[]> = {\n"
        + "\n".join(manifest_entries)
        + "\n};\n"
    )
    MANIFEST_OUT.write_text(manifest_ts)
    print(f"Wrote image manifest ({copied_images} images, {len(manifest_entries)} exercises) to {MANIFEST_OUT}")


if __name__ == "__main__":
    main()
