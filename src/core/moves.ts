import type { Axis, Move } from './types';

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

/** 標準記號的六個面 */
export type FaceLetter = 'U' | 'D' | 'F' | 'B' | 'L' | 'R';

interface FaceTurn {
  axis: Axis;
  /** 這一面在軸上的方向：+1 是正方向那一側（R、U、F），-1 是負方向（L、D、B） */
  side: 1 | -1;
}

/**
 * 每個面在哪一軸、哪一側。
 * 面的「順時針」是從該面正前方看過去的順時針，等於繞朝外的法向量轉 -90°，
 * 所以正方向的面（R U F）順時針是 dir = -1，負方向的面（L D B）順時針是 dir = 1。
 */
const FACE_TURNS: Record<FaceLetter, FaceTurn> = {
  R: { axis: 'x', side: 1 },
  L: { axis: 'x', side: -1 },
  U: { axis: 'y', side: 1 },
  D: { axis: 'y', side: -1 },
  F: { axis: 'z', side: 1 },
  B: { axis: 'z', side: -1 },
};

const FACE_LETTERS = Object.keys(FACE_TURNS) as FaceLetter[];
const TOKEN_PATTERN = /^([UDFBLR])(2'?|'?)$/;

function outerLayer(size: number): number {
  return (size - 1) / 2;
}

/** 某一面的順時針轉動 */
export function faceMove(face: FaceLetter, size = 3): Move {
  const { axis, side } = FACE_TURNS[face];
  return { axis, layer: side * outerLayer(size), dir: side === 1 ? -1 : 1 };
}

function parseToken(token: string, size: number): Move[] {
  const match = TOKEN_PATTERN.exec(token);
  if (!match) throw new Error(`看不懂的轉動記號：「${token}」`);
  const clockwise = faceMove(match[1] as FaceLetter, size);
  const suffix = match[2];
  if (suffix.startsWith('2')) return [clockwise, clockwise];
  return [suffix === "'" ? invertMove(clockwise) : clockwise];
}

/**
 * 解析標準記號，例如 "R U' F2"。以空白分隔；2 會拆成兩個相同的 90° 轉動。
 * 不合法的記號丟出錯誤。
 */
export function parseNotation(notation: string, size = 3): Move[] {
  const tokens = notation.trim().split(/\s+/).filter((token) => token.length > 0);
  return tokens.flatMap((token) => parseToken(token, size));
}

/** 單一外層轉動轉成記號（例如 "R"、"U'"）；不是外層就丟出錯誤 */
export function moveToNotation(move: Move, size: number): string {
  const face = FACE_LETTERS.find((letter) => isSameLayer(faceMove(letter, size), move));
  if (!face) throw new Error(`內層轉動沒有標準記號：axis=${move.axis} layer=${move.layer}`);
  return move.dir === faceMove(face, size).dir ? face : `${face}'`;
}

function isSameMove(a: Move, b: Move): boolean {
  return isSameLayer(a, b) && a.dir === b.dir;
}

/** 一串外層轉動轉成記號，相鄰兩個相同的轉動合併成 "X2"；遇到內層轉動丟出錯誤 */
export function toNotation(moves: readonly Move[], size: number): string {
  const tokens: string[] = [];
  for (let i = 0; i < moves.length; i++) {
    const token = moveToNotation(moves[i], size);
    const next = moves[i + 1];
    if (next && isSameMove(moves[i], next)) {
      tokens.push(`${token[0]}2`);
      i++;
    } else {
      tokens.push(token);
    }
  }
  return tokens.join(' ');
}
