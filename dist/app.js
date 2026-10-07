// Warcom Command — application layer over the verified combat engine.
// The engine (./engine/*.js) is a faithful port of the original RESOLVE.CPP,
// checked bit-for-bit against the compiled original (see /tests in the
// project source). Everything in this file is new: state, rendering, and
// the file formats used to move data in and out.

import { MAX_UNITS, MAX_ATTACKS } from './engine/types.js';
import {
  createUnit, createAttack, defaultSettings, resetUnitStats, strengthPercent,
  removeUnitAt, insertUnitAfter, canAddUnit, canAddAttack, isUnitBlank,
} from './engine/model.js';
import { parseWeaponsDat } from './engine/weapons.js';
import { WEAPONS_DAT } from './data/weapons-dat.js';
import { WEAPON_CORRECTIONS } from './data/weapon-corrections.js';
import { resolveRound, resolveSingle, previewAttack, findWeapon } from './engine/resolve.js';
import { Rng } from './engine/rng.js';
import {
  parseUnitFile, parseBattleFile, writeUnitFile, writeBattleFile,
} from './engine/legacy-io.js';

const WEAPONS = parseWeaponsDat(WEAPONS_DAT, WEAPON_CORRECTIONS);
const USABLE_WEAPON_NAMES = WEAPONS.filter((w) => w.complete).map((w) => w.name).sort((a, b) => a.localeCompare(b));

const DRAFT_KEY = 'warcom-command-draft-v1';
const SIZE_TYPES = ['', 'Small', 'Type I', 'Type II', 'Large', 'Super-large', 'No stun'];

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

function sampleState() {
  const u = (over) => Object.assign(createUnit(), over);
  const units = [
    u({ name: '1st Foot', race: 'Human', type: '', weapon: 'longsword', armor: 12, discipline: -20,
      morale: { start: 100, now: 100, mod: 0 }, ob: { start: 55, now: 55, mod: 0 }, db: { start: 15, now: 15, mod: 0 },
      exhaustion: { start: 100, now: 100, mod: 0 }, movement: { start: 20, now: 20, mod: 0 },
      number: { start: 120, now: 120 }, hits: { start: 42, now: 42 } }),
    u({ name: 'Longbow Levy', race: 'Human', type: '', weapon: 'longbow', armor: 4, discipline: -35,
      morale: { start: 100, now: 100, mod: 0 }, ob: { start: 45, now: 45, mod: 0 }, db: { start: 5, now: 5, mod: 0 },
      exhaustion: { start: 100, now: 100, mod: 0 }, movement: { start: 25, now: 25, mod: 0 },
      number: { start: 80, now: 80 }, hits: { start: 30, now: 30 } }),
    u({ name: 'Raider Warband', race: 'Orc', type: '', weapon: 'battle ax', armor: 8, discipline: -60,
      morale: { start: 90, now: 90, mod: 0 }, ob: { start: 60, now: 60, mod: 0 }, db: { start: 10, now: 10, mod: 0 },
      exhaustion: { start: 100, now: 100, mod: 0 }, movement: { start: 25, now: 25, mod: 0 },
      number: { start: 100, now: 100 }, hits: { start: 45, now: 45 } }),
    u({ name: 'Outrider Cavalry', race: 'Orc', type: '', weapon: 'lance', armor: 10, discipline: -35,
      morale: { start: 100, now: 100, mod: 0 }, ob: { start: 65, now: 65, mod: 10 }, db: { start: 15, now: 15, mod: 0 },
      exhaustion: { start: 100, now: 100, mod: 0 }, movement: { start: 40, now: 40, mod: 0 },
      number: { start: 40, now: 40 }, hits: { start: 50, now: 50 } }),
  ];
  const attacks = [
    Object.assign(createAttack(), { attacker: 1, attackerSize: '25%', defender: 3, defenderSize: '25%', modifier: 0 }),
    Object.assign(createAttack(), { attacker: 2, attackerSize: '', defender: 4, defenderSize: '10%', modifier: 10 }),
    Object.assign(createAttack(), { attacker: 3, attackerSize: '25%', defender: 1, defenderSize: '25%', modifier: -10 }),
  ];
  return { battleName: 'Training bout (sample)', units, attacks, log: [], roundCounter: 0, settings: defaultSettings() };
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.units)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveDraft() {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      battleName: state.battleName, units: state.units, attacks: state.attacks,
      log: state.log, roundCounter: state.roundCounter, settings: state.settings,
    }));
  } catch { /* private browsing, quota, etc. — the app still works without it */ }
}

const draft = loadDraft();
const initial = draft && (draft.units.some((u) => !isUnitBlank(u)) || draft.attacks?.length) ? draft : sampleState();

