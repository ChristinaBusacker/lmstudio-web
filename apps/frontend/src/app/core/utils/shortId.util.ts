/**
 * Generates a random short id with the given length.
 * Uses a URL-safe alphabet (no confusing chars).
 * Not meant for security tokens, but great for UI ids.
 */
export function shortId(length: number = 6): string {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const alphabetLength = alphabet.length;

  let out = '';
  let seed = Date.now();

  for (let i = 0; i < length; i++) {
    // simple, fast pseudo-random step
    seed = (seed * 9301 + 49297) % 233280;
    const index = Math.floor((seed / 233280) * alphabetLength);
    out += alphabet[index];
  }

  return out;
}
