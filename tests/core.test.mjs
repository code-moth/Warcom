import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { demoScenario, newUnit, loadWeapons } from "../backend/model.mjs";
import { root, runEngine } from "../backend/engine.mjs";
const reference =
  process.env.WARCOM_REFERENCE ||
  path.join(
    root,
    "build",
    `warcom-reference${process.platform === "win32" ? ".exe" : ""}`,
  );
test("seed 444 golden scenario: corrected armor, casualties, hits, morale, exhaustion and bonuses", async () => {
  const r = await runEngine(demoScenario(), 444);
  assert.deepEqual(
    r.results.map((x) => [x.casualties, x.after, x.hitsAfter]),
    [
      [4, 96, 49],
      [10, 90, 49],
    ],
  );
  assert.deepEqual(
    r.units.map((u) => [
      u.moraleNow,
      u.exhaustionNow,
      u.obNow,
      u.dbNow,
      u.movementNow,
    ]),
    [
      [91, 98, 59, 19, 98],
      [95, 98, 59, 19, 98],
    ],
  );
});
test("legacy parity across 7 target types, 6 critical modes, and three seeds", async () => {
  for (const type of [
    "Normal",
    "Small",
    "Type I",
    "Type II",
    "Large",
    "Super-Large",
    "No stun",
  ])
    for (const critical of ["n", "d", "k", "m", "h", "s"])
      for (const seed of [1, 444, 98765]) {
        const s = demoScenario();
        s.settings.legacyArmor = true;
        s.units[1].type = type;
        s.attacks[0].critical = critical;
        s.attacks[0].multiplier = critical === "n" ? 0 : 2;
        assert.deepEqual(
          await runEngine(s, seed),
          await runEngine(s, seed, true, reference),
          `${type}/${critical}/${seed}`,
        );
      }
});
test("every complete weapon and armor boundary matches the reference", async () => {
  for (const { name } of loadWeapons(path.join(root, "core/weapons.dat")))
    for (const armor of [1, 19, 20]) {
      const s = demoScenario();
      s.settings.legacyArmor = true;
      s.units[0].weapon = name;
      s.units[1].armor = armor;
      assert.deepEqual(
        await runEngine(s, 71),
        await runEngine(s, 71, true, reference),
        `${name}, AT${armor}`,
      );
    }
});
test("dead attacker has no attacks, even with explicit absolute count", async () => {
  const s = demoScenario();
  s.units[0].numberNow = 0;
  s.attacks = s.attacks.slice(0, 1);
  s.attacks[0].attackerSize = "100";
  const r = await runEngine(s, 444);
  assert.deepEqual(r.units, s.units);
  assert.equal(r.results[0].casualties, 0);
});
test("one exposed defender cannot eliminate untargeted troops; full rounds use attacker snapshot", async () => {
  const s = demoScenario();
  s.attacks = s.attacks.slice(0, 1);
  s.attacks[0].defenderSize = "1";
  s.attacks[0].modifier = 9999;
  s.attacks[0].multiplier = 9;
  const r = await runEngine(s, 17);
  assert.equal(r.units[1].numberNow, 99);
  const t = demoScenario();
  t.units = t.units.map((u) => ({
    ...u,
    numberStart: 1,
    numberNow: 1,
    hitsStart: 1,
    hitsNow: 1,
  }));
  t.attacks = t.attacks.map((a) => ({
    ...a,
    attackerSize: "1",
    defenderSize: "1",
    modifier: 9999,
    multiplier: 9,
  }));
  assert.deepEqual(
    (await runEngine(t, 17, true)).units.map((u) => u.numberNow),
    [0, 0],
  );
  assert.deepEqual(
    (await runEngine(t, 17, false)).units.map((u) => u.numberNow),
    [1, 0],
  );
});
test("percentage rounding, constant bonuses and explicit seed reproducibility", async () => {
  const s = demoScenario();
  s.units[0].numberNow = 1;
  s.attacks = s.attacks.slice(0, 1);
  s.attacks[0].attackerSize = "1%";
  s.attacks[0].defenderSize = "1";
  s.attacks[0].modifier = 9999;
  s.attacks[0].multiplier = 9;
  s.settings.constantBonuses = true;
  const r = await runEngine(s, 123);
  assert.equal(r.results[0].casualties, 1);
  assert.equal(r.units[1].obNow, 60);
  assert.equal(r.units[1].dbNow, 20);
  assert.equal(r.units[1].movementNow, 100);
  assert.deepEqual(await runEngine(s, 123), r);
  s.attacks[0].defenderSize = "0%"; // legacy 0 means all, not none
  assert.equal((await runEngine(s, 123)).results[0].casualties, 1);
  s.units[1].numberNow = 1;
  s.attacks[0].defenderSize = "1%";
  assert.deepEqual((await runEngine(s, 123)).units, s.units);
});
test("armor correction is exactly a column shift from the reference through AT20", async () => {
  for (const armor of [1, 5, 10, 19, 20]) {
    const s = demoScenario();
    s.attacks = s.attacks.slice(0, 1);
    s.units[1].armor = armor;
    const legacy = structuredClone(s);
    legacy.settings.legacyArmor = true;
    legacy.units[1].armor = armor - 1;
    const a = await runEngine(s, 999),
      b = await runEngine(legacy, 999, true, reference);
    b.units[1].armor = armor;
    assert.deepEqual(a, b);
  }
});