const state = {
  battleName: initial.battleName ?? '',
  units: initial.units,
  attacks: initial.attacks ?? [],
  log: initial.log ?? [],
  roundCounter: initial.roundCounter ?? 0,
  settings: Object.assign(defaultSettings(), initial.settings ?? {}),
  ui: { selectedUnit: 0, activeTab: 'unit', rosterFilter: '', selectedWeapon: WEAPONS[0]?.name ?? null },
};
if (state.units.length && !state.ui.selectedUnit) state.ui.selectedUnit = state.units.findIndex((u) => !isUnitBlank(u)) + 1 || 1;

let liveRng = Rng.fromSeed((Date.now() ^ Math.floor(performance.now() * 1000)) >>> 0);
function rngForResolve() {
  return state.settings.fixedSeed ? Rng.fromSeed(state.settings.seed >>> 0) : liveRng;
}
function engineSettings() {
  return { constantModifiers: state.settings.constantModifiers, legacyArmorIndexing: state.settings.legacyArmorIndexing };
}

function invalidateUndo() {
  const last = state.log[state.log.length - 1];
  if (last) last.undoSnapshot = null;
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

const $ = (id) => document.getElementById(id);
const el = (tag, props, ...children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === undefined || c === null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
};
const escAttr = (s) => String(s).replace(/"/g, '&quot;');

let statusTimer = null;
function showStatus(message, kind = 'info') {
  const root = $('statusRoot');
  root.innerHTML = '';
  root.append(el('div', { class: `status-banner ${kind === 'error' ? 'error' : kind === 'ok' ? 'ok' : ''}` }, message));
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { root.innerHTML = ''; }, 4200);
}

function closeModal() { $('modalRoot').innerHTML = ''; }
function showModal(contentNode) {
  const backdrop = el('div', { class: 'modal-backdrop', onclick: (e) => { if (e.target === backdrop) closeModal(); } },
    el('div', { class: 'modal' }, contentNode));
  $('modalRoot').innerHTML = '';
  $('modalRoot').append(backdrop);
}
function confirmModal({ title, body, confirmLabel = 'Continue', danger = false, onConfirm }) {
  const node = el('div', {},
    el('h3', {}, title),
    el('p', {}, body),
    el('div', { class: 'actions-row' },
      el('button', { class: 'btn btn-quiet', onclick: closeModal }, 'Cancel'),
      el('button', { class: `btn ${danger ? 'btn-danger' : 'btn-seal'}`, onclick: () => { closeModal(); onConfirm(); } }, confirmLabel),
    ));
  showModal(node);
}

// ---------------------------------------------------------------------------
// Downloads capability (claude.ai artifact runtime)
// ---------------------------------------------------------------------------

const downloadsPromise = (window.claude && typeof window.claude.use === 'function')
  ? window.claude.use('downloads').catch(() => null)
  : Promise.resolve(null);

async function offerDownload(filename, data) {
  const downloads = await downloadsPromise;
  if (!downloads) { showStatus('File saving is not available in this view.', 'error'); return; }
  try {
    await downloads.save({ filename, data });
    showStatus(`Saved ${filename}.`, 'ok');
  } catch (e) {
    const code = e && e.code;
    if (code === 'declined') return;
    if (code === 'rejected_extension' || code === 'extension_not_enabled') showStatus('That file format cannot be saved from here.', 'error');
    else if (code === 'rate_limited') showStatus('Please wait a moment and try saving again.', 'error');
    else showStatus('Could not save the file.', 'error');
  }
}

function requireJsZip() {
  if (typeof JSZip === 'undefined') throw new Error('The zip file library did not load, so legacy files cannot be zipped right now. Try again in a moment.');
}

async function zipOf(innerName, bytes) {
  requireJsZip();
  const zip = new JSZip();
  zip.file(innerName, bytes);
  return zip.generateAsync({ type: 'uint8array' });
}

// ---------------------------------------------------------------------------
// Roster
// ---------------------------------------------------------------------------

function unitStatus(n) {
  let attacking = false, defending = false;
  for (const a of state.attacks) {
    if (a.attacker === n) attacking = true;
    if (a.defender === n) defending = true;
  }
  return { attacking, defending };
}

function renderRoster() {
  const list = $('rosterList');
  list.innerHTML = '';
  const filter = state.ui.rosterFilter.trim().toLowerCase();
  let shown = 0;
  state.units.forEach((u, idx) => {
    const n = idx + 1;
    const blank = isUnitBlank(u);
    if (blank && n !== state.ui.selectedUnit) return;
    if (filter && !(u.name.toLowerCase().includes(filter) || u.race.toLowerCase().includes(filter))) return;
    shown++;
    const pct = strengthPercent(u);
    const { attacking, defending } = unitStatus(n);
    const row = el('button', {
      class: `roster-row${n === state.ui.selectedUnit ? ' selected' : ''}`,
      onclick: () => { state.ui.selectedUnit = n; state.ui.activeTab = 'unit'; render(); },
    },
      el('span', { class: 'rr-num num' }, `#${n}`),
      el('span', { class: `rr-name${blank ? ' blank' : ''}` }, blank ? '(empty slot)' : (u.name.trim() || `Unit ${n}`)),
      el('span', { class: 'rr-icons' },
        attacking ? el('span', { class: 'stamp', style: 'background:color-mix(in srgb, var(--accent-red) 25%, transparent); color:var(--accent-red)', title: 'Attacking this round' }, 'A') : null,
        defending ? el('span', { class: 'stamp', style: 'background:color-mix(in srgb, var(--accent-blue) 25%, transparent); color:var(--accent-blue)', title: 'Defending this round' }, 'D') : null,
        u.lastMorale ? el('span', { class: `stamp stamp-morale-${u.lastMorale}`, title: `Last morale failure: ${u.lastMorale}` }, u.lastMorale) : null,
      ),
      el('span', { class: 'rr-pct' }, pct === null ? '' : `${pct}%`),
    );
    list.append(row);
  });
  if (!shown) list.append(el('div', { class: 'roster-empty' }, filter ? 'No units match that filter.' : 'No units yet.'));
}

// ---------------------------------------------------------------------------
// Tab strip
// ---------------------------------------------------------------------------

function renderTabStrip() {
  document.querySelectorAll('.tab-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === state.ui.activeTab));
  const nonBlankAttacks = state.attacks.filter((a) => a.attacker || a.defender).length;
  $('tabAttackCount').textContent = nonBlankAttacks ? `(${nonBlankAttacks})` : '';
  $('tabLogCount').textContent = state.log.length ? `(${state.log.length})` : '';
  $('queueSummary').textContent = `${nonBlankAttacks} attack${nonBlankAttacks === 1 ? '' : 's'} queued · round ${state.roundCounter}`;
  $('resolveAllBtn').disabled = nonBlankAttacks === 0;
}

// ---------------------------------------------------------------------------
// Unit tab
// ---------------------------------------------------------------------------

function statRow(label, stat, onChange, opts = {}) {
  const cell = (key, val) => el('td', { class: 'num' }, el('input', {
    class: 'cell', type: 'number', value: val, 'aria-label': `${label} ${key}`,
    onchange: (e) => { stat[key] = parseIntSafe(e.target.value); onChange(); },
  }));
  return el('tr', { class: 'stat-row' },
    el('th', { class: 'rowlabel' }, label),
    cell('start', stat.start),
    cell('now', stat.now),
    opts.noMod ? el('td', {}, '') : cell('mod', stat.mod),
  );
}
function parseIntSafe(v) { const n = parseInt(v, 10); return Number.isFinite(n) ? n : 0; }

function renderUnitTab(container) {
  const n = state.ui.selectedUnit;
  const u = state.units[n - 1];
  if (!u) { container.append(el('p', { class: 'panel-empty' }, 'Select a unit from the roster, or add one.')); return; }

  const touch = () => { invalidateUndo(); renderRoster(); renderTabStrip(); saveDraft(); };
  const textField = (label, key, opts = {}) => el('div', { class: `field${opts.wide ? ' wide' : ''}` },
    el('label', { for: `f-${key}` }, label),
    opts.list
      ? el('input', { id: `f-${key}`, list: opts.list, value: u[key], maxlength: opts.maxlength ?? 60, onchange: (e) => { u[key] = e.target.value; touch(); } })
      : el('input', { id: `f-${key}`, value: u[key], maxlength: opts.maxlength ?? 60, placeholder: opts.placeholder ?? '', onchange: (e) => { u[key] = e.target.value; touch(); } }),
  );
  const numberField = (label, key, opts = {}) => el('div', { class: 'field' },
    el('label', { for: `f-${key}` }, label),
    el('input', { id: `f-${key}`, type: 'number', value: u[key], onchange: (e) => { u[key] = parseIntSafe(e.target.value); touch(); } }),
    opts.hint ? el('div', { class: 'hint' }, opts.hint) : null,
  );

  const weaponOk = findWeapon({ attacker: n, attackerSize: '', defender: n, defenderSize: '', modifier: 0, dmx: '', spcr: '', weapon: '' }, state.units, WEAPONS);

  const section = el('div', {},
    el('section', { class: 'block' },
      el('h3', {}, 'Identity'),
      el('div', { class: 'field-grid' },
        textField('Name', 'name', { maxlength: 60 }),
        textField('Race', 'race'),
        textField('Type (size class)', 'type', { list: 'sizeTypesList', placeholder: 'Normal' }),
        textField('Formation', 'formation'),
        textField('Weapon', 'weapon', { list: 'weaponsList' }),
        numberField('Armor type (1–20)', 'armor'),
        numberField('Discipline modifier', 'discipline', { hint: 'Elite ≈ −5, average ≈ −20, poor ≈ −60' }),
      ),
      !weaponOk.ok ? el('div', { class: 'cell-note' }, weaponOk.message) : null,
      u.lastMorale ? el('div', { class: 'hint' }, `Last morale check: failure grade ${u.lastMorale}`) : null,
    ),
    el('section', { class: 'block' },
      el('h3', {}, 'Statistics'),
      el('table', { class: 'ledger' },
        el('thead', {}, el('tr', {}, el('th', {}, ''), el('th', { class: 'num' }, 'Start'), el('th', { class: 'num' }, 'Now'), el('th', { class: 'num' }, 'Mod'))),
        el('tbody', {},
          statRow('Morale', u.morale, touch),
          statRow('OB', u.ob, touch),
          statRow('DB', u.db, touch),
          statRow('Exhaustion', u.exhaustion, touch),
          statRow('Movement', u.movement, touch),
          statRow('Number', u.number, touch, { noMod: true }),
          statRow('Average hits', u.hits, touch, { noMod: true }),
        ),
      ),
    ),
    el('div', { class: 'actions-row' },
      el('button', { class: 'btn', onclick: () => { resetUnitStats(u); touch(); render(); } }, 'Reset stats to start'),
      el('button', { class: 'btn', onclick: () => {
        if (!canAddUnit(state.units)) { showStatus(`The roster is at the ${MAX_UNITS}-unit limit.`, 'error'); return; }
        const copy = JSON.parse(JSON.stringify(u));
        const at = insertUnitAfter(state.units, state.attacks, n - 1, copy);
        state.ui.selectedUnit = at + 1; touch(); render();
      } }, 'Duplicate unit'),
      el('button', { class: 'btn btn-danger', onclick: () => {
        confirmModal({
          title: 'Clear this unit?', body: 'All fields for this unit will be blanked. This does not remove its slot or renumber other units.',
          confirmLabel: 'Clear unit', danger: true,
          onConfirm: () => { state.units[n - 1] = createUnit(); touch(); render(); },
        });
      } }, 'Clear unit'),
      el('button', { class: 'btn btn-danger', onclick: () => {
        confirmModal({
          title: 'Remove this unit?', body: 'The unit is deleted, any attacks naming it lose that reference, and later units renumber down by one.',
          confirmLabel: 'Remove unit', danger: true,
          onConfirm: () => {
            removeUnitAt(state.units, state.attacks, n - 1);
            state.ui.selectedUnit = Math.min(n, state.units.length);
            touch(); render();
          },
        });
      } }, 'Remove unit'),
    ),
  );
  container.append(section);
}

// ---------------------------------------------------------------------------
// Attacks tab
// ---------------------------------------------------------------------------

function unitOptionLabel(idx) {
  const u = state.units[idx];
  if (!u) return '';
  return `#${idx + 1} ${u.name.trim() || '(unnamed)'}`;
}

function renderAttacksTab(container) {
  const rows = state.attacks.map((a, i) => [a, i]).filter(([a]) => a.attacker || a.defender || a.attackerSize || a.defenderSize || a.weapon.trim());

  const touch = () => { invalidateUndo(); renderRoster(); renderTabStrip(); saveDraft(); };

  const table = el('table', { class: 'queue' },
    el('thead', {}, el('tr', {},
      el('th', {}, '#'), el('th', {}, 'Attacker'), el('th', {}, 'Size'), el('th', {}, 'Defender'), el('th', {}, 'Size'),
      el('th', {}, 'Mod'), el('th', {}, 'Dmx'), el('th', {}, 'SpCr'), el('th', {}, 'Weapon override'), el('th', {}, ''),
    )),
  );
  const tbody = el('tbody');
  table.append(tbody);

  function unitSelect(value, onChange) {
    const sel = el('select', { onchange: (e) => { onChange(parseIntSafe(e.target.value)); touch(); render(); } });
    sel.append(el('option', { value: 0 }, '—'));
    state.units.forEach((u, idx) => { if (!isUnitBlank(u) || idx + 1 === value) sel.append(el('option', { value: idx + 1, selected: idx + 1 === value }, unitOptionLabel(idx))); });
    return sel;
  }

  rows.forEach(([a, i]) => {
    const preview = previewAttack(a, state.units, WEAPONS);
    const tr = el('tr', { class: preview.ok === false && preview.problem ? 'problem' : '' });
    tr.append(
      el('td', { class: 'num' }, String(i + 1)),
      el('td', {}, unitSelect(a.attacker, (v) => { a.attacker = v; })),
      el('td', {}, el('input', { value: a.attackerSize, placeholder: 'all', onchange: (e) => { a.attackerSize = e.target.value.trim(); touch(); render(); } })),
      el('td', {}, unitSelect(a.defender, (v) => { a.defender = v; })),
      el('td', {}, el('input', { value: a.defenderSize, placeholder: 'all', onchange: (e) => { a.defenderSize = e.target.value.trim(); touch(); render(); } })),
      el('td', {}, el('input', { type: 'number', value: a.modifier, onchange: (e) => { a.modifier = parseIntSafe(e.target.value); touch(); } })),
      el('td', {}, el('input', { value: a.dmx, maxlength: 1, style: 'width:3em', onchange: (e) => { a.dmx = e.target.value.trim(); touch(); render(); } })),
      el('td', {}, el('select', { onchange: (e) => { a.spcr = e.target.value; touch(); render(); } },
        [['', 'normal'], ['d', 'double'], ['k', 'kata'], ['m', 'magic'], ['h', 'holy'], ['s', 'slaying']].map(([v, label]) => el('option', { value: v, selected: a.spcr === v }, label)),
      )),
      el('td', {}, el('input', { value: a.weapon, list: 'weaponsList', placeholder: '(unit weapon)', onchange: (e) => { a.weapon = e.target.value; touch(); render(); } })),
      el('td', {},
        el('button', { class: 'btn btn-sm', disabled: !preview.ok, title: 'Resolve just this attack now',
          onclick: () => resolveOne(i) }, 'Resolve'),
        el('button', { class: 'icon-btn', title: 'Remove this attack', onclick: () => { state.attacks.splice(i, 1); touch(); render(); } }, '✕'),
      ),
    );
    tbody.append(tr);
    if (preview.problem) {
      const note = el('tr', {}, el('td', { colspan: 10 }, el('div', { class: preview.ok ? 'preview-note' : 'cell-note' }, preview.problem)));
      tbody.append(note);
    } else if (preview.ok) {
      const note = el('tr', {}, el('td', { colspan: 10 }, el('div', { class: 'preview-note' }, `${preview.attacks} attack${preview.attacks === 1 ? '' : 's'} against up to ${preview.targets} defender${preview.targets === 1 ? '' : 's'}`)));
      tbody.append(note);
    }
  });

  container.append(
    el('section', { class: 'block' },
      el('h3', {}, 'Attack queue'),
      rows.length ? el('div', { class: 'queue-table-wrap' }, table) : el('p', { class: 'panel-empty' }, 'No attacks queued yet.'),
      el('div', { class: 'actions-row' },
        el('button', { class: 'btn', onclick: () => {
          if (!canAddAttack(state.attacks)) { showStatus(`The queue is at the ${MAX_ATTACKS}-attack limit.`, 'error'); return; }
          state.attacks.push(createAttack()); touch(); render();
        } }, '+ Add attack'),
        rows.length ? el('button', { class: 'btn btn-danger', onclick: () => {
          confirmModal({ title: 'Clear all attacks?', body: 'Every queued attack will be removed.', danger: true, confirmLabel: 'Clear queue',
            onConfirm: () => { state.attacks = []; touch(); render(); } });
        } }, 'Clear queue') : null,
      ),
    ),
  );
}

function resolveOne(i) {
  const attack = state.attacks[i];
  const before = JSON.parse(JSON.stringify(state.units));
  const { result, error } = resolveSingle(attack, i, state.units, WEAPONS, rngForResolve(), engineSettings());
  if (error) { showStatus(error, 'error'); return; }
  if (!result) { showStatus('That attack cannot be resolved as specified.', 'error'); return; }
  pushLogEntry({ kind: 'single', results: [result], before });
  renderRoster(); renderTabStrip(); saveDraft();
  if (state.ui.activeTab === 'unit') renderTabPanels();
}

function resolveAllAttacks() {
  const queued = state.attacks.filter((a) => a.attacker || a.defender);
  if (!queued.length) return;
  const before = JSON.parse(JSON.stringify(state.units));
  const outcome = resolveRound(state.attacks, state.units, WEAPONS, rngForResolve(), engineSettings());
  if (outcome.aborted) {
    showStatus(`Round not resolved: ${outcome.aborted.message}`, 'error');
    return;
  }
  state.roundCounter += 1;
  pushLogEntry({ kind: 'round', results: outcome.results, before });
  render();
}

function pushLogEntry(entry) {
  for (const e of state.log) e.undoSnapshot = null;
  state.log.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    time: new Date().toISOString(),
    kind: entry.kind,
    results: entry.results,
    undoSnapshot: entry.before,
  });
  saveDraft();
}

