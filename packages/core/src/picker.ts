// =====================================================================
// Random picker — the pure core of Phase 7.
// =====================================================================
// Environment-agnostic pick logic: no Supabase, no React, no platform
// globals beyond Web Crypto. This is what makes the picker trustworthy
// AND testable — the shuffle/selection can be exercised exhaustively in
// Vitest, and the run_picker Edge Function imports `pickOne` so the
// server (not a tampering client) is the authority on the outcome.
//
// Randomness is injected as a `RandomInt` so tests can be deterministic.
// The production default, `cryptoRandomInt`, draws from the CSPRNG and
// rejection-samples to stay unbiased.
// =====================================================================

/**
 * Returns a uniformly distributed integer in the half-open range
 * [0, maxExclusive). Injected so callers (and tests) control the source
 * of randomness.
 */
export type RandomInt = (maxExclusive: number) => number;

// Web Crypto (`crypto.getRandomValues`) is provided by every runtime we
// target — Deno Edge Functions, Node ≥ 19, browsers — but it is not part
// of the ES2022 type lib, and we deliberately keep DOM types out of this
// environment-agnostic package. Reach it through globalThis with a
// minimal local type rather than widening `lib`.
interface RandomValuesSource {
  getRandomValues<T extends Uint32Array>(array: T): T;
}
const webCrypto = (): RandomValuesSource =>
  (globalThis as unknown as { crypto: RandomValuesSource }).crypto;

/**
 * Crypto-backed uniform integer source.
 *
 * Uses the Web Crypto API (`crypto.getRandomValues`), available in Deno
 * Edge Functions, Node ≥ 19, and modern browsers. Rejection-samples the
 * raw 32-bit draws so the result is free of modulo bias: we discard any
 * draw at or above the largest multiple of `maxExclusive` that fits in
 * 2^32, then take the remainder.
 */
export const cryptoRandomInt: RandomInt = (maxExclusive) => {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
    throw new RangeError(
      `cryptoRandomInt: maxExclusive must be a positive integer, got ${maxExclusive}`,
    );
  }
  if (maxExclusive === 1) return 0;

  // Largest multiple of maxExclusive that fits in the 32-bit space.
  // Draws at or above this would skew the modulo, so we reject them.
  const ceiling = 0x1_0000_0000; // 2^32
  const limit = Math.floor(ceiling / maxExclusive) * maxExclusive;

  const buf = new Uint32Array(1);
  let draw: number;
  do {
    webCrypto().getRandomValues(buf);
    draw = buf[0]!;
  } while (draw >= limit);

  return draw % maxExclusive;
};

/**
 * Pick a uniformly random index into a list of `count` items.
 * Throws if `count` is not a positive integer.
 */
export function pickIndex(count: number, randomInt: RandomInt = cryptoRandomInt): number {
  if (!Number.isInteger(count) || count <= 0) {
    throw new RangeError(`pickIndex: count must be a positive integer, got ${count}`);
  }
  return randomInt(count);
}

/**
 * Pick one element uniformly at random from `candidates`.
 *
 * The selection is by index, so duplicate values are handled correctly
 * (each position is equally likely regardless of value). Throws if the
 * candidate list is empty — callers should surface that as the
 * "no ideas to pick from" empty state rather than running the picker.
 */
export function pickOne<T>(
  candidates: readonly T[],
  randomInt: RandomInt = cryptoRandomInt,
): T {
  if (candidates.length === 0) {
    throw new RangeError('pickOne: candidates must not be empty');
  }
  const index = pickIndex(candidates.length, randomInt);
  const chosen = candidates[index];
  if (chosen === undefined && !(index in candidates)) {
    // randomInt returned an out-of-range index — a broken RandomInt.
    throw new RangeError(`pickOne: random index ${index} is out of range`);
  }
  return chosen as T;
}
