# WARCOM migration

## Repository assessment (before implementation)

Source: code-moth/Warcom, main archive e4d8397, WARCOM 2.3.1. All 20 original files are preserved byte-for-byte under `legacy/` and recorded in `legacy-provenance.json`. The repository has no build system, tests, executable, or sample UNT/BTL files. Its GPL-3.0 license is retained.

WARCOM assists a gamemaster running Rolemaster / War Law fantasy mass combat. It is not a map-based strategy game. Up to 200 units and 200 assignments are edited; assignments resolve either individually or as a round. The referee interprets morale failures and handles tactical movement externally.

## Inventory and execution

| Source | Classification | Migration |
|---|---|---|
| TEST.CPP / TEST.HPP | DOS entry point, unit workflow, field identifiers | Retain field schema; replace UI/startup |
| RESOLVE.CPP | Weapon loading, lookup, combat, random distributions | Retain C++ formulas and tables; isolate behind executable |
| ATTACK.CPP | Assignment UI, round orchestration, summary/logging | Replace with web controls and API orchestration |
| DATASCRN.CPP / HPP | Screen-derived fixed-record storage and DOS editor | Replace storage implementation; support legacy file interchange |
| WINDOW.CPP / HPP, WEAPON.CPP, EDITKEYS.HPP | Keyboard navigation, direct video-memory rendering, weapon picker | Replace with React controls; archive original |
| WEAPONS.DAT | 20 armor columns per weapon, damage interpolation and E–A thresholds | Preserve authoritative data; validate parsing |
| SCRN1/2/2X.TXT, HELP.TXT, INTRO.TXT | Binary character/attribute screen resources | Decode for schema/documentation; obsolete presentation |
| README.md / README.rtf / LICENSE | Provenance, manual, license | Preserve; provide current documentation |
| .gitattributes | Repository line-ending metadata | Preserve in the original archive |

TEST initializes weapons and 200 string-based unit/attack records, then enters the editor. F10 opens assignments. Single resolution reads current attacker stats. Full-round resolution saves BACKUP.UNT and uses those original attacker stats while defenders accumulate results in assignment order. It is therefore not completely order-independent. Units have 27 fields; assignments have 8. Reset copies seven starting values to current values; copy duplicates a unit. Name, race and formation are descriptive. Exhaustion modifier exists but is not consumed by the resolver.

## Domain logic to retain

Weapon damage interpolates linearly from a start threshold to roll 150. Open-ended d100 rolls include low and high extensions. Seven defender types and normal/double/kata/magic/holy/slaying critical modes determine casualty probabilities and randomized damage. Concussion multipliers are 0–9. Casualties arise from criticals, maximum-hit damage, or statistical estimates of wounded individuals using Park–Miller shuffled randomness and a positive Gaussian. Surviving aggregate hits are recombined with untargeted troops and probabilistically rounded. Morale derives from starting morale, casualty proportion and discipline, then an open-high roll. Exhaustion and optionally OB/DB/movement are updated. Preserve these calculations rather than reimplementing them in JavaScript.

## Architecture decision

React + TypeScript + Vite frontend → local Node HTTP API → isolated C++17 executable per resolution. Node provides static serving, validation, local JSON persistence, backups, and process orchestration without introducing a second interpreted runtime. FastAPI would add Python installation without simplifying this small boundary. Local JSON scenario files fit the original document workflow better than relational storage. No cloud or authentication service. Bind only to 127.0.0.1.

C++ retains the resolver and stochastic helpers. Replace raw allocation, unchecked weapon loading, binary screen coupling, and backup-file access with owned containers and explicit input/output. A line-based process protocol keeps bindings and ABI management unnecessary. Each process owns its random state, so simultaneous requests cannot corrupt the engine. CMake supports conventional compilers; Windows setup can use a project-local portable Zig C++ toolchain.

## Bugs, differences and ambiguity

* Armor is documented as 1–20, but RESOLVE uses it as index 0–19: 1 reads AT2 and 20 reads AT1. Default to corrected mapping; expose an explicit legacy armor mode for comparison.
* Weapon count starts at -1 and is used as an exclusive limit, hiding the final weapon. Further inspection found the final weapon (whip) is incomplete: its AT1 row has only seven of eight values. The legacy parser reuses a previous integer after failed fscanf. Do not invent the missing A-critical threshold. `core/weapons.dat` contains the 49 complete original tables verbatim; the complete original file remains archived. Whip is unavailable pending authoritative data. The modern loader counts all complete entries and rejects malformed tables.
* DataSet saves size+fieldCount bytes at size-byte offsets, overlapping records and leaving trailing garbage. Import by the actual stride; export deterministic padding rather than uninitialized memory.
* argv loop includes argv[argc], risking null dereference. DOS startup is replaced.
* Legacy random `rand()` varies by compiler; /D seeds only one of two generators. New runs seed both explicitly and record the seed. A fixed 32-bit LCG (214013x+2531011, upper 15 bits) replaces compiler-dependent rand for d100; the original shuffled Park–Miller and Gaussian functions remain. Historical DOS random sequences cannot be promised. The comparison reference shares this RNG seam, storage adapter, and in-memory round snapshot, so parity demonstrates combat formula equivalence under identical random inputs, not binary equivalence to a DOS run.
* Preserve strict `roll > criticalThreshold`, percentage truncation (attacker minimum one, defender may round to zero), defender caps, and round attacker snapshots.
* Preserve the exhaustion-modifier non-use and current morale overwrite. Manual says movement modifier is unused, but code applies it; code is the specification.
* No sample battle data exists in the repository; any demonstration will be explicitly labeled illustrative, not the manual's Potter's Hill scenario.
* Morale A–E consequences, elapsed battle time, tactical movement and undocumented screen variant SCRN2X are not invented.
* Reject invalid numeric ranges and missing references rather than accepting C atoi nonsense or risking division by zero.
* Legacy fixed-record imports preserve empty interior unit/assignment slots so numeric references retain their meaning. Trailing empty slots are removed. Modern JSON supports longer strings; legacy export reports fields that cannot fit rather than truncating.
* SCRN2X differs only in spacing of the damage multiplier and critical controls; TEST.CPP uses SCRN2, so no additional behavior is omitted.

## Stages and validation

1. Complete repository/manual/schema inspection and preserve originals (done before core changes).
2. Create a minimally adapted reference resolver and regression harness before domain edits.
3. Isolate C++ core, modernize storage/parser boundaries, add explicit compatibility mode.
4. Build API, persistence, legacy import/export, round snapshots, history and undo.
5. Build unit/assignment editing, weapon reference, results, settings and scenario workflow.
6. Clean-build C++, compare reference and modern results across representative types/modes/seeds, test API and frontend, build production assets, exercise complete application in browser.
7. Deliver setup/run scripts and record actual validation and remaining limitations.

## Implemented outcome

All migration stages above are implemented. `VALIDATION.md` records the clean builds, 16 passing automated tests, 278 C++ reference comparisons, and browser workflows. The final engine also exposes the original log's individual-attack count and aggregate damage, alongside casualty and average-hit results. Local JSON documents replace unsafe fixed-record persistence for normal use, while UNT/BTL interchange remains available. The complete production application runs at localhost using `run.ps1`.