// ---------------------------------------------------------------------------
// Battle log tab
// ---------------------------------------------------------------------------

function resultLine(r) {
  return el('div', { class: 'log-line' },
    el('span', {}, `#${r.attacker} ${r.attackerName || ''}`.trim()),
    el('span', { class: 'arrow' }, '→'),
    el('span', {}, `#${r.defender} ${r.defenderName || ''}`.trim()),
    el('span', { class: 'hint' }, `with ${r.weapon}, ${r.attacks} attack${r.attacks === 1 ? '' : 's'} on ${r.targets} target${r.targets === 1 ? '' : 's'}`),
    el('span', { class: 'num' }, `${r.casualties} casualt${r.casualties === 1 ? 'y' : 'ies'}`),
    el('span', { class: 'num' }, `${r.damage} hits dmg`),
    r.eliminated ? el('span', { class: 'tag elim' }, 'eliminated') : null,
    r.moraleFailure ? el('span', { class: 'tag moralefail' }, `morale ${r.moraleFailure}`) : null,
  );
}

function renderLogTab(container) {
  if (!state.log.length) { container.append(el('p', { class: 'panel-empty' }, 'No attacks have been resolved yet.')); return; }
  const list = el('div', { class: 'log-list' });
  for (let i = state.log.length - 1; i >= 0; i--) {
    const entry = state.log[i];
    const when = new Date(entry.time);
    const head = el('div', { class: 'log-entry-head' },
      el('h4', {}, entry.kind === 'round' ? 'Round resolved' : 'Single attack resolved'),
      el('span', { class: 'ts' }, when.toLocaleString()),
    );
    const canUndo = !!entry.undoSnapshot;
    const entryNode = el('div', { class: 'log-entry' },
      head,
      ...entry.results.map(resultLine),
      canUndo ? el('div', { class: 'actions-row' }, el('button', {
        class: 'btn btn-sm btn-danger',
        onclick: () => {
          confirmModal({
            title: 'Undo this resolution?', body: 'Unit statistics return to what they were immediately before this resolution. This cannot be redone.',
            danger: true, confirmLabel: 'Undo',
            onConfirm: () => {
              state.units = entry.undoSnapshot;
              state.log.splice(i, 1);
              if (entry.kind === 'round') state.roundCounter = Math.max(0, state.roundCounter - 1);
              saveDraft(); render();
            },
          });
        },
      }, 'Undo')) : null,
    );
    list.append(entryNode);
  }
  container.append(el('section', { class: 'block' }, el('h3', {}, 'Battle log'), list));
}

