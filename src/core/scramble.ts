import { applyMoves, createSolvedState, isSolved, layerCoords } from './cubeState';
import { isWithinMovesOfSolved } from './nearSolved';
import { AXES } from './types';
import type { CubeState, Move } from './types';

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

/**
 * 實際打亂時每一軸會轉的層。
 * 2×2 只轉正向那一層（等於只用 R、U、F）：同一軸兩層同方向各轉一次等於整顆換方向，
 * 只轉一層才不會出現「看起來有轉、其實沒亂」的打亂。
 */
export function scrambleLayersForAxis(size: number): number[] {
  const layers = scrambleLayers(size);
  return size === 2 ? layers.filter((layer) => layer > 0) : layers;
}

/** 2×2 離完成太近（這個步數以內可解）的打亂要重抽 */
export const MIN_2X2_SCRAMBLE_DISTANCE = 4;

/** 重抽次數上限：正常情況幾乎不會重抽，只是避免意外的無窮迴圈 */
const MAX_ATTEMPTS = 100;

function pick<T>(items: readonly T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)];
}

/** 隨機產生一串轉動，不會連續轉同一軸 */
function randomMoves(layers: readonly number[], length: number, rng: () => number): Move[] {
  const moves: Move[] = [];
  while (moves.length < length) {
    const move: Move = { axis: pick(AXES, rng), layer: pick(layers, rng), dir: rng() < 0.5 ? 1 : -1 };
    const previous = moves[moves.length - 1];
    if (previous && previous.axis === move.axis) continue;
    moves.push(move);
  }
  return moves;
}

/** 打亂結果夠不夠亂：不能是完成狀態；2×2 還不能在幾步內就解完 */
export function isAcceptableScramble(size: number, scrambled: CubeState): boolean {
  if (isSolved(scrambled)) return false;
  if (size !== 2) return true;
  return !isWithinMovesOfSolved(scrambled, MIN_2X2_SCRAMBLE_DISTANCE - 1);
}

/** 產生隨機打亂序列：不會連續轉同一軸，結果一定不是（也不接近）完成狀態 */
export function generateScramble(
  size: number,
  length: number = defaultScrambleLength(size),
  rng: () => number = Math.random,
): Move[] {
  const layers = scrambleLayersForAxis(size);
  if (layers.length === 0 && length > 0) throw new Error(`${size}×${size} 沒有可以打亂的層`);
  if (length === 0) return [];
  const solved = createSolvedState(size);
  let moves = randomMoves(layers, length, rng);
  for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt++) {
    if (isAcceptableScramble(size, applyMoves(solved, moves))) break;
    moves = randomMoves(layers, length, rng);
  }
  return moves;
}
