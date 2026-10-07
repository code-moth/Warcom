/**
 * WARCOM data model.
 *
 * Unit and attack numbers are 1-based (0 = "blank"), exactly as in the DOS
 * editor, so legacy .UNT / .BTL files and attack references round-trip.
 */

/** A statistic tracked at start, now, and with a modifier (Morale, OB, DB, Exhaustion, Movement). */
export interface Stat3 {
  start: number;
  now: number;
  mod: number;
}

/** A statistic with no modifier column (Number of combatants, Average hits). */
export interface Stat2 {
  start: number;
  now: number;
}

export interface Unit {
  name: string;
  race: string;
  /** Size class: small, type i, type ii, large, super-large, no stun; anything else = normal. */
  type: string;
  /** Weapon name (matched ignoring case and blanks). */
  weapon: string;
  /** Rolemaster armor type 1-20 (0 or blank = no armor). */
  armor: number;
  /** Discipline modifier, normally negative: elite -5, good -20, bad -60. */
  discipline: number;
  /** Result of the last morale check: "" (none) or A-E. */
  lastMorale: string;
  formation: string;
  morale: Stat3;
  ob: Stat3;
  db: Stat3;
  exhaustion: Stat3;
  movement: Stat3;
  number: Stat2;
  hits: Stat2;
}

export interface Attack {
  /** Attacking unit number, 1-based; 0 = blank. */
  attacker: number;
  /** "" = all attack once; "25" = 25 attacks; "25%" = 25% of current strength. */
  attackerSize: string;
  defender: number;
  /** "" = all defend; "10" = at most 10 targets; "10%" = 10% of current strength. */
  defenderSize: string;
  modifier: number;
  /** Concussion damage multiplier: "" or "1" normal, "2"-"9", or "0". */
  dmx: string;
  /** Special critical: "" normal, d double, k kata, m magic, h holy, s slaying. */
  spcr: string;
  /** Weapon override; blank = use the attacker unit's weapon. */
  weapon: string;
}

/** One armor-type column of a weapon table. */
export interface ArmorRow {
  /** Hits inflicted on a roll of 150 (maximum). */
  max: number;
  /** Lowest roll that inflicts hits. */
  start: number;
  /** Hits inflicted on a roll of `start`. */
  min: number;
  /** Lowest roll for critical E, D, C, B, A (0 = no such critical). */
  crit: [number, number, number, number, number];
}

export interface Weapon {
  name: string;
  /** rows[0] is armor type 1, rows[19] is armor type 20. */
  rows: ArmorRow[];
  /** False when the source table had fewer than the 160 expected numbers. */
  complete: boolean;
  /** How many numbers the source table was missing. */
  missing: number;
  /** Notes for values repaired from documented corrections (see weapon-corrections.ts). */
  corrections?: string[];
}

export interface Settings {
  /** DOS "/C": do not adjust OB, DB and movement for damage and exhaustion. */
  constantModifiers: boolean;
  /** Reproduce the DOS armor-type off-by-one (typed AT n used table n+1; AT20 fell back to AT1). */
  legacyArmorIndexing: boolean;
  /** DOS "/D": use a fixed random seed so results repeat. */
  fixedSeed: boolean;
  seed: number;
}

export const MAX_UNITS = 200;
export const MAX_ATTACKS = 200;
export const STAT_LIMIT = 9999;