// ---------------------------------------------------------------------------
// Weapons tab
// ---------------------------------------------------------------------------

function renderWeaponsTab(container) {
  const list = el('div', { class: 'weapon-list' });
  WEAPONS.forEach((w) => {
    list.append(el('button', {
      class: w.name === state.ui.selectedWeapon ? 'active' : '',
      onclick: () => { state.ui.selectedWeapon = w.name; renderTabPanels(); },
    }, w.name, !w.complete ? el('span', { class: 'flag' }, '(incomplete)') : w.corrections ? el('span', { class: 'flag' }, '(repaired)') : null));
  });

  const detail = el('div', { class: 'weapon-detail' });
  const w = WEAPONS.find((x) => x.name === state.ui.selectedWeapon) ?? WEAPONS[0];
  if (w) {
    if (w.corrections) detail.append(el('div', { class: 'incomplete-banner' }, el('strong', {}, 'Repaired values: '), ...w.corrections.map((t) => el('div', { style: 'margin-top:6px' }, t))));
    if (!w.complete) detail.append(el('div', { class: 'incomplete-banner' }, `This table is missing ${w.missing} value(s) in the original data and is archived; it cannot be selected for an attack.`));
    const table = el('table', { class: 'armor-table' },
      el('thead', {}, el('tr', {}, ['Armor type', 'Max', 'Start', 'Min', 'E', 'D', 'C', 'B', 'A'].map((h) => el('th', {}, h)))),
      el('tbody', {}, w.rows.map((row, i) => el('tr', {},
        el('td', {}, `AT ${i + 1}`), el('td', {}, row.max), el('td', {}, row.start), el('td', {}, row.min),
        ...row.crit.map((c) => el('td', {}, c || '—')),
      ))),
    );
    detail.append(el('h3', { style: 'margin-bottom:10px' }, w.name), table);
  }

  container.append(el('section', { class: 'block' }, el('h3', {}, 'Weapon tables'), el('div', { class: 'weapon-layout' }, list, detail)));
}

