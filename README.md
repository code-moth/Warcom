# WARCOM — local battle command

WARCOM is a companion to Rolemaster / War Law fantasy mass combat. It manages units and attack assignments, then calculates casualties, average remaining hits, morale, exhaustion, and combat penalties. The original DOS application was written by David Eubanks and subsequently modified by KILBOT.

This rebuild keeps its C++ combat calculations and replaces the DOS interface with a local browser application. Nothing is uploaded; no cloud service, database server, paid API, or account is required.

## Windows 11 quick start

1. Install **Node.js 24 LTS** (or Node 22.12+) from [nodejs.org](https://nodejs.org/). Reopen PowerShell after installation.
2. Open PowerShell in this project's directory.
3. Run:

```powershell
.\setup.ps1
.\run.ps1
```

If Windows blocks PowerShell scripts, use these commands instead (the policy change applies only to that process):

```powershell
powershell -ExecutionPolicy Bypass -File .\setup.ps1
powershell -ExecutionPolicy Bypass -File .\run.ps1
```

Setup downloads npm dependencies and, when needed, a pinned portable Zig 0.13.0 C++ compiler into `.tools/`. It checks the compiler archive's SHA-256, compiles both C++ targets, builds the frontend, and runs automated tests. **No Visual Studio installation, administrator access, or manual compiler PATH changes are required.** Initial setup needs Internet access and several hundred MB of free space; normal use is offline. The supplied portable compiler targets x64 Windows; other architectures should use an appropriate C++17 compiler/CMake.

`run.ps1` starts the server and opens **http://127.0.0.1:4173**. Keep the PowerShell window open. Press **Ctrl+C** to stop. Alternatives:

```powershell
.\run.ps1 -Port 4180
.\run.ps1 -NoBrowser
```

On this computer, the project is at `C:\Code\Apps\Warcom`.

## Using WARCOM

* **Units:** add, edit, duplicate, or remove units. All 27 original fields are available. Reset copies starting stats to current stats, preserving modifiers and the previous morale-failure code as the original did. Removing a unit removes its linked assignments and renumbers remaining references.
* **Assignments:** choose attacker and defender, absolute counts or percentages, modifier, concussion multiplier (0–9), critical mode, and optional weapon override. Blank or zero counts mean all. `300%` means three attacks per current combatant. Resolve one assignment or the entire queue.
* **Battle log:** review each resolution, casualties, average hits, and its random seed. Undo restores the latest resolution. Editing/saving a battle invalidates that undo snapshot.
* **Weapons:** inspect all 49 complete original weapon tables across armor types 1–20. The archived whip table is incomplete and is not selectable.
* **Files & settings:** name your battle; enable constant OB/DB/movement (`/C`); optionally reproduce the legacy armor-index bug; save/load snapshots; import/export complete JSON battles and legacy UNT/BTL files.

Click **Save changes** after editing. Resolution, export, and snapshot saving save edits first. Loading/importing/new-battle actions replace active data; save a snapshot before switching. The illustrative training engagement is a useful first run; it is not the original manual's Potter's Hill battle, whose files were not supplied.

Full rounds retain each attacker's stats from the beginning of the round, while defenders accumulate damage in assignment order. This preserves WARCOM's actual implementation; it is not a fully order-independent simulation. A unit eliminated during a round can still perform its already-planned attack with its starting stats. Single-assignment resolution uses current stats.

Morale failures A–E need referee interpretation. Tactical movement, routing, and round duration are intentionally not automated. Editing current morale does not affect the next morale calculation: use starting morale or its modifier. The exhaustion modifier is descriptive only because the original calculation never consumed it.

## Files and recovery

* `data/active.json` stores the active battle, up to 100 resolution records, and one undo snapshot. Writes use a temporary file and rename.
* `data/battle-<id>.json` files are explicit saved snapshots. Back up this folder or export complete battles.
* `data/server.stdout.log` and `data/server.stderr.log` contain launcher diagnostics.
* Import **UNT before BTL**. Importing units clears assignments and history to avoid incorrect unit references. Importing BTL replaces assignments and clears history. Interior empty record slots retain their original numeric IDs.
* Supported legacy formats: 50- or 200-record UNT and **2.1+** BTL, with or without their extra trailing bytes. Older BTL layouts are rejected. No historical fixture files were supplied, so compatibility is verified using the original screen schema and generated round trips rather than real campaign files.
* Legacy exports enforce the original short ASCII field widths; they report an error rather than truncate long names or numbers. JSON supports larger UTF-8 fields (up to 60 characters / 63 bytes).
* An invalid `active.json` is not silently discarded. Back it up, repair it, or rename it and restart to open an empty workspace.

## Architecture and retained C++

```text
React / TypeScript / Vite browser UI
            ↓ local HTTP, one origin
Node.js API + local JSON documents
            ↓ bounded stdin/stdout protocol
C++17 WARCOM executable, fresh process per resolution
```

Node is used instead of FastAPI because orchestration and document persistence do not need an additional Python runtime. JSON files preserve the original scenario-document model without unnecessary database administration.

`core/resolver.cpp` retains the original damage interpolation, critical tables and probabilities, casualty accounting, wounded-target estimation, stochastic rounding, morale, exhaustion, and combat adjustments. The Park–Miller shuffled and positive-Gaussian routines remain C++. Owned arrays and bounded fields replace DOS memory and unchecked allocation. A validated weapon parser replaces unsafe parsing. In-memory snapshots replace temporary backup-file access. A process boundary isolates the old global random state and avoids native bindings/ABI dependencies.

`legacy/` preserves every original file, unchanged. `scripts/extract-core.mjs` records the limited source transformations and generates the portable reference and modern resolver. `core/reference.cpp` is a test-only reference using the original formula/indexing behavior with the same portability seams. It is not invoked by the web application.

## Tests and builds

```powershell
npm run build:core       # Compile C++ engine and comparison reference
npm test                # C++ regression/comparison tests, API and file tests
npm run build           # TypeScript check and production browser bundle
npm start               # Serve production app without opening a browser
```

The C++ tests invoke the real executables through their public process interface. They compare 7 target types × 6 critical modes × 3 seeds, every complete weapon at armor boundaries, and targeted edge cases. A golden seed-444 scenario checks casualties, hits, morale, exhaustion, OB, DB, and movement. API tests use a temporary directory and ephemeral local port. Frontend validation includes the TypeScript build and real browser workflow checks; see `VALIDATION.md` for the completed checks.

For a conventional C++17 compiler:

```powershell
cmake -S . -B build-cmake
cmake --build build-cmake --config Release
ctest --test-dir build-cmake -C Release --output-on-failure
```

Set `WARCOM_ENGINE` to the absolute built `warcom-engine.exe` path when using that build with the API. `CXX` can specify a GCC/Clang-compatible compiler for `npm run build:core`; MSVC users should use CMake. The automated Windows path uses Zig directly and does not need CMake.

Development uses two terminals:

```powershell
npm start               # API on 4173
npm run dev             # Vite frontend, with /api proxied to 4173
```

`PORT` changes the production/API port; `WARCOM_DATA_DIR` changes the storage directory. Use one server per data directory. The default server binds exclusively to IPv4 loopback and rejects nonlocal origins/hostnames.

## Behavioral differences and limitations

* Armor indexing is corrected by default. Enable **Legacy armor indexing** to reproduce AT1→AT2 and AT20→AT1 behavior.
* Both random generators are explicitly seeded. A fixed portable LCG replaces compiler-dependent `rand()`. Repeating the same input, settings, and seed reproduces a result, but the historical DOS `/D` sequence is not promised.
* Whip's AT1 row is missing its A-critical threshold. It remains archived and unavailable; no guessed rule was introduced.
* Invalid stats and references produce errors instead of legacy silent coercion or undefined behavior. Current strength/hits cannot exceed starting values.
* One engine call has a 30-second limit; very large attack multipliers across 200 assignments may need reducing.
* The program is a single-user local tool, not a shared multiplayer server. Edits from multiple browser tabs are not merged.
* Original tables are approximations, and apparent table oddities remain unchanged. No claim is made that these tables reproduce every published Rolemaster rule.

See `MIGRATION_PLAN.md` for the detailed source inventory, decisions, and uncertainties. Useful next improvements are validation against real historical campaign files, an authoritative repair of the whip table, and finer-grained per-attack audit traces.

## Project structure

```text
frontend/       React interface, types and styles
backend/        HTTP API, validation, files, C++ integration
core/           Retained C++17 resolver, adapter, reference and valid weapon tables
legacy/         Unmodified original repository
tests/          Engine parity, behavior, API and file-format tests
scripts/        Reproducible extraction and compiler invocation
data/           Local battle documents (not committed)
setup.ps1       Install, compile, build, test
run.ps1         Start, open browser, stop cleanly
CMakeLists.txt  Optional conventional C++ build
```

The original GPL-3.0 license is preserved in `LICENSE`; original authorship and manual are retained in `legacy/`.
