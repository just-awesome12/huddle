import { describe, expect, it } from 'vitest';
import { randomIndex, pickOne, shuffle } from '../src/picker';
// Drift guard: the Deno mirror the Edge Function imports must behave
// identically. We import it here and run both through the same RNG.
import * as mirror from '../../../supabase/functions/_shared/picker.ts';

/**
 * A deterministic RandomUint32 that yields the given values in order,
 * then throws if drained (so a test can't accidentally fall back to
 * real randomness).
 */
function seqRand(values: number[]): () => number {
  let i = 0;
  return () => {
    if (i >= values.length) throw new Error('seqRand drained');
    return values[i++]!;
  };
}

const TWO_POW_32 = 0x1_0000_0000;

describe('randomIndex', () => {
  it('returns 0 for n=1 without consuming the RNG', () => {
    const rand = seqRand([]); // would throw if called
    expect(randomIndex(1, rand)).toBe(0);
  });

  it('maps a uint32 to [0, n) by modulo when below the rejection limit', () => {
    expect(randomIndex(3, seqRand([0]))).toBe(0);
    expect(randomIndex(3, seqRand([1]))).toBe(1);
    expect(randomIndex(3, seqRand([5]))).toBe(2); // 5 % 3
  });

  it('rejects values at/above the bias limit and re-draws (unbiased)', () => {
    // For n=3, 2^32 % 3 === 1, so the limit is 2^32 - 1. A draw of
    // exactly the limit must be rejected, then the next draw used.
    const limit = TWO_POW_32 - (TWO_POW_32 % 3);
    expect(limit).toBe(TWO_POW_32 - 1);
    const idx = randomIndex(3, seqRand([limit, 5]));
    expect(idx).toBe(2); // limit rejected → 5 % 3
  });

  it('throws on non-positive or non-integer n', () => {
    expect(() => randomIndex(0, seqRand([]))).toThrow();
    expect(() => randomIndex(-2, seqRand([]))).toThrow();
    expect(() => randomIndex(2.5, seqRand([]))).toThrow();
  });
});

describe('pickOne', () => {
  it('selects the element at the drawn index', () => {
    const items = ['a', 'b', 'c'];
    expect(pickOne(items, seqRand([1]))).toBe('b');
    expect(pickOne(items, seqRand([5]))).toBe('c'); // 5 % 3
  });

  it('throws on an empty list', () => {
    expect(() => pickOne([], seqRand([]))).toThrow();
  });
});

describe('shuffle', () => {
  it('produces a permutation and leaves the input untouched', () => {
    const input = [1, 2, 3, 4, 5];
    const out = shuffle(input, seqRand([0, 0, 0, 0]));
    expect(out).toHaveLength(input.length);
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5]);
    expect(input).toEqual([1, 2, 3, 4, 5]); // not mutated
  });

  it('is deterministic under a fixed RNG', () => {
    // Fisher–Yates over 4 items draws randomIndex(4),(3),(2).
    const draws = [3, 2, 1];
    const a = shuffle(['w', 'x', 'y', 'z'], seqRand(draws));
    const b = shuffle(['w', 'x', 'y', 'z'], seqRand(draws));
    expect(a).toEqual(b);
  });
});

describe('Deno mirror drift guard', () => {
  it('randomIndex matches the mirror across many draws', () => {
    for (let n = 1; n <= 12; n++) {
      for (const v of [0, 1, 7, 100, 99999, TWO_POW_32 - 1]) {
        // Use enough repeats in the sequence to satisfy any re-draws.
        const draws = [v, 3, 5, 9];
        expect(randomIndex(n, seqRand(draws))).toBe(
          mirror.randomIndex(n, seqRand(draws)),
        );
      }
    }
  });

  it('pickOne and shuffle match the mirror', () => {
    const items = ['p', 'q', 'r', 's', 't'];
    expect(pickOne(items, seqRand([42]))).toBe(mirror.pickOne(items, seqRand([42])));
    const draws = [4, 3, 2, 1];
    expect(shuffle(items, seqRand(draws))).toEqual(
      mirror.shuffle(items, seqRand(draws)),
    );
  });
});
