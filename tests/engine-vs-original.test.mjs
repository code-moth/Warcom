// Differential test: the TypeScript engine must reproduce the ORIGINAL C++ resolve()
// (compiled from legacy/RESOLVE.CPP by tests/reference/build.sh) exactly, on
// hundreds of random battles, for every special-critical mode and target size.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hasReference, makeRandom, randomUnit, randomAttack, runReference, unitToFields } from './helpers.mjs';
import { Rng } from '../build/engine/rng.js';
import { parseWeaponsDat } from '../build/engine/weapons.js';
import { WEAPONS_DAT } from '../build/data/weapons-dat.js';
import { resolveRound, resolveSingle } from '../build/engine/resolve.js';

const weapons = parseWeaponsDat(WEAPONS_DAT);
const usable = weapons.filter((w) => w.complete).map((w) => w.name);
const skip = hasReference ? false : 'reference binary not built (run tests/reference/build.sh; needs g++)';
// The DOS program always used the off-by-one armor indexing, so match it here.
const settingsFor = (constantModifiers) => ({ constantModifiers, legacyArmorIndexing: true });

function scenario(seed, nUnits, nAttacks) {
  const rnd = makeRandom(seed);
  const units = Array.from({ length: nUnits }, () => randomUnit(rnd, usable));
  const attacks = Array.from({ length: nAttacks }, () => randomAttack(rnd, nUnits, usable));
  return {
    units,
    attacks,
    diceSeed: rnd.int(1, 2 ** 31),
    ran1Seed: -rnd.int(1, 65535),
    constantModifiers: rnd.chance(0.25),
  };
}

function compare(label, units, ref) {
  assert.equal(units.length, ref.units.length, label);
  units.forEach((u, i) => {
    const mine = unitToFields(u);
    const theirs = ref.units[i];
    for (let e = 0; e < 27; e++) {
      const a = mine[e].trim();
      const b = (theirs[e] ?? '').trim();
      assert.equal(a, b, `${label}: unit ${i + 1} field ${e} (mine "${a}" vs original "${b}")`);
    }
  });
}

test('single attacks (F9) match the original resolver', { skip }, () => {
  for (let seed = 1; seed <= 250; seed++) {
    const sc = scenario(seed, 2 + (seed % 5), 1 + (seed % 6));
    const ref = runReference({ ...sc, mode: 0 });
    const units = structuredClone(sc.units);
    const rng = new Rng({ dice: sc.diceSeed, ran1: sc.ran1Seed });
    sc.attacks.forEach((attack, i) => resolveSingle(attack, i, units, weapons, rng, settingsFor(sc.constantModifiers)));
    compare(`F9 scenario ${seed}`, units, ref);
  }
});

test('full rounds (F10) match the original resolver', { skip }, () => {
  for (let seed = 1001; seed <= 1250; seed++) {
    const sc = scenario(seed, 2 + (seed % 6), 2 + (seed % 9));
    const ref = runReference({ ...sc, mode: 1 });
    const units = structuredClone(sc.units);
    const rng = new Rng({ dice: sc.diceSeed, ran1: sc.ran1Seed });
    const out = resolveRound(sc.attacks, units, weapons, rng, settingsFor(sc.constantModifiers));
    assert.equal(Boolean(out.aborted), ref.aborted, `F10 scenario ${seed}: abort agreement`);
    if (!ref.aborted) compare(`F10 scenario ${seed}`, units, ref);
  }
});

test('every special critical and target size is exercised by the comparison', { skip }, () => {
  // Heavy, high-OB attacks so criticals and casualties actually happen for each combination.
  const sizes = ['small', '', 'type I', 'type II', 'large', 'super-large', 'no stun'];
  const specials = ['', 'd', 'k', 'm', 'h', 's'];
  let checked = 0;
  for (const type of sizes) {
    for (const spcr of specials) {
      for (let s = 0; s < 6; s++) {
        const seed = 5000 + checked;
        const rnd = makeRandom(seed);
        const att = randomUnit(rnd, usable);
        const def = randomUnit(rnd, usable);
        att.number = { start: 200, now: 200 };
        att.ob = { start: 90, now: 90, mod: 30 };
        def.type = type;
        def.number = { start: 150, now: 150 };
        const units = [att, def];
        const attacks = [{ attacker: 1, attackerSize: '200', defender: 2, defenderSize: '', modifier: 20, dmx: '', spcr, weapon: '' }];
        const sc = { units, attacks, diceSeed: rnd.int(1, 2 ** 31), ran1Seed: -rnd.int(1, 65535), constantModifiers: false };
        const ref = runReference({ ...sc, mode: 0 });
        const mine = structuredClone(units);
        resolveSingle(attacks[0], 0, mine, weapons, new Rng({ dice: sc.diceSeed, ran1: sc.ran1Seed }), settingsFor(false));
        compare(`size "${type}" spcr "${spcr}" #${s}`, mine, ref);
        checked++;
      }
    }
  }
  assert.equal(checked, 7 * 6 * 6);
});
