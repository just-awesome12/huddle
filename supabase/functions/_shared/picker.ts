// =====================================================================
// Random picker — Deno mirror of packages/core/src/picker.ts
// =====================================================================
// Edge Functions run on Deno and cannot import the pnpm workspace
// package, so this is a deliberate copy. It MUST stay behaviourally
// identical to @huddle/core's picker; packages/core/tests/picker.test.ts
// imports both modules and runs them through the same injected RNG to
// catch drift. Edit both files together.
// =====================================================================

/** A source of uniformly distributed unsigned 32-bit integers. */
export type RandomUint32 = () => number;

const TWO_POW_32 = 0x1_0000_0000; // 2^32

/** CSPRNG-backed RandomUint32 using Web Crypto's getRandomValues. */
export function cryptoRandomUint32(): number {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return arr[0]!;
}

/**
 * A uniformly distributed integer in [0, n) drawn from a uint32 source
 * via rejection sampling (no modulo bias). Throws if n is not a positive
 * integer.
 */
export function randomIndex(n: number, rand: RandomUint32 = cryptoRandomUint32): number {
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`randomIndex: n must be a positive integer, got ${n}`);
  }
  if (n === 1) return 0;
  const limit = TWO_POW_32 - (TWO_POW_32 % n);
  let x = rand();
  while (x >= limit) x = rand();
  return x % n;
}

/** Pick one item uniformly at random. Throws on an empty list. */
export function pickOne<T>(items: readonly T[], rand: RandomUint32 = cryptoRandomUint32): T {
  if (items.length === 0) {
    throw new Error('pickOne: cannot pick from an empty list');
  }
  return items[randomIndex(items.length, rand)]!;
}

/**
 * Fisher–Yates shuffle returning a NEW array (input untouched).
 */
export function shuffle<T>(items: readonly T[], rand: RandomUint32 = cryptoRandomUint32): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1, rand);
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}
