# Validation report — 22 September 2026

## Completed

* Compared all **20 archived files byte-for-byte** with the downloaded `code-moth/Warcom` archive (`e4d8397`). SHA-256 values are recorded in `legacy-provenance.json` and checked by an automated test.
* Built both retained C++17 executables into a **fresh `build/final-clean/` directory** using the project-local Zig 0.13.0 compiler. The normal `build/` executables were rebuilt from the same final sources.
* Ran the full automated suite against the fresh executables: **16 tests passed, 0 failed**.
* Completed **278 reference comparisons**: 126 target-type/critical-mode/seed cases; 147 weapon/armor-boundary cases; 5 corrected armor-column comparisons including AT20.
* Verified dead attackers, absolute and percentage attack counts, tiny percentage rounding, exposed-defender caps, untargeted survivor preservation, round snapshots, constant-bonus mode, and repeated-seed determinism.
* Verified malformed C++ protocol input and unknown weapons fail with nonzero exit status and diagnostic messages.
* Verified API persistence across server restart, validation without state corruption, single/full resolution, undo, saved snapshots, invalid filenames, invalid seeds/assignments, and nonlocal-origin rejection.
* Verified legacy binary field widths against the original screen resources, UNT/BTL round trips, deterministic padding, truncated-file rejection, export-width errors, and interior empty-slot reference preservation.
* Passed TypeScript checking and Vite 7.3.6 production build. The JavaScript production bundle is approximately 210 KB (66 KB gzip), with approximately 10 KB CSS.
* Ran `setup.ps1 -SkipTests` successfully to exercise dependency installation and both build stages. Tests were run separately against the clean build.
* Started the complete production app using `run.ps1 -NoBrowser`, verified readiness, stopped it with Ctrl+C, confirmed the port stopped listening, then restarted it successfully. Browser opening/navigation was exercised through the in-app browser.
* Dependency installation/audit after the Vite update reported **0 known vulnerabilities**.

## Browser workflows exercised

1. Open empty workspace and load the illustrative training engagement.
2. Edit and save a unit name; verify the new name appears in assignments.
3. Submit invalid zero starting hits; verify a useful error and recover by correcting the input.
4. Duplicate a unit, alter its current combatants, reset to starting stats, and remove the duplicate.
5. Resolve a full round with seed 444 and inspect the results.
6. Undo the resolution and verify the force returns to 200 combatants.
7. Save a snapshot, start an empty battle, then restore the snapshot.
8. Resolve one assignment with a longbow override and magic critical mode; inspect the single recorded result.
9. Import a complete JSON battle, a generated legacy UNT file, then a BTL file; verify the two intended unit references.
10. Inspect weapon-table rendering.
11. Inspect the desktop layout and a 390×844 responsive viewport; measured page content width equaled available viewport width (no page overflow). Reset the viewport afterward.
12. Reload the final production bundle, run the training engagement again, and inspect browser console warnings/errors: **none**.

## Final seed-444 training result

| Assignment | Individual attacks | Casualties | Aggregate damage | Combatants remaining | Average hits |
|---|---:|---:|---:|---:|---:|
| Westwatch infantry → Ashwood raiders | 25 | 4 | 362 | 96 | 49 |
| Ashwood raiders → Westwatch infantry | 25 | 10 | 593 | 90 | 49 |

The final local workspace is left with this labeled illustrative scenario and its result, including an undo snapshot. No user campaign data was supplied or overwritten.

## Scope of the evidence

The comparison reference is the original C++ resolver adapted for modern compilation, storage, explicit random inputs, and in-memory attacker snapshots. It establishes formula equivalence under identical inputs; it does not prove reproduction of a historical DOS executable's random sequence. No DOS compiler, original executable, historical UNT/BTL fixture, or original tutorial scenario was supplied.

The default armor mapping intentionally differs from the legacy bug. The incomplete whip table remains unavailable. Original weapon-table accuracy and referee interpretation of morale failures are unresolved domain questions. All 49 complete weapon tables remain otherwise unchanged.

The optional CMake/MSVC route is supplied but was not executed on this PC because those tools are not installed. The supported portable Windows compiler path was executed. Browser checks were performed with the actual application; there is no separate automated browser-test runner in the repository.