// ---------------------------------------------------------------------------
// Settings tab
// ---------------------------------------------------------------------------

function toggleRow(label, desc, checked, onChange) {
  return el('label', { class: 'toggle-row' },
    el('input', { type: 'checkbox', checked, onchange: (e) => onChange(e.target.checked) }),
    el('div', {}, el('div', { class: 't-label' }, label), el('div', { class: 't-desc' }, desc)),
  );
}

function fileInputTrigger(accept, onFile) {
  const input = el('input', { type: 'file', accept });
  input.addEventListener('change', () => { if (input.files[0]) onFile(input.files[0]); input.value = ''; });
  document.body.append(input);
  input.click();
  setTimeout(() => input.remove(), 10000);
}

function renderSettingsTab(container) {
  const s = state.settings;
  const touch = () => saveDraft();
  container.append(
    el('section', { class: 'block' },
      el('h3', {}, 'Combat rules'),
      toggleRow('Constant OB, DB and movement', 'When on, damage and exhaustion never adjust a unit’s OB, DB or movement (the original’s "/C" switch).',
        s.constantModifiers, (v) => { s.constantModifiers = v; touch(); }),
      toggleRow('Legacy armor indexing', 'Reproduces the original’s off-by-one armor lookup (armor type 1 read the AT2 column, and AT20 fell back to AT1) instead of the corrected 1:1 mapping.',
        s.legacyArmorIndexing, (v) => { s.legacyArmorIndexing = v; touch(); }),
      toggleRow('Fixed random seed', 'Reruns of the same units, attacks and settings produce the same result. Turn off for a fresh roll each time.',
        s.fixedSeed, (v) => { s.fixedSeed = v; touch(); render(); }),
      s.fixedSeed ? el('div', { class: 'field', style: 'max-width:200px;margin-top:6px' },
        el('label', { for: 'seedInput' }, 'Seed'),
        el('input', { id: 'seedInput', type: 'number', value: s.seed, onchange: (e) => { s.seed = parseIntSafe(e.target.value) || 444; touch(); } }),
      ) : null,
    ),
    el('section', { class: 'block' },
      el('h3', {}, 'Battle file'),
      el('div', { class: 'file-actions' },
        el('button', { class: 'btn', onclick: () => offerDownload(fileSafeName() + '.json', JSON.stringify({
          battleName: state.battleName, units: state.units, attacks: state.attacks, log: state.log,
          roundCounter: state.roundCounter, settings: state.settings,
        }, null, 2)) }, 'Save battle (.json)'),
        el('button', { class: 'btn', onclick: () => fileInputTrigger('.json,application/json', importJsonBattle) }, 'Load battle (.json)'),
        el('button', { class: 'btn btn-danger', onclick: () => confirmModal({
          title: 'Start a new battle?', body: 'The current roster, attack queue and battle log will be cleared.', danger: true, confirmLabel: 'Start new battle',
          onConfirm: () => { Object.assign(state, { battleName: '', units: [createUnit()], attacks: [], log: [], roundCounter: 0 }); state.ui.selectedUnit = 1; saveDraft(); render(); },
        }) }, 'New battle'),
      ),
    ),
    el('section', { class: 'block' },
      el('h3', {}, 'Legacy DOS files'),
      el('p', { class: 'hint', style: 'margin-bottom:10px' },
        'Original WARCOM .UNT and .BTL files are supported directly (50- or 200-record layouts, with or without the original’s extra trailing bytes). ' +
        'Because this browser sandbox can only offer a few common file types for saving, exported .UNT/.BTL files are delivered inside a .zip — unzip it to get the original file back.'),
      el('div', { class: 'file-actions' },
        el('button', { class: 'btn', onclick: () => fileInputTrigger('.unt,.zip', importLegacyUnits) }, 'Import units (.UNT)'),
        el('button', { class: 'btn', onclick: exportLegacyUnits }, 'Export units (.UNT, zipped)'),
        el('button', { class: 'btn', onclick: () => fileInputTrigger('.btl,.zip', importLegacyBattle) }, 'Import attacks (.BTL)'),
        el('button', { class: 'btn', onclick: exportLegacyBattle }, 'Export attacks (.BTL, zipped)'),
      ),
    ),
  );
}

