/**
 * Reader/writer for the original DOS binary formats: .UNT (units) and
 * .BTL (attacks, "2.1+" 8-field layout only).
 *
 * Field widths below are the exact character capacities of the DOS screen
 * fields (SCRN1.TXT for units, SCRN2.TXT for attacks). Each field is stored
 * on disk as (width) ASCII bytes: the value, then a NUL terminator, then
 * NUL padding to fill the slot - this is what Field::getString() /
 * DataSet::putData() produced.
 *
 * ODD BUT DOCUMENTED QUIRK: DataSet::saveData() / restoreData() write and
 * read (recordSize + fieldCount) bytes per record, but fseek() to
 * (record * recordSize). Every record's write therefore overlaps the next
 * record's first (fieldCount) bytes with its own unread "tail" - harmless
 * for every record except the last, whose tail runs (fieldCount) bytes past
 * the end of the otherwise-expected file. The original README documents
 * this directly: legacy files may be read "with or without their extra
 * trailing bytes." Both lengths are accepted here for both 50- and
 * 200-record files; exports are written WITHOUT the trailing bytes, which
 * is the shorter and cleaner of the two forms.
 */
import { createAttack, createUnit } from './model.js';
import { atoi } from './resolve.js';
/** Character capacity of each of the 27 unit fields, U_NAME..U_HT_N order. */
export const UNIT_FIELD_WIDTHS = [30, 30, 30, 28, 2, 3, 1, 25, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
/** Character capacity of each of the 8 attack fields, A_ATT..A_WEAPON order. */
export const ATTACK_FIELD_WIDTHS = [3, 4, 3, 4, 4, 1, 1, 30];
const UNIT_SLOT_SIZES = UNIT_FIELD_WIDTHS.map((w) => w + 1);
const ATTACK_SLOT_SIZES = ATTACK_FIELD_WIDTHS.map((w) => w + 1);
const UNIT_RECORD_SIZE = UNIT_SLOT_SIZES.reduce((a, b) => a + b, 0); // 252
const ATTACK_RECORD_SIZE = ATTACK_SLOT_SIZES.reduce((a, b) => a + b, 0); // 58
const UNIT_FIELD_COUNT = UNIT_FIELD_WIDTHS.length; // 27, the saveData() "tail" overlap size
const ATTACK_FIELD_COUNT = ATTACK_FIELD_WIDTHS.length; // 8
const SUPPORTED_UNIT_COUNTS = [50, 200];
function decodeSlot(bytes, offset, width) {
    const slot = bytes.subarray(offset, offset + width + 1);
    let end = slot.indexOf(0);
    if (end < 0)
        end = slot.length;
    // DOS text is single-byte (codepage 437); latin1 keeps a 1:1 byte<->char mapping.
    let s = '';
    for (let i = 0; i < end; i++)
        s += String.fromCharCode(slot[i]);
    return s;
}
function offsetsFor(widths) {
    const offsets = [];
    let pos = 0;
    for (const w of widths) {
        offsets.push(pos);
        pos += w + 1;
    }
    return offsets;
}
const UNIT_OFFSETS = offsetsFor(UNIT_FIELD_WIDTHS);
const ATTACK_OFFSETS = offsetsFor(ATTACK_FIELD_WIDTHS);
function decodeUnitRecord(bytes, recordStart) {
    const s = (i) => decodeSlot(bytes, recordStart + UNIT_OFFSETS[i], UNIT_FIELD_WIDTHS[i]);
    const n = (i) => atoi(s(i));
    const u = createUnit();
    u.name = s(0);
    u.race = s(1);
    u.type = s(2);
    u.weapon = s(3);
    u.armor = n(4);
    u.discipline = n(5);
    u.lastMorale = s(6).trim();
    u.formation = s(7);
    u.morale = { start: n(8), now: n(9), mod: n(10) };
    u.ob = { start: n(11), now: n(12), mod: n(13) };
    u.db = { start: n(14), now: n(15), mod: n(16) };
    u.exhaustion = { start: n(17), now: n(18), mod: n(19) };
    u.movement = { start: n(20), now: n(21), mod: n(22) };
    u.number = { start: n(23), now: n(24) };
    u.hits = { start: n(25), now: n(26) };
    return u;
}
function decodeAttackRecord(bytes, recordStart) {
    const s = (i) => decodeSlot(bytes, recordStart + ATTACK_OFFSETS[i], ATTACK_FIELD_WIDTHS[i]);
    const n = (i) => atoi(s(i));
    const a = createAttack();
    a.attacker = n(0);
    a.attackerSize = s(1).trim();
    a.defender = n(2);
    a.defenderSize = s(3).trim();
    a.modifier = n(4);
    a.dmx = s(5).trim();
    a.spcr = s(6).trim();
    a.weapon = s(7);
    return a;
}
/** Which (recordCount, hadTrailingBytes) combination, if any, matches this file length. */
function matchLength(byteLength, recordSize, fieldCount) {
    for (const recordCount of SUPPORTED_UNIT_COUNTS) {
        if (byteLength === recordCount * recordSize)
            return { recordCount, hadTrailingBytes: false };
        if (byteLength === recordCount * recordSize + fieldCount)
            return { recordCount, hadTrailingBytes: true };
    }
    return null;
}
/**
 * Parse a .UNT file. Accepts the 50- and 200-record layouts, with or
 * without the documented trailing bytes.
 */
export function parseUnitFile(bytes) {
    const m = matchLength(bytes.length, UNIT_RECORD_SIZE, UNIT_FIELD_COUNT);
    if (!m) {
        return {
            ok: false,
            error: `This is ${bytes.length} bytes, which is not a recognized WARCOM unit file. ` +
                `Expected 50 or 200 unit records (${50 * UNIT_RECORD_SIZE} or ${200 * UNIT_RECORD_SIZE} bytes, ` +
                `optionally ${UNIT_FIELD_COUNT} bytes longer).`,
        };
    }
    const units = [];
    for (let r = 0; r < m.recordCount; r++)
        units.push(decodeUnitRecord(bytes, r * UNIT_RECORD_SIZE));
    return { ok: true, records: units, hadTrailingBytes: m.hadTrailingBytes, recordCount: m.recordCount };
}
/**
 * Parse a .BTL file. Only the Version 2.1+ eight-field attack layout is
 * understood; older, shorter attack records are rejected rather than
 * misread, exactly as the original README specifies.
 */
export function parseBattleFile(bytes) {
    const m = matchLength(bytes.length, ATTACK_RECORD_SIZE, ATTACK_FIELD_COUNT);
    if (!m) {
        return {
            ok: false,
            error: `This is ${bytes.length} bytes, which is not a recognized Version 2.1+ WARCOM battle file. ` +
                `Expected 50 or 200 attack records (${50 * ATTACK_RECORD_SIZE} or ${200 * ATTACK_RECORD_SIZE} bytes, ` +
                `optionally ${ATTACK_FIELD_COUNT} bytes longer). Older battle files used a different layout and are not supported.`,
        };
    }
    const attacks = [];
    for (let r = 0; r < m.recordCount; r++)
        attacks.push(decodeAttackRecord(bytes, r * ATTACK_RECORD_SIZE));
    return { ok: true, records: attacks, hadTrailingBytes: m.hadTrailingBytes, recordCount: m.recordCount };
}
function encodeSlot(target, offset, width, value, problems, record, field) {
    if (value.length > width) {
        problems.push({ record, field, value, limit: width });
        return;
    }
    for (let i = 0; i < value.length; i++) {
        const code = value.charCodeAt(i);
        if (code > 255) {
            problems.push({ record, field, value, limit: width });
            return;
        }
        target[offset + i] = code;
    }
    // Remaining bytes in the slot (the terminator and any padding) are already zero.
}
const UNIT_FIELD_NAMES = [
    'Name', 'Race', 'Type', 'Weapon', 'Armor type', 'Discipline mod', 'Last morale check', 'Formation',
    'Morale start', 'Morale now', 'Morale mod', 'OB start', 'OB now', 'OB mod', 'DB start', 'DB now', 'DB mod',
    'Exhaustion start', 'Exhaustion now', 'Exhaustion mod', 'Movement start', 'Movement now', 'Movement mod',
    'Number start', 'Number now', 'Hits start', 'Hits now',
];
const ATTACK_FIELD_NAMES = ['Attacker #', 'Attacker size', 'Defender #', 'Defender size', 'Modifier', 'Dmx', 'SpCr', 'Weapon'];
function unitFieldStrings(u) {
    return [
        u.name, u.race, u.type, u.weapon, String(u.armor), String(u.discipline), u.lastMorale, u.formation,
        String(u.morale.start), String(u.morale.now), String(u.morale.mod),
        String(u.ob.start), String(u.ob.now), String(u.ob.mod),
        String(u.db.start), String(u.db.now), String(u.db.mod),
        String(u.exhaustion.start), String(u.exhaustion.now), String(u.exhaustion.mod),
        String(u.movement.start), String(u.movement.now), String(u.movement.mod),
        String(u.number.start), String(u.number.now),
        String(u.hits.start), String(u.hits.now),
    ];
}
function attackFieldStrings(a) {
    return [
        a.attacker ? String(a.attacker) : '',
        a.attackerSize,
        a.defender ? String(a.defender) : '',
        a.defenderSize,
        String(a.modifier),
        a.dmx,
        a.spcr,
        a.weapon,
    ];
}
/**
 * Write a .UNT file. `recordCount` picks the 50- or 200-slot layout; units
 * beyond that count are an error, not a silent truncation. Long or
 * non-ASCII field values are reported rather than truncated, matching the
 * original's own behaviour.
 */
export function writeUnitFile(units, recordCount) {
    if (units.length > recordCount) {
        return {
            ok: false,
            tooLong: [],
            error: `${units.length} units do not fit in a ${recordCount}-record file. Choose the 200-record format, or reduce the roster.`,
        };
    }
    const bytes = new Uint8Array(recordCount * UNIT_RECORD_SIZE);
    const problems = [];
    for (let r = 0; r < recordCount; r++) {
        const unit = units[r];
        if (!unit)
            continue;
        const values = unitFieldStrings(unit);
        for (let i = 0; i < UNIT_FIELD_COUNT; i++) {
            encodeSlot(bytes, r * UNIT_RECORD_SIZE + UNIT_OFFSETS[i], UNIT_FIELD_WIDTHS[i], values[i], problems, r + 1, UNIT_FIELD_NAMES[i]);
        }
    }
    if (problems.length) {
        return {
            ok: false,
            tooLong: problems,
            error: `${problems.length} field(s) do not fit the legacy format's short text limits (see details).`,
        };
    }
    return { ok: true, bytes };
}
/** Write a .BTL file (Version 2.1+ layout). See writeUnitFile() for the validation policy. */
export function writeBattleFile(attacks, recordCount) {
    if (attacks.length > recordCount) {
        return {
            ok: false,
            tooLong: [],
            error: `${attacks.length} attacks do not fit in a ${recordCount}-record file. Choose the 200-record format, or reduce the queue.`,
        };
    }
    const bytes = new Uint8Array(recordCount * ATTACK_RECORD_SIZE);
    const problems = [];
    for (let r = 0; r < recordCount; r++) {
        const attack = attacks[r];
        if (!attack)
            continue;
        const values = attackFieldStrings(attack);
        for (let i = 0; i < ATTACK_FIELD_COUNT; i++) {
            encodeSlot(bytes, r * ATTACK_RECORD_SIZE + ATTACK_OFFSETS[i], ATTACK_FIELD_WIDTHS[i], values[i], problems, r + 1, ATTACK_FIELD_NAMES[i]);
        }
    }
    if (problems.length) {
        return {
            ok: false,
            tooLong: problems,
            error: `${problems.length} field(s) do not fit the legacy format's short text limits (see details).`,
        };
    }
    return { ok: true, bytes };
}
