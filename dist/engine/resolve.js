/**
 * Attack resolution - a faithful port of resolve() from RESOLVE.CPP.
 *
 * The structure and names follow the original so the two can be read side by
 * side. Where the C++ used `float`, values are rounded with Math.fround after
 * every operation so that results match the original bit for bit; the tests
 * verify this against the original source compiled with a C++ compiler.
 *
 * Deliberate departures from the DOS program (all documented in the README):
 *  - Armor type n selects table n (DOS used table n+1; see Settings.legacyArmorIndexing).
 *  - Degenerate divisions (starting men = 0, starting hits = 0) no longer
 *    produce undefined behaviour; they are treated as "no change".
 *  - Weapon tables flagged incomplete cannot be selected.
 */
import { MAX_UNITS } from './types.js';
import { CRIT_CASUALTY, CRIT_DAMAGE, HOLY_CRIT_CASUALTY, HOLY_CRIT_DAMAGE, MAGIC_CRIT_CASUALTY, MAGIC_CRIT_DAMAGE, SLAY_CRIT_CASUALTY, SLAY_CRIT_DAMAGE, } from './tables.js';
const f = Math.fround;
/** The original's "not a number" sentinel returned by num(). */
export const NAN_VALUE = -1000;
/** C atoi(): optional whitespace, optional sign, digits; anything else stops the parse. */
export function atoi(s) {
    const m = /^[ \t\n\r\v\f]*([+-]?\d+)/.exec(s);
    return m ? parseInt(m[1], 10) : 0;
}
/** num(): parse a field, returning NAN_VALUE when outside [min, max]. */
export function num(value, min, max) {
    const i = typeof value === 'number' ? (Number.isFinite(value) ? Math.trunc(value) : 0) : atoi(value);
    return i >= min && i <= max ? i : NAN_VALUE;
}
const upper = (s) => s.replace(/[a-z]/g, (c) => c.toUpperCase());
/** compare(): equal ignoring case and blanks. Two blank strings compare equal, as in the original. */
export function compare(a, b) {
    return upper(a.replace(/ /g, '')) === upper(b.replace(/ /g, ''));
}
/** Size class row used to index the critical tables. */
export function sizeClass(type) {
    if (compare(type, 'small'))
        return 0;
    if (compare(type, 'type i') || compare(type, 'i'))
        return 2;
    if (compare(type, 'type ii') || compare(type, 'ii'))
        return 3;
    if (compare(type, 'large'))
        return 4;
    if (compare(type, 'super-large') || compare(type, 'super large') || compare(type, 'super'))
        return 5;
    if (compare(type, 'no stun'))
        return 6;
    return 1;
}
/** Special critical index: 0 normal, 1 double, 2 kata, 3 magic, 4 holy, 5 slay. */
export function specialCritIndex(spcr) {
    switch ((spcr[0] ?? '').toLowerCase()) {
        case 'd':
            return 1;
        case 'k':
            return 2;
        case 'm':
            return 3;
        case 'h':
            return 4;
        case 's':
            return 5;
        default:
            return 0;
    }
}
/** Concussion damage multiplier from the Dmx field. */
export function concussionMultiplier(dmx) {
    const n = num(dmx, -9999, 9999);
    if (n >= 1 && n <= 9)
        return n;
    if (compare(dmx, '0') || compare(dmx, 'o') || compare(dmx, 'O'))
        return 0;
    return 1;
}
/** Table index (0-19) for a unit's armor type. */
export function armorIndex(armor, legacy) {
    if (legacy) {
        const at = armor;
        return at < 0 || at > 19 ? 0 : at;
    }
    return armor >= 1 && armor <= 20 ? armor - 1 : 0;
}
function readStats(u) {
    const g = (v) => num(v, -9999, 9999);
    return {
        at: g(u.armor),
        dis: g(u.discipline),
        mrS: g(u.morale.start),
        mrN: g(u.morale.now),
        mrM: g(u.morale.mod),
        obS: g(u.ob.start),
        obN: g(u.ob.now),
        obM: g(u.ob.mod),
        dbS: g(u.db.start),
        dbN: g(u.db.now),
        dbM: g(u.db.mod),
        exS: g(u.exhaustion.start),
        exN: g(u.exhaustion.now),
        exM: g(u.exhaustion.mod),
        mvS: g(u.movement.start),
        mvN: g(u.movement.now),
        mvM: g(u.movement.mod),
        nmS: g(u.number.start),
        nmN: g(u.number.now),
        htS: g(u.hits.start),
        htN: g(u.hits.now),
    };
}
/**
 * getWeap(): the attack's own weapon overrides the unit's; a weapon that
 * cannot be found (or whose table is incomplete) is an error.
 */
