/**
 * Random number generation, ported from RESOLVE.CPP.
 *
 * WARCOM used two independent sources of randomness:
 *  - the C library rand() for percentile dice, and
 *  - Numerical Recipes' ran1() (Park-Miller with Bays-Durham shuffle) for
 *    uniform floats and, via Box-Muller, positive Gaussians.
 *
 * rand() is replaced by the Borland C linear congruential generator the DOS
 * build used, so a given seed is portable and reproducible everywhere.
 */
const f = Math.fround;
const IA = 16807;
const IM = 2147483647;
const AM = 1.0 / IM;
const IQ = 127773;
const IR = 2836;
const NTAB = 32;
const NDIV = 1 + Math.trunc((IM - 1) / NTAB);
const EPS = 1.2e-7;
const RNMX = 1.0 - EPS;
export class Rng {
    lcg;
    idum;
    iy = 0;
    iv = new Array(NTAB).fill(0);
    iset = 0;
    gset = 0;
    constructor(seeds) {
        this.lcg = seeds.dice >>> 0;
        this.idum = seeds.ran1 | 0;
    }
    /** Derive both generator seeds from a single 32-bit seed. */
    static fromSeed(seed) {
        const s = seed >>> 0;
        const mixed = Math.imul(s ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
        return new Rng({ dice: s, ran1: -((mixed % 65535) + 1) });
    }
    /** Borland C rand(): 15-bit result. */
    rand() {
        this.lcg = (Math.imul(this.lcg, 0x015a4e35) + 1) >>> 0;
        return (this.lcg >>> 16) & 0x7fff;
    }
    roll100() {
        return (this.rand() % 100) + 1;
    }
    /** Open-ended on both ends (dieRoll_OE). */
    dieRollOE() {
        let r1 = this.roll100();
        let r2 = r1;
        if (r1 < 6) {
            do {
                r1 = this.roll100();
                r2 -= r1;
            } while (r1 > 95);
        }
        else if (r1 > 95) {
            do {
                r1 = this.roll100();
                r2 += r1;
            } while (r1 > 95);
        }
        return r2;
    }
    /** Open-ended high only (dieRoll_OEH), used for morale. */
    dieRollOEH() {
        let r1 = this.roll100();
        let r2 = r1;
        if (r1 > 95) {
            do {
                r1 = this.roll100();
                r2 += r1;
            } while (r1 > 95);
        }
        return r2;
    }
    /** Flat 1-100 (dieRoll_flat). */
    dieRollFlat() {
        return this.roll100();
    }
    /** ran1(): uniform deviate in (0,1), single precision. */
    ran1() {
        let k;
        let j;
        if (this.idum <= 0 || !this.iy) {
            if (-this.idum < 1)
                this.idum = 1;
            else
                this.idum = -this.idum;
            for (j = NTAB + 7; j >= 0; j--) {
                k = Math.trunc(this.idum / IQ);
                this.idum = IA * (this.idum - k * IQ) - IR * k;
                if (this.idum < 0)
                    this.idum += IM;
                if (j < NTAB)
                    this.iv[j] = this.idum;
            }
            this.iy = this.iv[0];
        }
        k = Math.trunc(this.idum / IQ);
        this.idum = IA * (this.idum - k * IQ) - IR * k;
        if (this.idum < 0)
            this.idum += IM;
        j = Math.trunc(this.iy / NDIV);
        this.iy = this.iv[j];
        this.iv[j] = this.idum;
        const temp = f(AM * this.iy);
        return temp > RNMX ? f(RNMX) : temp;
    }
    /** gasdev_zpos(): Box-Muller deviate restricted to z >= 0, single precision. */
    gasdevZpos() {
        if (this.idum < 0)
            this.iset = 0;
        if (this.iset === 0) {
            let v1;
            let v2;
            let rsq;
            do {
                v1 = this.ran1();
                v2 = this.ran1();
                rsq = f(f(v1 * v1) + f(v2 * v2));
            } while (rsq >= 1.0 || rsq === 0.0);
            const fac = f(Math.sqrt((-2.0 * Math.log(rsq)) / rsq));
            this.gset = f(v1 * fac);
            this.iset = 1;
            return f(v2 * fac);
        }
        this.iset = 0;
        return this.gset;
    }
}
