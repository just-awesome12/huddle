import { describe, expect, it, vi } from 'vitest';
import { cryptoRandomInt, pickIndex, pickOne, type RandomInt } from '../src/picker';

// A deterministic RandomInt that walks through a fixed sequence of
// indices, asserting each requested maxExclusive matches expectation.
function sequence(indices: number[]): RandomInt {
  let i = 0;
  return () => {
    const value = indices[i % indices.length]!;
    i += 1;
    return value;
  };
}

describe('pickOne', () => {
  it('throws on an empty candidate list', () => {
    expect(() => pickOne([])).toThrow(/must not be empty/);
  });

  it('returns the sole candidate when there is exactly one', () => {
    // Even a broken random source cannot change a single-element pick.
    expect(pickOne(['only'], () => 0)).toBe('only');
    expect(pickOne([42], cryptoRandomInt)).toBe(42);
  });

  it('selects by the injected index', () => {
    const candidates = ['a', 'b', 'c', 'd'];
    expect(pickOne(candidates, () => 0)).toBe('a');
    expect(pickOne(candidates, () => 3)).toBe('d');
    expect(pickOne(candidates, sequence([2]))).toBe('c');
  });

  it('handles duplicate values by position, not identity', () => {
    const candidates = ['x', 'x', 'y'];
    // Index 1 is a duplicate 'x'; index 2 is 'y'. Both reachable.
    expect(pickOne(candidates, () => 1)).toBe('x');
    expect(pickOne(candidates, () => 2)).toBe('y');
  });

  it('passes the candidate count to the random source', () => {
    const randomInt = vi.fn<RandomInt>(() => 0);
    pickOne(['a', 'b', 'c'], randomInt);
    expect(randomInt).toHaveBeenCalledWith(3);
  });

  it('throws if the random source returns an out-of-range index', () => {
    expect(() => pickOne(['a', 'b'], () => 5)).toThrow(/out of range/);
  });

  it('defaults to the crypto source and yields a real candidate', () => {
    const candidates = ['food', 'activity', 'place'];
    for (let i = 0; i < 50; i += 1) {
      expect(candidates).toContain(pickOne(candidates));
    }
  });
});

describe('pickIndex', () => {
  it('rejects non-positive or non-integer counts', () => {
    expect(() => pickIndex(0)).toThrow(/positive integer/);
    expect(() => pickIndex(-1)).toThrow(/positive integer/);
    expect(() => pickIndex(2.5)).toThrow(/positive integer/);
  });

  it('delegates to the injected random source', () => {
    const randomInt = vi.fn<RandomInt>(() => 1);
    expect(pickIndex(4, randomInt)).toBe(1);
    expect(randomInt).toHaveBeenCalledWith(4);
  });
});

describe('cryptoRandomInt', () => {
  it('rejects non-positive or non-integer bounds', () => {
    expect(() => cryptoRandomInt(0)).toThrow(RangeError);
    expect(() => cryptoRandomInt(-3)).toThrow(RangeError);
    expect(() => cryptoRandomInt(1.5)).toThrow(RangeError);
  });

  it('returns 0 for a bound of 1', () => {
    expect(cryptoRandomInt(1)).toBe(0);
  });

  it('always returns a value within [0, maxExclusive)', () => {
    for (let i = 0; i < 2000; i += 1) {
      const v = cryptoRandomInt(7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('is approximately uniform over large N', () => {
    const buckets = 6;
    const runs = 60_000;
    const counts = new Array<number>(buckets).fill(0);
    for (let i = 0; i < runs; i += 1) {
      counts[cryptoRandomInt(buckets)]! += 1;
    }
    const expected = runs / buckets; // 10_000
    // Every bucket should land within ±10% of the expected count. The
    // true distribution is uniform, so this tolerance is comfortably
    // wide enough to avoid flakiness while still catching gross bias.
    for (const count of counts) {
      expect(count).toBeGreaterThan(expected * 0.9);
      expect(count).toBeLessThan(expected * 1.1);
    }
  });
});
