// =====================================================================
// VENDORED COPY of packages/core/src/picker.ts (Phase 7, D61).
// =====================================================================
// `packages/core/src/picker.ts` is the unit-tested source of truth for
// this logic. It is copied here verbatim (minus the unused `pickIndex`
// export) because the Supabase Edge runtime cannot reliably import files
// from outside `supabase/` on every CLI version (the long-standing
// monorepo-import limitation, cli#1303). Keeping a frozen ~30-line copy
// beside the function guarantees it bundles everywhere.
//
// If you change the pick algorithm, change packages/core/src/picker.ts
// FIRST (it has the tests) and mirror it here.
// =====================================================================

export type RandomInt = (maxExclusive: number) => number;

interface RandomValuesSource {
  getRandomValues<T extends Uint32Array>(array: T): T;
}
const webCrypto = (): RandomValuesSource =>
  (globalThis as unknown as { crypto: RandomValuesSource }).crypto;

/**
 * Crypto-backed uniform integer in [0, maxExclusive), rejection-sampled
 * to avoid modulo bias.
 */
export const cryptoRandomInt: RandomInt = (maxExclusive) => {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
    throw new RangeError(
      `cryptoRandomInt: maxExclusive must be a positive integer, got ${maxExclusive}`,
    );
  }
  if (maxExclusive === 1) return 0;

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

/** Pick one element uniformly at random. Throws if `candidates` is empty. */
export function pickOne<T>(
  candidates: readonly T[],
  randomInt: RandomInt = cryptoRandomInt,
): T {
  if (candidates.length === 0) {
    throw new RangeError('pickOne: candidates must not be empty');
  }
  const index = randomInt(candidates.length);
  const chosen = candidates[index];
  if (chosen === undefined && !(index in candidates)) {
    throw new RangeError(`pickOne: random index ${index} is out of range`);
  }
  return chosen as T;
}
