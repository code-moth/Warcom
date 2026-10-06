import type { Attack, Settings, Stat3, Unit } from './types.js';
import { MAX_ATTACKS, MAX_UNITS, STAT_LIMIT } from './types.js';

const stat3 = (): Stat3 => ({ start: 0, now: 0, mod: 0 });

export function createUnit(): Unit {
  return {
    name: '',
    race: '',
    type: '',
    weapon: '',
    armor: 0,
    discipline: 0,
    lastMorale: '',
    formation: '',
    morale: stat3(),
    ob: stat3(),
    db: stat3(),
    exhaustion: stat3(),
    movement: stat3(),
    number: { start: 0, now: 0 },
    hits: { start: 0, now: 0 },
  };
}

export function createAttack(): Attack {
  return { attacker: 0, attackerSize: '', defender: 0, defenderSize: '', modifier: 0, dmx: '', spcr: '', weapon: '' };
}

export const defaultSettings = (): Settings => ({
  constantModifiers: false,
  legacyArmorIndexing: false,
  fixedSeed: false,
  seed: 444,
});

/** Integer within the range the original fields could hold (blank and junk become 0). */
export function clampInt(value: unknown, min = -STAT_LIMIT, max = STAT_LIMIT): number {
  const n = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n)) return 0;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

/** True when every field of the unit is blank or zero (an unused slot). */
export function isUnitBlank(u: Unit): boolean {
  return (
    !u.name.trim() &&
    !u.race.trim() &&
    !u.type.trim() &&
    !u.weapon.trim() &&
    !u.formation.trim() &&
    !u.lastMorale.trim() &&
    !u.armor &&
    !u.discipline &&
    [u.morale, u.ob, u.db, u.exhaustion, u.movement].every((s) => !s.start && !s.now && !s.mod) &&
    !u.number.start &&
    !u.number.now &&
    !u.hits.start &&
    !u.hits.now
  );
}

export function isAttackBlank(a: Attack): boolean {
  return !a.attacker && !a.defender && !a.attackerSize && !a.defenderSize && !a.modifier && !a.dmx && !a.spcr && !a.weapon.trim();
}

/** F5: copy the "at start" statistics to "now". Modifiers and the last morale result are kept. */
export function resetUnitStats(u: Unit): void {
  u.morale.now = u.morale.start;
  u.ob.now = u.ob.start;
  u.db.now = u.db.start;
  u.exhaustion.now = u.exhaustion.start;
  u.movement.now = u.movement.start;
  u.number.now = u.number.start;
  u.hits.now = u.hits.start;
}

/** Percentage of starting strength still standing, or null when it cannot be computed. */
export function strengthPercent(u: Unit): number | null {
  const l = u.number.start;
  const k = u.number.now;
  if (l > 0 && k >= 0) return Math.floor((100 * k) / l);
  return null;
}

export function unitLabel(units: readonly Unit[], n: number): string {
  if (!n) return '';
  const u = units[n - 1];
  if (!u) return `#${n} (missing)`;
  return u.name.trim() ? u.name.trim() : `Unit ${n}`;
}

/**
 * Remove a unit and renumber references. Attacks that named the removed unit
 * lose that reference; later units shift down by one.
 */
export function removeUnitAt(units: Unit[], attacks: Attack[], index: number): void {
  units.splice(index, 1);
  const removed = index + 1;
  const fix = (n: number) => (n === removed ? 0 : n > removed ? n - 1 : n);
  for (const a of attacks) {
    a.attacker = fix(a.attacker);
    a.defender = fix(a.defender);
  }
}

/** Insert a blank unit after `index`, shifting later attack references. */
export function insertUnitAfter(units: Unit[], attacks: Attack[], index: number, unit: Unit): number {
  const at = index + 1;
  units.splice(at, 0, unit);
  const inserted = at + 1;
  const fix = (n: number) => (n >= inserted ? n + 1 : n);
  for (const a of attacks) {
    a.attacker = fix(a.attacker);
    a.defender = fix(a.defender);
  }
  return at;
}

export const canAddUnit = (units: readonly unknown[]) => units.length < MAX_UNITS;
export const canAddAttack = (attacks: readonly unknown[]) => attacks.length < MAX_ATTACKS;