function fileSafeName() {
  return (state.battleName.trim() || 'warcom-battle').replace(/[^a-z0-9 _-]+/gi, '').trim().replace(/\s+/g, '-').toLowerCase() || 'warcom-battle';
}

// ---- JSON import ----
function importJsonBattle(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result));
      if (!Array.isArray(data.units)) throw new Error('missing units');
      confirmModal({
        title: 'Load this battle?', body: 'This replaces the current roster, attack queue and battle log.', confirmLabel: 'Load battle',
        onConfirm: () => {
          state.battleName = data.battleName ?? '';
          state.units = data.units;
          state.attacks = data.attacks ?? [];
          state.log = data.log ?? [];
          state.roundCounter = data.roundCounter ?? 0;
          if (data.settings) Object.assign(state.settings, data.settings);
          state.ui.selectedUnit = state.units.length ? 1 : 0;
          saveDraft(); render();
          showStatus('Battle loaded.', 'ok');
        },
      });
    } catch {
      showStatus('That file is not a readable Warcom battle (.json).', 'error');
    }
  };
  reader.readAsText(file);
}

// ---- legacy import/export ----
async function extractLegacyBytes(file, expectExt) {
  if (file.name.toLowerCase().endsWith('.zip')) {
    requireJsZip();
    const zip = await JSZip.loadAsync(file);
    const entry = Object.values(zip.files).find((f) => !f.dir && f.name.toLowerCase().endsWith(expectExt));
    if (!entry) throw new Error(`The zip does not contain a ${expectExt} file.`);
    return new Uint8Array(await entry.async('arraybuffer'));
  }
  return new Uint8Array(await file.arrayBuffer());
}

