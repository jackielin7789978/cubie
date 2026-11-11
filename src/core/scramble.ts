import { layerCoords } from './cubeState';
import { isSameLayer } from './moves';
import { AXES } from './types';
import type { Move } from './types';

/** 各尺寸預設的打亂步數 */
export function defaultScrambleLength(size: number): number {
  if (size <= 2) return 10;
  if (size === 3) return 20;
  return 20 * (size - 2);
}

/** 可以拿來打亂的層。N 是奇數時不轉正中間那層，中心塊才會留在原位。 */
export function scrambleLayers(size: number): number[] {
  return layerCoords(size).filter((layer) => Math.abs(layer) > 1e-6);
}

function pick<T>(items: readonly T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)];
}

/** 產生隨機打亂序列，不會連續轉同一層 */
export function generateScramble(
  size: number,
  length: number = defaultScrambleLength(size),
  rng: () => number = Math.random,
): Move[] {
  const layers = scrambleLayers(size);
  const moves: Move[] = [];
  while (moves.length < length) {
    const move: Move = { axis: pick(AXES, rng), layer: pick(layers, rng), dir: rng() < 0.5 ? 1 : -1 };
    const previous = moves[moves.length - 1];
    if (previous && isSameLayer(previous, move)) continue;
    moves.push(move);
  }
  return moves;
}