export function findWeapon(attack, units, weapons) {
    const a = num(attack.attacker, 1, MAX_UNITS);
    if (a === NAN_VALUE)
        return { ok: false, reason: 'no-attacker', message: 'No attacker is set.' };
    const attacker = units[a - 1];
    if (!attacker)
        return { ok: false, reason: 'no-attacker', message: `Unit ${a} does not exist.` };
    for (let i = 0; i < weapons.length; i++) {
        if (weapons[i].complete && compare(weapons[i].name, attack.weapon))
            return { ok: true, index: i };
    }
    for (let i = 0; i < weapons.length; i++) {
        if (weapons[i].complete && compare(weapons[i].name, attacker.weapon))
            return { ok: true, index: i };
    }
    const shown = attack.weapon.trim() || attacker.weapon.trim() || '(none)';
    return { ok: false, reason: 'bad-weapon', message: `Bad weapon for unit ${a}: ${shown}.` };
}
function snapshot(u) {
    return {
        men: u.number.now,
        hits: u.hits.now,
        morale: u.morale.now,
        lastMorale: u.lastMorale,
        ob: u.ob.now,
        db: u.db.now,
        exhaustion: u.exhaustion.now,
        movement: u.movement.now,
    };
}
/**
 * defineRandomGuyHits(): the hit points of a randomly-chosen surviving target,
 * used to decide whether a modest hit finishes off a previously wounded man.
 */
function defineRandomGuyHits(origN, currentN, aggHits, maxHits, rng) {
    const spread = 2.0;
    if (currentN <= 0)
        return maxHits;
    if (origN === 1)
        return aggHits;
    if (currentN === 1)
        return aggHits > maxHits ? maxHits : aggHits;
    const avgHits = f(aggHits / currentN);
    if (maxHits <= avgHits || aggHits <= 0)
        return maxHits;
    const stdev = f(f(maxHits - avgHits) / spread);
    if (stdev < 0.5)
        return maxHits;
    const gaussfloat = rng.gasdevZpos();
    let gaussHits = f(avgHits + f(gaussfloat * stdev));
    if (gaussfloat >= spread)
        gaussHits = maxHits;
    return gaussHits;
}
/**
 * Resolve one attack. Returns null when the attack cannot happen (no
 * attacker/defender, attacker wiped out, nobody to attack); the defender is
 * unchanged in that case.
 */
