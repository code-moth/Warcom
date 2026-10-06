/**
 * WARCOM data model.
 *
 * Unit and attack numbers are 1-based (0 = "blank"), exactly as in the DOS
 * editor, so legacy .UNT / .BTL files and attack references round-trip.
 */
export const MAX_UNITS = 200;
export const MAX_ATTACKS = 200;
export const STAT_LIMIT = 9999;
