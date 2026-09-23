import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  loadWeapons,
  validateScenario,
  demoScenario,
  newScenario,
  importLegacy,
  exportLegacy,
  unitFields,
  unitWidths,
  attackWidths,
} from "../backend/model.mjs";
const weapons = loadWeapons("core/weapons.dat");
test("all 49 complete tables are loaded and the incomplete whip is rejected", () => {
  assert.equal(weapons.length, 49);
  assert.equal(weapons.at(-1).name, "waterbolt");
  assert.throws(() => loadWeapons("legacy/WEAPONS.DAT"), /whip/);
});
test("scenario validation rejects dangerous numeric values, protocol injection, and missing references", () => {
  for (const patch of [
    { armor: 0 },
    { armor: 21 },
    { hitsStart: 0 },
    { numberNow: -1 },
    { name: "bad\nname" },
    { weapon: "not a weapon" },
    { obNow: 10000 },
  ]) {
    const s = demoScenario();
    Object.assign(s.units[0], patch);
    assert.throws(() => validateScenario(s, weapons));
  }
  const s = demoScenario();
  s.attacks[0].attacker = 3;
  assert.throws(() => validateScenario(s, weapons), /attacker/);
  assert.doesNotThrow(() => validateScenario(newScenario(), weapons));
});
test("legacy UNT and BTL round trips preserve values and deterministic file sizes", () => {
  const s = demoScenario();
  for (const kind of ["units", "attacks"]) {
    const b = exportLegacy(s[kind], kind);
    assert.deepEqual(importLegacy(b, kind), s[kind]);
    assert.equal(b.length, kind === "units" ? 50427 : 11608);
    assert.deepEqual(exportLegacy(s[kind], kind), b);
  }
});
test("screen-derived field widths match the binary legacy resources", () => {
  for (const [file, widths] of [
    ["SCRN1.TXT", unitWidths],
    ["SCRN2.TXT", attackWidths],
  ]) {
    const bytes = fs.readFileSync("legacy/" + file),
      actual = [];
    for (let i = 0; i < 3840; i += 2)
      if (bytes[i] === 126) {
        let n = 1;
        while (bytes[i + n * 2] === 46) n++;
        if (bytes[i + n * 2] > 96 && bytes[i + n * 2] < 123) n++;
        actual.push(n + 1);
      }
    assert.deepEqual(actual, widths);
  }
});
test("legacy export rejects silent truncation, import rejects truncated files", () => {
  const s = demoScenario();
  s.units[0].name = "x".repeat(31);
  assert.throws(() => exportLegacy(s.units, "units"), /does not fit/);
  assert.throws(() => importLegacy(Buffer.alloc(120), "units"), /file size/);
});
