/**
 * 可重現的亂數產生器（mulberry32）。同一個 seed 會產生同一串 [0, 1) 的數字，
 * 可以注入 generateScramble 做出固定的打亂，也方便測試。
 */
export function createSeededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
