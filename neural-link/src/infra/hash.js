/**
 * FNV-1a 32-bit hash. Fast, good distribution, zero deps.
 * @param {string} str
 * @returns {number} unsigned 32-bit integer
 */
export function fnv1a(str) {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0; // FNV prime, keep as uint32
  }
  return hash;
}
