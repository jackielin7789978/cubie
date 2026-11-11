import type { Move } from './types';

/** 反向轉動 */
export function invertMove(move: Move): Move {
  return { axis: move.axis, layer: move.layer, dir: move.dir === 1 ? -1 : 1 };
}

/** 一串轉動的反向：順序倒過來，每一步反向 */
export function invertMoves(moves: readonly Move[]): Move[] {
  return moves.map(invertMove).reverse();
}

export function isSameLayer(a: Move, b: Move): boolean {
  return a.axis === b.axis && Math.abs(a.layer - b.layer) < 1e-6;
}

// 待 core 工作線補上（3×3 標準記號）：
//   parseNotation(notation: string, size?: number): Move[]   例："R U' F2"
//   toNotation(moves: readonly Move[], size: number): string  只處理外層；內層轉動丟出錯誤
