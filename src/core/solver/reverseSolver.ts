import { invertMoves, isSameLayer } from '../moves';
import type { Move } from '../types';

interface Turn {
  move: Move;
  /** 同一層累積的 90° 次數（以 move.dir 為正向），範圍 1–3 */
  quarters: number;
}

function turnToMoves({ move, quarters }: Turn): Move[] {
  if (quarters === 1) return [move];
  if (quarters === 2) return [move, move];
  return [{ ...move, dir: move.dir === 1 ? -1 : 1 }];
}

/** 合併相鄰的同層轉動：R R' 抵銷、R R R → R'、R R R R 抵銷 */
export function simplifyMoves(moves: readonly Move[]): Move[] {
  const stack: Turn[] = [];
  for (const move of moves) {
    const top = stack[stack.length - 1];
    if (!top || !isSameLayer(top.move, move)) {
      stack.push({ move, quarters: 1 });
      continue;
    }
    top.quarters = (top.quarters + (move.dir === top.move.dir ? 1 : 3)) % 4;
    if (top.quarters === 0) stack.pop();
  }
  return stack.flatMap(turnToMoves);
}

/** 反轉歷史解法：把做過的所有轉動（打亂＋玩家）化簡後倒著轉回去 */
export function reverseSolve(appliedMoves: readonly Move[]): Move[] {
  return invertMoves(simplifyMoves(appliedMoves));
}