export function resolveAttack(input) {
    const { attack, units, weapons, rng, settings } = input;
    let a = num(attack.attacker, 1, MAX_UNITS);
    if (a === NAN_VALUE)
        return null;
    a--;
    let d = num(attack.defender, 1, MAX_UNITS);
    if (d === NAN_VALUE)
        return null;
    d--;
    const attackerUnit = units[a];
    const defenderUnit = units[d];
    if (!attackerUnit || !defenderUnit)
        return null;
    const weaponLookup = findWeapon(attack, units, weapons);
    if (!weaponLookup.ok)
        return null;
    const weapon = weapons[weaponLookup.index];
    const att = readStats(input.attackerStats);
    const def = readStats(defenderUnit);
    const before = snapshot(defenderUnit);
    // ---- number of attackers --------------------------------------------------
    let numAtt;
    {
        const j = num(attack.attackerSize, 0, 9999);
        if (j === 0)
            numAtt = att.nmN;
        else if (j < 0)
            return null;
        else if (attack.attackerSize.includes('%')) {
            numAtt = Math.trunc((att.nmN * j) / 100);
            if (att.nmN > 0 && numAtt === 0)
                numAtt = 1;
        }
        else
            numAtt = j;
    }
    if (!att.nmN)
        return null;
    // ---- number of defenders ----------------------------------------------------
    let numDef;
    {
        const j = num(attack.defenderSize, 0, 9999);
        if (j === 0)
            numDef = def.nmN;
        else if (j < 0)
            return null;
        else if (attack.defenderSize.includes('%'))
            numDef = Math.trunc((def.nmN * j) / 100);
        else
            numDef = j;
    }
    if (numDef > def.nmN)
        numDef = def.nmN;
    if (numDef > numAtt)
        numDef = numAtt;
    if (!numDef)
        return null;
    const numDefSave = numDef;
    const sizeMod = sizeClass(defenderUnit.type);
    const concDamX = concussionMultiplier(attack.dmx);
    const spCritIdx = specialCritIndex(attack.spcr);
    const attMod = num(attack.modifier, -9999, 9999);
    // ---- aggregate hits of the targeted men ----------------------------------------
    let hits = f(def.htN * numDef);
    const hitSave = Math.trunc(hits);
    // Die-roll modifier: attacker OB (+mod) minus defender DB (+mod) plus the attack modifier.
    const mod = att.obN + att.obM - def.dbN - def.dbM + attMod;
    const at = armorIndex(def.at, settings.legacyArmorIndexing);
    const row = weapon.rows[at];
    // Slope of hits against roll: d(damage) / d(roll).
    const slope = f(f(row.max - row.min) / f(150 - row.start));
    const critDamSpread = 1.5;
    // ---- iterate through every attack -----------------------------------------------
    for (let i = 0; i < numAtt; i++) {
        let critCasualty = 0;
        let maxHitsCasualty = 0;
        let highHitsCasualty = 0;
        let roll = rng.dieRollOE() + mod;
        if (roll < row.start)
            continue;
        if (roll > 150)
            roll = 150;
        let thisAttackDamage = f(f(f(slope * (roll - 150)) + row.max) * concDamX);
        // criticals: find the highest severity the roll reaches, starting at E.
        for (let j = 0; j < 5; j++) {
            const threshold = row.crit[j];
            if (roll > threshold && threshold) {
                // Added (non-casualty) hit damage for the critical, randomised.
                const critDamage = (table) => f(f(table[sizeMod][j] * critDamSpread) * rng.ran1());
                switch (spCritIdx) {
                    case 1: {
                        // extra critical, rolled independently
                        const r1 = rng.ran1();
                        const r2 = rng.ran1();
                        thisAttackDamage = f(thisAttackDamage + f(f(CRIT_DAMAGE[sizeMod][j] * critDamSpread) * f(r1 + r2)));
                        break;
                    }
                    case 2:
                        // kata: extra critical, same roll, one degree less
                        if (j >= 4)
                            thisAttackDamage = f(thisAttackDamage + critDamage(CRIT_DAMAGE));
                        else {
                            thisAttackDamage = f(thisAttackDamage +
                                f(f((CRIT_DAMAGE[sizeMod][j] + CRIT_DAMAGE[sizeMod][j + 1]) * critDamSpread) * rng.ran1()));
                        }
                        break;
                    case 3:
                        thisAttackDamage = f(thisAttackDamage + critDamage(MAGIC_CRIT_DAMAGE));
                        break;
                    case 4:
                        thisAttackDamage = f(thisAttackDamage + critDamage(HOLY_CRIT_DAMAGE));
                        break;
                    case 5:
                        if (sizeMod === 4 || sizeMod === 5)
                            thisAttackDamage = f(thisAttackDamage + critDamage(SLAY_CRIT_DAMAGE));
                        else {
                            const slayPart = critDamage(SLAY_CRIT_DAMAGE);
                            const normalPart = critDamage(CRIT_DAMAGE);
                            thisAttackDamage = f(thisAttackDamage + f(slayPart + normalPart));
                        }
                        break;
                    default:
                        thisAttackDamage = f(thisAttackDamage + critDamage(CRIT_DAMAGE));
                        break;
                }
                // Does the critical make the target a casualty?
                let p;
                switch (spCritIdx) {
                    case 1:
                        p = f(CRIT_CASUALTY[sizeMod][j] / 100.0);
                        p = f(f(2 * p) - f(p * p));
                        break;
                    case 3:
                        p = f(MAGIC_CRIT_CASUALTY[sizeMod][j] / 100.0);
                        break;
                    case 4:
                        p = f(HOLY_CRIT_CASUALTY[sizeMod][j] / 100.0);
                        break;
                    case 5:
                        if (sizeMod === 4 || sizeMod === 5)
                            p = f(SLAY_CRIT_CASUALTY[sizeMod][j] / 100.0);
                        else {
                            const s = SLAY_CRIT_CASUALTY[sizeMod][j] / 100.0;
                            const c = CRIT_CASUALTY[sizeMod][j] / 100.0;
                            p = f(s + c - s * c);
                        }
                        break;
                    default:
                        p = f(CRIT_CASUALTY[sizeMod][j] / 100.0);
                        break;
                }
                // Round the percentage up, with a small nudge down to permit zero.
                const percent = Math.ceil((p - 0.0005) * 100.0);
                if (rng.dieRollFlat() <= percent)
                    critCasualty = 1;
                break;
            }
        }
        // A single attack exceeding the *starting* hits per man is a guaranteed casualty.
        const htSf = f(def.htS);
        if (thisAttackDamage >= htSf) {
            maxHitsCasualty = 1;
            thisAttackDamage = htSf;
        }
        // Otherwise a lesser hit may finish a previously wounded man.
        let statisticalRandomTargHits = 0;
        if (critCasualty + maxHitsCasualty === 0 && thisAttackDamage >= f(def.htN)) {
            statisticalRandomTargHits = defineRandomGuyHits(numDefSave, numDef > 0 ? numDef : 0, hits, htSf, rng);
            if (thisAttackDamage >= statisticalRandomTargHits)
                highHitsCasualty = 1;
        }
        // Fold the single attack into the aggregate.
        if (critCasualty + maxHitsCasualty + highHitsCasualty === 0) {
            hits = f(hits - thisAttackDamage);
        }
        else {
            if (maxHitsCasualty)
                hits = f(hits - thisAttackDamage);
            else if (critCasualty) {
                const guysStanding = numDef > 0 ? numDef : 0;
                const avgHitsGuysStanding = guysStanding === 0 ? 0 : f(hits / guysStanding);
                hits = f(hits - avgHitsGuysStanding);
            }
            else
                hits = f(hits - statisticalRandomTargHits);
            numDef--;
        }
    }
    // ---- gather the outcome -----------------------------------------------------------
    if (hits < 0 || numDef <= 0) {
        hits = 0;
        numDef = 0;
    }
    // Survivors rejoin the men who were not attacked.
    numDef += def.nmN - numDefSave;
    const casualties = def.nmN - numDef;
    const damage = hitSave - Math.trunc(hits);
    if (numDef) {
        hits = f(f(f(def.htN * def.nmN - hitSave) + hits) / numDef);
        let hitsWhole = Math.trunc(hits);
        const hitsFrac = Math.trunc(f(hits - hitsWhole) * 100.0);
        // Version 2.3: round the average up or down probabilistically so results are unbiased.
        if (rng.dieRollFlat() <= hitsFrac)
            hitsWhole++;
        hits = f(hitsWhole + 0.005);
    }
    else
        hits = 0;
    if (hits > f(def.htS))
        hits = f(def.htS);
    defenderUnit.hits.now = Math.trunc(hits);
    defenderUnit.number.now = numDef;
    // ---- exhaustion ---------------------------------------------------------------------
    let ex = 0;
    if (def.nmN) {
        ex = def.exN - Math.trunc((10 * numDefSave) / def.nmN);
        if (ex < 0)
            ex = 0;
        defenderUnit.exhaustion.now = ex;
    }
    else
        defenderUnit.exhaustion.now = 0;
    // ---- strength and hits fractions ------------------------------------------------------
    const numPer = def.nmS > 0 ? f(f(numDef) / f(def.nmS)) : numDef > 0 ? 1 : 0;
    let hitPer;
    if (def.htN)
        hitPer = def.htS > 0 ? f(f(hits) / f(def.htS)) : 1;
    else
        hitPer = 0;
    // ---- morale ---------------------------------------------------------------------------
    let mr = Math.trunc(f(def.mrS) + (1 - numPer) * f(def.dis) * 4.0);
    defenderUnit.morale.now = mr;
    mr += def.mrM;
    const moraleRoll = rng.dieRollOEH() + mr;
    let moraleFailure;
    if (moraleRoll < 50)
        moraleFailure = 'E';
    else if (moraleRoll < 65)
        moraleFailure = 'D';
    else if (moraleRoll < 80)
        moraleFailure = 'C';
    else if (moraleRoll < 90)
        moraleFailure = 'B';
    else if (moraleRoll < 100)
        moraleFailure = 'A';
    else
        moraleFailure = '';
    defenderUnit.lastMorale = moraleFailure;
    // A wiped-out unit has no morale left to fail.
    if (numDef === 0) {
        moraleFailure = '';
        defenderUnit.lastMorale = '';
        defenderUnit.morale.now = 0;
        defenderUnit.exhaustion.now = 0;
        defenderUnit.movement.now = 0;
    }
    // ---- OB, DB and movement (skipped with the DOS "/C" switch) -----------------------------
    if (!settings.constantModifiers) {
        let i = Math.trunc((1 - hitPer) * 40 + (1 - f(ex) / 100) * 40);
        defenderUnit.ob.now = def.obS - i;
        i = def.dbS - i;
        if (i < 0)
            i = 0;
        defenderUnit.db.now = i;
        if (def.mvN)
            i = Math.trunc(((def.mvS + def.mvM) * ex) / 100);
        else
            i = 0;
        if (i < 0)
            i = 0;
        defenderUnit.movement.now = i;
    }
    return {
        attackIndex: input.attackIndex,
        attacker: a + 1,
        defender: d + 1,
        attackerName: attackerUnit.name,
        defenderName: defenderUnit.name,
        weapon: weapon.name,
        attacks: numAtt,
        targets: numDefSave,
        casualties,
        damage,
        eliminated: numDef === 0,
        moraleFailure,
        before,
        after: snapshot(defenderUnit),
    };
}
/**
 * Resolve every attack "simultaneously" (F10 in DOS): all weapons are checked
 * first, attackers use their statistics from the start of the round, and the
 * defenders accumulate damage in queue order.
 */
