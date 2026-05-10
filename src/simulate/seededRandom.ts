/**
 * A deterministic pseudo-random number generator (Mulberry32).
 * Essential for deterministic simulation.
 */
export class SeededRandom {
    private state: number;

    constructor(seed: number = Date.now()) {
        this.state = seed;
    }

    /**
     * Generates a random number between 0 and 1.
     */
    next(): number {
        this.state |= 0;
        this.state = (this.state + 0x6d2b79f5) | 0;
        let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    /**
     * Generates a random integer between min and max (inclusive).
     */
    nextInt(min: number, max: number): number {
        return Math.floor(this.next() * (max - min + 1)) + min;
    }

    /**
     * Generates a random float between min and max.
     */
    nextFloat(min: number, max: number): number {
        return this.next() * (max - min) + min;
    }

    /**
     * Returns true with a given probability (0 to 1).
     */
    chance(p: number): boolean {
        return this.next() < p;
    }

    /**
     * Pick a random item from an array.
     */
    pick<T>(array: T[]): T {
        return array[this.nextInt(0, array.length - 1)];
    }
}

// Global instance helper if needed, but usually we want to pass it in context
export const createRNG = (seed: number) => new SeededRandom(seed);