async function importLegacyUnits(file) {
  try {
    const bytes = await extractLegacyBytes(file, '.unt');
    const result = parseUnitFile(bytes);
    if (!result.ok) { showStatus(result.error, 'error'); return; }
    confirmModal({
      title: 'Import units?', body: `${result.recordCount} unit records were found. This replaces the current roster and clears the attack queue and battle log, so unit references stay correct.`,
      confirmLabel: 'Import units', danger: true,
      onConfirm: () => {
        state.units = result.records;
        state.attacks = [];
        state.log = [];
        state.roundCounter = 0;
        state.ui.selectedUnit = state.units.findIndex((u) => !isUnitBlank(u)) + 1 || 1;
        saveDraft(); render();
        showStatus(`Imported ${result.recordCount} unit records${result.hadTrailingBytes ? ' (with the original trailing bytes)' : ''}.`, 'ok');
      },
    });
  } catch (e) {
    showStatus(e.message || 'Could not read that file.', 'error');
  }
}

async function importLegacyBattle(file) {
  try {
    const bytes = await extractLegacyBytes(file, '.btl');
    const result = parseBattleFile(bytes);
    if (!result.ok) { showStatus(result.error, 'error'); return; }
    confirmModal({
      title: 'Import attacks?', body: `${result.recordCount} attack records were found. This replaces the current attack queue and clears the battle log.`,
      confirmLabel: 'Import attacks', danger: true,
      onConfirm: () => {
        state.attacks = result.records;
        state.log = [];
        saveDraft(); render();
        showStatus(`Imported ${result.recordCount} attack records${result.hadTrailingBytes ? ' (with the original trailing bytes)' : ''}.`, 'ok');
      },
    });
  } catch (e) {
    showStatus(e.message || 'Could not read that file.', 'error');
  }
}

