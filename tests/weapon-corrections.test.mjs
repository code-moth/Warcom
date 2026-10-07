// Whip repairs must be applied only on top of the untouched original data, and only when the data still matches.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseWeaponsDat } from '../build/engine/weapons.js';
import { WEAPONS_DAT } from '../build/data/weapons-dat.js';
import { WEAPON_CORRECTIONS } from '../build/data/weapon-corrections.js';

const original = parseWeaponsDat(WEAPONS_DAT);
const repaired = parseWeaponsDat(WEAPONS_DAT, WEAPON_CORRECTIONS);
const byName = (list, n) => list.find((w) => w.name === n);
const REPAIRED_ROWS = new Set([0, 12, 15]); // AT1, AT13, AT16 (zero-based)

test('the embedded data is still byte-identical to the untouched legacy file', () => {
  const legacy = readFileSync(new URL('../legacy/WEAPONS.DAT', import.meta.url)).toString('latin1');
  assert.equal(WEAPONS_DAT, legacy);
});

test('without corrections, whip is still reported incomplete and unrepaired', () => {
  const w = byName(original, 'whip');
  assert.equal(w.complete, false);
  assert.equal(w.missing, 1);
  assert.equal(w.corrections, undefined);
  assert.equal(w.rows[12].crit[4], 155);
});

test('with corrections, whip is complete and AT1, AT13, AT16 hold the repaired values', () => {
  const w = byName(repaired, 'whip');
  assert.equal(w.complete, true);
  assert.deepEqual(w.rows[0].crit, [137, 128, 117, 107, 94]);
  assert.deepEqual(w.rows[12].crit, [148, 144, 136, 127, 115]);
  assert.deepEqual(w.rows[15].crit, [150, 148, 143, 137, 128]);
  assert.equal(w.corrections.length, 3);
  assert.match(w.corrections[0], /interpolated as 94/);
  assert.match(w.corrections[1], /115/);
  assert.match(w.corrections[2], /150, 148, 143, 137, 128/);
});

test('the corrections change nothing else about whip, and no other weapon', () => {
  for (const o of original) {
    const r = byName(repaired, o.name);
    for (let at = 0; at < 20; at++) {
      if (o.name === 'whip' && REPAIRED_ROWS.has(at)) continue;
      assert.equal(JSON.stringify(r.rows[at]), JSON.stringify(o.rows[at]), `${o.name} AT${at + 1}`);
    }
    if (o.name !== 'whip') {
      assert.equal(r.complete, o.complete);
      assert.equal(r.corrections, undefined);
    }
  }
});

test('repaired thresholds keep E>D>C>B>A and A<B in every repaired row', () => {
  const w = byName(repaired, 'whip');
  for (const i of REPAIRED_ROWS) {
    const [e, d, c, b, a] = w.rows[i].crit;
    assert.ok(e > d && d > c && c > b && b > a, `AT${i + 1}`);
  }
});

test('a replacing repair is not applied when the file does not hold the expected values', () => {
  const stale = WEAPON_CORRECTIONS.map((c) =>
    c.expected ? { ...c, expected: Object.fromEntries(Object.entries(c.expected).map(([k, v]) => [k, v + 1])) } : c,
  );
  const w = byName(parseWeaponsDat(WEAPONS_DAT, stale), 'whip');
  assert.equal(w.rows[12].crit[4], 155);
  assert.deepEqual(w.rows[15].crit, [0, 150, 147, 143, 135]);
  assert.equal(w.corrections.length, 1); // only the fill
});