export function resolveRound(attacks, units, weapons, rng, settings) {
    for (let i = 0; i < attacks.length; i++) {
        const w = findWeapon(attacks[i], units, weapons);
        if (!w.ok && w.reason === 'bad-weapon')
            return { results: [], aborted: { attackIndex: i, message: w.message } };
    }
    const startOfRound = structuredClone(units);
    const results = [];
    for (let i = 0; i < attacks.length; i++) {
        const attack = attacks[i];
        const a = num(attack.attacker, 1, MAX_UNITS);
        if (a === NAN_VALUE || !startOfRound[a - 1])
            continue;
        const r = resolveAttack({
            attack,
            attackIndex: i,
            units,
            weapons,
            rng,
            settings,
            attackerStats: startOfRound[a - 1],
        });
        if (r)
            results.push(r);
    }
    return { results };
}
/** Resolve a single attack using the attacker's current statistics (F9 in DOS). */
export function resolveSingle(attack, attackIndex, units, weapons, rng, settings) {
    const w = findWeapon(attack, units, weapons);
    if (!w.ok)
        return { result: null, error: w.message };
    const a = num(attack.attacker, 1, MAX_UNITS);
    const attackerStats = structuredClone(units[a - 1]);
    return { result: resolveAttack({ attack, attackIndex, units, weapons, rng, settings, attackerStats }) };
}
export function previewAttack(attack, units, weapons) {
    const a = num(attack.attacker, 1, MAX_UNITS);
    const d = num(attack.defender, 1, MAX_UNITS);
    if (a === NAN_VALUE && d === NAN_VALUE && !attack.attackerSize && !attack.defenderSize)
        return { ok: false };
    if (a === NAN_VALUE)
        return { ok: false, problem: 'Choose an attacker.' };
    if (d === NAN_VALUE)
        return { ok: false, problem: 'Choose a defender.' };
    const au = units[a - 1];
    const du = units[d - 1];
    if (!au)
        return { ok: false, problem: `Unit ${a} does not exist.` };
    if (!du)
        return { ok: false, problem: `Unit ${d} does not exist.` };
    const w = findWeapon(attack, units, weapons);
    if (!w.ok)
        return { ok: false, problem: w.message };
    const att = readStats(au);
    const def = readStats(du);
    let numAtt;
    const ja = num(attack.attackerSize, 0, 9999);
    if (ja === 0)
        numAtt = att.nmN;
    else if (ja < 0)
        return { ok: false, problem: 'Attacker size must be a positive number or percentage.' };
    else if (attack.attackerSize.includes('%')) {
        numAtt = Math.trunc((att.nmN * ja) / 100);
        if (att.nmN > 0 && numAtt === 0)
            numAtt = 1;
    }
    else
        numAtt = ja;
    if (!att.nmN)
        return { ok: false, problem: 'The attacking unit has no one left.' };
    let numDef;
    const jd = num(attack.defenderSize, 0, 9999);
    if (jd === 0)
        numDef = def.nmN;
    else if (jd < 0)
        return { ok: false, problem: 'Defender size must be a positive number or percentage.' };
    else if (attack.defenderSize.includes('%'))
        numDef = Math.trunc((def.nmN * jd) / 100);
    else
        numDef = jd;
    if (numDef > def.nmN)
        numDef = def.nmN;
    if (numDef > numAtt)
        numDef = numAtt;
    if (!numDef)
        return { ok: false, problem: 'No one to attack: the defender has no one left, or the size rounds to zero.' };
    return { ok: true, attacks: numAtt, targets: numDef };
}