function tooLongModal(result) {
  const node = el('div', {},
    el('h3', {}, 'Some fields do not fit the legacy format'),
    el('p', {}, 'The original DOS format uses short, fixed-width text fields. These values are too long or contain characters it cannot store, so nothing was exported:'),
    el('ul', { class: 'err-list' }, result.tooLong.map((t) => el('li', {}, `Record ${t.record}, ${t.field}: "${t.value}" (limit ${t.limit} characters)`))),
    el('div', { class: 'actions-row' }, el('button', { class: 'btn btn-seal', onclick: closeModal }, 'Got it')),
  );
  showModal(node);
}

async function exportLegacyUnits() {
  const recordCount = state.units.length <= 50 ? 50 : 200;
  const result = writeUnitFile(state.units, recordCount);
  if (!result.ok) { tooLongModal(result); return; }
  try {
    const zipped = await zipOf('warcom-units.unt', result.bytes);
    await offerDownload(`${fileSafeName()}-units.zip`, zipped);
  } catch (e) { showStatus(e.message || 'Could not build the export.', 'error'); }
}
async function exportLegacyBattle() {
  const recordCount = state.attacks.length <= 50 ? 50 : 200;
  const result = writeBattleFile(state.attacks, recordCount);
  if (!result.ok) { tooLongModal(result); return; }
  try {
    const zipped = await zipOf('warcom-attacks.btl', result.bytes);
    await offerDownload(`${fileSafeName()}-attacks.zip`, zipped);
  } catch (e) { showStatus(e.message || 'Could not build the export.', 'error'); }
}

// ---------------------------------------------------------------------------
// Top-level render
// ---------------------------------------------------------------------------

function renderTabPanels() {
  const panels = $('tabPanels');
  panels.innerHTML = '';
  const panel = el('div', { class: 'panel' });
  panels.append(panel);
  if (!document.getElementById('weaponsList')) {
    const dl = el('datalist', { id: 'weaponsList' }, USABLE_WEAPON_NAMES.map((n) => el('option', { value: n })));
    const dl2 = el('datalist', { id: 'sizeTypesList' }, SIZE_TYPES.filter(Boolean).map((n) => el('option', { value: n })));
    document.body.append(dl, dl2);
  }
  switch (state.ui.activeTab) {
    case 'unit': renderUnitTab(panel); break;
    case 'attacks': renderAttacksTab(panel); break;
    case 'log': renderLogTab(panel); break;
    case 'weapons': renderWeaponsTab(panel); break;
    case 'settings': renderSettingsTab(panel); break;
  }
}

function render() {
  $('battleName').value = state.battleName;
  renderRoster();
  renderTabStrip();
  renderTabPanels();
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

$('battleName').addEventListener('input', (e) => { state.battleName = e.target.value; saveDraft(); });
$('rosterSearch').addEventListener('input', (e) => { state.ui.rosterFilter = e.target.value; renderRoster(); });
$('addUnitBtn').addEventListener('click', () => {
  if (!canAddUnit(state.units)) { showStatus(`The roster is at the ${MAX_UNITS}-unit limit.`, 'error'); return; }
  state.units.push(createUnit());
  state.ui.selectedUnit = state.units.length;
  state.ui.activeTab = 'unit';
  invalidateUndo(); saveDraft(); render();
});
$('tabStrip').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab-btn');
  if (!btn) return;
  state.ui.activeTab = btn.dataset.tab;
  renderTabStrip(); renderTabPanels();
});
$('resolveAllBtn').addEventListener('click', resolveAllAttacks);

render();
