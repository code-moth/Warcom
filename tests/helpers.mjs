import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
export const REFERENCE_DIR = join(here, 'reference', 'out');
export const REFERENCE_BIN = join(REFERENCE_DIR, 'reference');
export const hasReference = existsSync(REFERENCE_BIN);

/** Small deterministic PRNG for generating test scenarios (mulberry32). */
export function makeRandom(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
  const pick = (arr) => arr[Math.floor(next() * arr.length)];
  return { next, int, pick, chance: (p) => next() < p };
}

/** The 27 unit fields in the original's U_NAME..U_HT_N order, as strings. */
export function unitToFields(u) {
  return [
    u.name, u.race, u.type, u.weapon, u.armor, u.discipline, u.lastMorale, u.formation,
    u.morale.start, u.morale.now, u.morale.mod,
    u.ob.start, u.ob.now, u.ob.mod,
    u.db.start, u.db.now, u.db.mod,
    u.exhaustion.start, u.exhaustion.now, u.exhaustion.mod,
    u.movement.start, u.movement.now, u.movement.mod,
    u.number.start, u.number.now,
    u.hits.start, u.hits.now,
  ].map(String);
}

export function attackToFields(a) {
  return [a.attacker || '', a.attackerSize, a.defender || '', a.defenderSize, a.modifier, a.dmx, a.spcr, a.weapon].map(String);
}

/** Run the original C++ resolver on a scenario. mode 0 = F9 one at a time, 1 = F10 whole round. */
export function runReference({ diceSeed, ran1Seed, constantModifiers, mode, units, attacks }) {
  const lines = [
    `CFG ${diceSeed} ${ran1Seed} ${constantModifiers ? 1 : 0} ${mode}`,
    `UNITS ${units.length}`,
    ...units.map((u) => unitToFields(u).join('|')),
    `ATTACKS ${attacks.length}`,
    ...attacks.map((a) => attackToFields(a).join('|')),
    '',
  ];
  const r = spawnSync(REFERENCE_BIN, [], { cwd: REFERENCE_DIR, input: lines.join('\n'), encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`reference failed: ${r.stderr}`);
  const out = r.stdout.trim().split('\n');
  if (out[0]?.startsWith('ABORT')) return { aborted: true };
  return { aborted: false, units: out.map((l) => l.split('|').slice(1)) };
}

export function randomUnit(rnd, weaponNames) {
  const start = rnd.int(1, 400);
  const hitsStart = rnd.chance(0.15) ? rnd.int(1, 6) : rnd.int(8, 140);
  const wounded = rnd.chance(0.5);
  const nowMen = wounded ? rnd.int(1, start) : start;
  const nowHits = wounded ? rnd.int(Math.max(1, Math.floor(hitsStart / 2)), hitsStart) : hitsStart;
  const exStart = rnd.pick([100, 100, 100, 80, 120]);
  const obStart = rnd.int(-10, 90);
  const dbStart = rnd.int(-10, 60);
  const w = rnd.pick(weaponNames);
  const weapon = rnd.pick([w, w.toUpperCase(), w.replace(/ /g, ''), ` ${w} `]);
  return {
    name: 'U' + rnd.int(1, 999),
    race: '',
    type: rnd.pick(['', 'small', 'Small', 'type I', 'Type II', 'ii', 'i', 'large', 'Large', 'super-large', 'super large', 'super', 'no stun', 'nostun', 'Infantry']),
    weapon,
    armor: rnd.int(0, 20),
    discipline: rnd.pick([-5, -20, -60, -100, 0, -35]),
    lastMorale: '',
    formation: '',
    morale: { start: rnd.pick([100, 100, 100, 90, 120]), now: 100, mod: rnd.pick([0, 0, 10, -15]) },
    ob: { start: obStart, now: obStart - rnd.int(0, 10), mod: rnd.pick([0, 0, 0, 10, -10, 25]) },
    db: { start: dbStart, now: dbStart - rnd.int(0, 10), mod: rnd.pick([0, 0, 0, 10, -10]) },
    exhaustion: { start: exStart, now: rnd.int(30, exStart), mod: 0 },
    movement: { start: rnd.int(0, 60), now: rnd.int(0, 60), mod: rnd.pick([0, 0, 5, -5]) },
    number: { start, now: nowMen },
    hits: { start: hitsStart, now: nowHits },
  };
}

export function randomAttack(rnd, unitCount, weaponNames) {
  return {
    attacker: rnd.int(1, unitCount),
    attackerSize: rnd.pick(['', '', '5', '25', '100', '300', '50%', '25%', '300%', '10%', '1%', '1000']),
    defender: rnd.int(1, unitCount),
    defenderSize: rnd.pick(['', '', '', '3', '30', '50%', '10%', '100%', '1%']),
    modifier: rnd.pick([0, 0, 0, 10, -10, 25, -30, 60, 120]),
    dmx: rnd.pick(['', '', '', '1', '2', '3', '5', '0', 'o', 'x']),
    spcr: rnd.pick(['', '', '', 'd', 'k', 'm', 'h', 's', 'x', 'S']),
    weapon: rnd.chance(0.2) ? rnd.pick(weaponNames) : '',
  };
}
