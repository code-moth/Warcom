/**
 * Parser for WEAPONS.DAT, mirroring initWeap() in RESOLVE.CPP.
 *
 * File layout, repeated per weapon:
 *
 *     %name of weapon
 *     %max,start,min,E,D,C,B,A      <- armor type 20
 *     ...                           <- armor types 19 down to 1
 *
 * Numbers are read sequentially. The DOS reader used fscanf() into a single
 * variable, so when the file ended early the last value read was silently
 * reused. That behaviour is reproduced here, and the weapon is flagged
 * `complete: false` so the app can refuse to pretend the table is sound.
 */
const NUMBERS_PER_TABLE = 20 * 8;
export function parseWeaponsDat(text, corrections = []) {
    const weapons = [];
    let pos = 0;
    for (;;) {
        const start = text.indexOf('%', pos);
        if (start < 0)
            break;
        // Name: rest of the line, at most 29 characters, ended by any control character.
        let nameEnd = start + 1;
        while (nameEnd < text.length && nameEnd - (start + 1) < 29 && text.charCodeAt(nameEnd) >= 32)
            nameEnd++;
        const name = text.slice(start + 1, nameEnd);
        const tableStart = text.indexOf('%', start + 1);
        if (tableStart < 0)
            break;
        const nextWeapon = text.indexOf('%', tableStart + 1);
        const body = text.slice(tableStart + 1, nextWeapon < 0 ? text.length : nextWeapon);
        pos = nextWeapon < 0 ? text.length : nextWeapon;
        const tokens = (body.match(/-?\d+/g) ?? []).map((t) => parseInt(t, 10));
        const nums = [];
        let last = 0;
        for (let i = 0; i < NUMBERS_PER_TABLE; i++) {
            if (i < tokens.length)
                last = tokens[i];
            nums.push(last);
        }
        const missing = Math.max(0, NUMBERS_PER_TABLE - tokens.length);
        // File order is armor type 20 first; store AT1 first.
        const rows = new Array(20);
        for (let fileRow = 0; fileRow < 20; fileRow++) {
            const o = fileRow * 8;
            rows[19 - fileRow] = {
                max: nums[o] & 255,
                start: nums[o + 1] & 255,
                min: nums[o + 2] & 255,
                crit: [nums[o + 3] & 255, nums[o + 4] & 255, nums[o + 5] & 255, nums[o + 6] & 255, nums[o + 7] & 255],
            };
        }
        const weapon = { name, rows, complete: missing === 0, missing };
        applyCorrections(weapon, corrections);
        weapons.push(weapon);
        if (nextWeapon < 0)
            break;
    }
    return weapons;
}
/**
 * Repairs damaged data. A "fill" correction (no `expected`) is used only when
 * the weapon is incomplete and the fills cover every missing number, so a table
 * damaged in some other way is never silently "repaired". A "replace"
 * correction is used only if the original still holds the values it expects.
 */
function applyCorrections(weapon, corrections) {
    const mine = corrections.filter((c) => c.weapon === weapon.name);
    if (mine.length === 0)
        return;
    const notes = [];
    const fills = mine.filter((c) => !c.expected);
    const fillCount = fills.reduce((n, c) => n + Object.keys(c.set).length, 0);
    if (!weapon.complete && fills.length > 0 && fillCount === weapon.missing) {
        for (const c of fills) {
            const row = weapon.rows[c.armorType - 1];
            if (!row)
                continue;
            for (const [k, v] of Object.entries(c.set))
                row.crit[Number(k)] = v & 255;
            notes.push(c.note);
        }
        weapon.complete = true;
    }
    for (const c of mine.filter((c) => c.expected)) {
        const row = weapon.rows[c.armorType - 1];
        if (!row)
            continue;
        const matches = Object.entries(c.expected).every(([k, v]) => row.crit[Number(k)] === v);
        if (!matches)
            continue;
        for (const [k, v] of Object.entries(c.set))
            row.crit[Number(k)] = v & 255;
        notes.push(c.note);
    }
    if (notes.length)
        weapon.corrections = notes;
}
