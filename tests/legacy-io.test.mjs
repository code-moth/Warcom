// Round-trip and edge-case tests for the DOS .UNT / .BTL binary formats.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createUnit, createAttack } from '../build/engine/model.js';
import {
  parseUnitFile,
  parseBattleFile,
  writeUnitFile,
  writeBattleFile,
  UNIT_FIELD_WIDTHS,
  ATTACK_FIELD_WIDTHS,
} from '../build/engine/legacy-io.js';

function sampleUnit(i) {
  const u = createUnit();
  u.name = `Co. ${i} Swordsmen`.slice(0, 29);
  u.race = 'Human';
  u.type = i % 2 ? 'large' : '';
  u.weapon = 'longsword';
  u.armor = (i % 20) + 1;
  u.discipline = -20;
  u.lastMorale = i % 3 === 0 ? 'B' : '';
  u.formation = 'Line';
  u.morale = { start: 100, now: 90, mod: 0 };
  u.ob = { start: 60, now: 55, mod: 10 };
  u.db = { start: 20, now: 15, mod: -5 };
  u.exhaustion = { start: 100, now: 80, mod: 0 };
  u.movement = { start: 30, now: 30, mod: 0 };
  u.number = { start: 100 + i, now: 90 + i };
  u.hits = { start: 40, now: 35 };
  return u;
}

function sampleAttack(i, unitCount) {
  const a = createAttack();
  a.attacker = (i % unitCount) + 1;
  a.attackerSize = '25%';
  a.defender = ((i + 1) % unitCount) + 1;
  a.defenderSize = '';
  a.modifier = 10;
  a.dmx = '';
  a.spcr = '';
  a.weapon = '';
  return a;
}

test('UNT round-trip: 50-record file, no trailing bytes', () => {
  const units = Array.from({ length: 50 }, (_, i) => sampleUnit(i));
  const written = writeUnitFile(units, 50);
  assert.ok(written.ok, written.ok ? '' : written.error);
  assert.equal(written.bytes.length, 50 * 252);
  const read = parseUnitFile(written.bytes);
  assert.ok(read.ok);
  assert.equal(read.recordCount, 50);
  assert.equal(read.hadTrailingBytes, false);
  read.records.forEach((u, i) => {
    assert.equal(u.name, units[i].name);
    assert.equal(u.armor, units[i].armor);
    assert.equal(u.ob.mod, units[i].ob.mod);
    assert.equal(u.number.now, units[i].number.now);
  });
});

test('UNT round-trip: 200-record file survives the documented trailing-bytes quirk', () => {
  const units = Array.from({ length: 12 }, (_, i) => sampleUnit(i));
  const written = writeUnitFile(units, 200);
  assert.ok(written.ok);
  assert.equal(written.bytes.length, 200 * 252); // exported without the trailing bytes

  // Synthesize the "with trailing bytes" form a real DOS save would have produced:
  // the file is 27 bytes longer, and those extra bytes are meaningless filler.
  const withTrailing = new Uint8Array(written.bytes.length + 27);
  withTrailing.set(written.bytes);
  withTrailing.set([9, 9, 9, 9, 9], written.bytes.length); // arbitrary "garbage" tail

  const read = parseUnitFile(withTrailing);
  assert.ok(read.ok);
  assert.equal(read.recordCount, 200);
  assert.equal(read.hadTrailingBytes, true);
  assert.equal(read.records[0].name, 'Co. 0 Swordsmen');
  assert.equal(read.records.length, 200);
  // Slots beyond the 12 written units are blank, not garbage.
  assert.equal(read.records[50].name, '');
  assert.equal(read.records[50].number.now, 0);
});

test('BTL round-trip: 200-record Version 2.1+ layout', () => {
  const attacks = Array.from({ length: 30 }, (_, i) => sampleAttack(i, 12));
  const written = writeBattleFile(attacks, 200);
  assert.ok(written.ok);
  const read = parseBattleFile(written.bytes);
  assert.ok(read.ok);
  assert.equal(read.recordCount, 200);
  read.records.slice(0, 30).forEach((a, i) => {
    assert.equal(a.attacker, attacks[i].attacker);
    assert.equal(a.attackerSize, attacks[i].attackerSize);
    assert.equal(a.modifier, attacks[i].modifier);
  });
  // Untouched slots decode as blank attacks (attacker 0), not garbage.
  assert.equal(read.records[199].attacker, 0);
});

test('a value that does not fit the legacy field width is reported, not truncated', () => {
  const units = [createUnit()];
  units[0].name = 'A name that is much too long for the original 29-character field';
  const written = writeUnitFile(units, 50);
  assert.equal(written.ok, false);
  assert.equal(written.tooLong.length, 1);
  assert.equal(written.tooLong[0].field, 'Name');
  assert.equal(written.tooLong[0].limit, UNIT_FIELD_WIDTHS[0]);
});

test('discipline modifier too extreme for the 3-character legacy field is reported', () => {
  const units = [createUnit()];
  units[0].discipline = -100; // "-100" is 4 characters; the field holds 3
  const written = writeUnitFile(units, 50);
  assert.equal(written.ok, false);
  assert.equal(written.tooLong[0].field, 'Discipline mod');
});

test('too many units for the chosen record count is an error, not silent truncation', () => {
  const units = Array.from({ length: 60 }, (_, i) => sampleUnit(i));
  const written = writeUnitFile(units, 50);
  assert.equal(written.ok, false);
  assert.match(written.error, /50-record/);
});

test('a file of the wrong length is rejected outright', () => {
  const bogus = new Uint8Array(12345);
  const unitResult = parseUnitFile(bogus);
  assert.equal(unitResult.ok, false);
  const attackResult = parseBattleFile(bogus);
  assert.equal(attackResult.ok, false);
});

test('an old pre-2.1 battle file (different field count) is rejected, not misread', () => {
  // Older BTL files had fewer fields per record; a length that matches
  // neither the 50- nor 200-record V2.1 layout must be refused outright.
  const oldStyle = new Uint8Array(50 * 40); // an invented shorter record size
  const result = parseBattleFile(oldStyle);
  assert.equal(result.ok, false);
});

test('attack field widths are exactly the original screen capacities', () => {
  assert.deepEqual(ATTACK_FIELD_WIDTHS, [3, 4, 3, 4, 4, 1, 1, 30]);
});
