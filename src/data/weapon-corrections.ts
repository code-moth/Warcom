/**
 * Documented repairs for damaged data in the original WEAPONS.DAT.
 *
 * legacy/WEAPONS.DAT is never edited. These corrections are applied on top of
 * the parsed original, and the app tells the user which values were repaired.
 *
 * Two kinds:
 *  - filling a value the file lacks (`expected` omitted): used only when the
 *    weapon is incomplete and the corrections cover every missing number;
 *  - replacing a value that is present but wrong (`expected` given): used only
 *    if the file still holds exactly those values, so a repair never overwrites
 *    data it was not written for.
 */
export type CritIndex = 0 | 1 | 2 | 3 | 4; // E, D, C, B, A

export interface WeaponCorrection {
  /** Weapon name exactly as it appears in WEAPONS.DAT. */
  weapon: string;
  /** Armor type 1-20 the values belong to. */
  armorType: number;
  /** Critical thresholds to set, keyed by index into [E, D, C, B, A]. */
  set: Partial<Record<CritIndex, number>>;
  /** For repairs of present-but-wrong data: the values the original holds. */
  expected?: Partial<Record<CritIndex, number>>;
  /** Shown to the user. */
  note: string;
}

export const WEAPON_CORRECTIONS: readonly WeaponCorrection[] = [
  {
    weapon: 'whip',
    armorType: 1,
    set: { 4: 94 },
    note:
      'AT 1: the original file ends partway through this table, so the "A" critical threshold is missing. ' +
      'It has been interpolated as 94: the E, D, C and B thresholds sit 2, 4, 6 and 8 above those of AT 2, ' +
      'so "A" sits 10 above AT 2\'s 84, leaving a B-to-A gap of 13 (the same as AT 3 and AT 12).',
  },
  {
    weapon: 'whip',
    armorType: 13,
    set: { 4: 115 },
    expected: { 4: 155 },
    note:
      'AT 13: the original "A" threshold is 155, higher than its "B" of 127. In every other weapon "A" is below "B", ' +
      'and 155 looks like a typing slip for 115. Replaced with 115, which sits between AT 12 (110) and AT 14 (125).',
  },
  {
    weapon: 'whip',
    armorType: 16,
    set: { 0: 150, 1: 148, 2: 143, 3: 137, 4: 128 },
    expected: { 0: 0, 1: 150, 2: 147, 3: 143, 4: 135 },
    note:
      'AT 16: the original critical thresholds (none, 150, 147, 143, 135) are an exact copy of AT 18\'s, which happens in none of ' +
      'the other weapons, and its "E" is blank where its neighbors have 150 and 149. Replaced with the rounded average of ' +
      'AT 15 and AT 17: 150, 148, 143, 137, 128.',
  },
];
