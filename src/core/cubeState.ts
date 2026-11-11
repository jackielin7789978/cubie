import { AXES, AXIS_INDEX, FACE_NORMALS, FACES } from './types';
import type { Axis, CubeState, FaceColor, Move, Sticker, Vec3 } from './types';

/** 某個尺寸每一軸上所有層的座標，例如 N=3 → [-1, 0, 1]，N=4 → [-1.5, -0.5, 0.5, 1.5] */
export function layerCoords(size: number): number[] {
  const offset = (size - 1) / 2;
  return Array.from({ length: size }, (_, i) => i - offset);
}

/** 把向量繞指定軸轉 90°（dir = 1 是繞正軸 +90°，右手定則） */
export function rotateVec(v: Vec3, axis: Axis, dir: 1 | -1): Vec3 {
  const [x, y, z] = v;
  // 最後 + 0 是為了把 -0 變回 0，比較和顯示才不會出怪事
  if (axis === 'x') return [x, -dir * z + 0, dir * y + 0];
  if (axis === 'y') return [dir * z + 0, y, -dir * x + 0];
  return [-dir * y + 0, dir * x + 0, z];
}

function faceStickers(size: number, color: FaceColor): Sticker[] {
  const normal = FACE_NORMALS[color];
  const fixed = normal.findIndex((n) => n !== 0);
  const offset = (size - 1) / 2;
  const coords = layerCoords(size);
  const stickers: Sticker[] = [];
  for (const a of coords) {
    for (const b of coords) {
      const position = [a, b, 0];
      position.splice(fixed, 0, normal[fixed] * offset);
      stickers.push({ position: [position[0], position[1], position[2]], normal, color });
    }
  }
  return stickers;
}

/** 建立完成狀態的 N×N 方塊 */
export function createSolvedState(size: number): CubeState {
  return { size, stickers: FACES.flatMap((color) => faceStickers(size, color)) };
}

const EPSILON = 1e-6;

export function isInLayer(position: Vec3, move: Pick<Move, 'axis' | 'layer'>): boolean {
  return Math.abs(position[AXIS_INDEX[move.axis]] - move.layer) < EPSILON;
}

/** 套用一步轉動，回傳新的狀態（不修改原本的） */
export function applyMove(state: CubeState, move: Move): CubeState {
  const stickers = state.stickers.map((sticker) =>
    isInLayer(sticker.position, move)
      ? {
          position: rotateVec(sticker.position, move.axis, move.dir),
          normal: rotateVec(sticker.normal, move.axis, move.dir),
          color: sticker.color,
        }
      : sticker,
  );
  return { size: state.size, stickers };
}

export function applyMoves(state: CubeState, moves: readonly Move[]): CubeState {
  return moves.reduce(applyMove, state);
}

/** 六個方向的貼紙各自同色就算完成（整顆方塊轉了方向也算） */
export function isSolved(state: CubeState): boolean {
  const colorByNormal = new Map<string, FaceColor>();
  for (const sticker of state.stickers) {
    const key = sticker.normal.join(',');
    const seen = colorByNormal.get(key);
    if (seen === undefined) colorByNormal.set(key, sticker.color);
    else if (seen !== sticker.color) return false;
  }
  return true;
}

export { AXES };
