/**
 * Generates a random short id with the given length.
 * Uses a URL-safe alphabet (no confusing chars).
 * Not meant for security tokens, but great for UI ids.
 */
export function shortId(length: number = 6): string {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);

  let out = '';
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}
