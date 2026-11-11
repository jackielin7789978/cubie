import { describe, expect, it } from 'vitest';
import { applyMoves, createSolvedState } from './cubeState';
import { toFaceletString } from './facelets';
import { parseNotation } from './moves';

const SOLVED = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';

/** 取出某一面的 9 格（面順序 U R F D L B） */
function face(facelets: string, letter: string): string {
  const index = 'URFDLB'.indexOf(letter);
  return facelets.slice(index * 9, index * 9 + 9);
}

describe('toFaceletString', () => {
  it('完成狀態是標準字串', () => {
    expect(toFaceletString(createSolvedState(3))).toBe(SOLVED);
  });

  it('非 3×3 丟出錯誤', () => {
    expect(() => toFaceletString(createSolvedState(2))).toThrow();
    expect(() => toFaceletString(createSolvedState(4))).toThrow();
  });

  // 以下用 Kociemba 定義的閱讀順序驗證（每面 1-9 由左上到右下）
  it('U：F、R、B、L 上排依序輪替（F 的上排變成 R 的顏色）', () => {
    const f = toFaceletString(applyMoves(createSolvedState(3), parseNotation('U')));
    expect(face(f, 'U')).toBe('UUUUUUUUU');
    expect(face(f, 'F')).toBe('RRRFFFFFF');
    expect(face(f, 'R')).toBe('BBBRRRRRR');
    expect(face(f, 'B')).toBe('LLLBBBBBB');
    expect(face(f, 'L')).toBe('FFFLLLLLL');
  });

  it('R：U 面右欄（U3 U6 U9）變成 F 的顏色，F 面右欄變成 D', () => {
    const f = toFaceletString(applyMoves(createSolvedState(3), parseNotation('R')));
    expect(face(f, 'U')).toBe('UUFUUFUUF');
    expect(face(f, 'F')).toBe('FFDFFDFFD');
    expect(face(f, 'D')).toBe('DDBDDBDDB');
    // B 面從後面看，靠 R 的是左欄（B1 B4 B7）
    expect(face(f, 'B')).toBe('UBBUBBUBB');
  });

  it('F：U 面下排（U7 U8 U9）變成 L 的顏色，R 面左欄變成 U', () => {
    const f = toFaceletString(applyMoves(createSolvedState(3), parseNotation('F')));
    expect(face(f, 'U')).toBe('UUUUUULLL');
    expect(face(f, 'R')).toBe('URRURRURR');
    // D 面從下面看、上方是 F，所以 D1 D2 D3 靠 F
    expect(face(f, 'D')).toBe('RRRDDDDDD');
    expect(face(f, 'L')).toBe('LLDLLDLLD');
  });

  it('中間層轉過（中心塊移位）時，以中心塊顏色決定字母', () => {
    // 整顆方塊繞 y 轉：所有面仍各自同色，字串應該仍是完成狀態
    const rotated = applyMoves(createSolvedState(3), [
      { axis: 'y', layer: 1, dir: 1 },
      { axis: 'y', layer: 0, dir: 1 },
      { axis: 'y', layer: -1, dir: 1 },
    ]);
    expect(toFaceletString(rotated)).toBe(SOLVED);
  });

  it('每個字母剛好出現 9 次', () => {
    const f = toFaceletString(applyMoves(createSolvedState(3), parseNotation("R U F' L2 D B'")));
    for (const letter of 'URFDLB') expect(f.split(letter).length - 1).toBe(9);
  });
});
