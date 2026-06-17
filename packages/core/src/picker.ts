// =====================================================================
// Random picker — pure, environment-agnostic logic.
// =====================================================================
// This is the authoritative pick used by the run_picker Edge Function
// (server-side, so a tampering client can't re-roll). It is also mirrored
// for the Deno runtime at supabase/functions/_shared/picker.ts — the two
// files must stay byte-for-byte equivalent in behaviour; a drift guard in
// tests/picker.test.ts runs both through the same injected RNG.
//
// Randomness is injected as a `RandomUint32` so the logic is fully
// deterministic under test. Production passes `cryptoRandomUint32`, which
// uses the platform CSPRNG (Web Crypto — present in the Edge runtime,
// Node 18+, and browsers).
//
// We sample with REJECTION (not modulo) to avoid bias: a naive `rand() % n`
// over-represents the first `2^32 % n` indices. Over a picker that records
// to a trust-bearing history, "slightly biased" is not acceptable.
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
  // Largest multiple of n that fits in a uint32; reject anything above it
  // so every residue class is equally likely.
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
 * Fisher–Yates shuffle returning a NEW array (input untouched). Used by
 * the UI for the reveal animation order; the authoritative outcome is
 * always `pickOne` on the server.
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
