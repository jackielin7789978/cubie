import { describe, expect, it } from 'vitest';
import { applyMoves, createSolvedState, layerCoords } from './cubeState';
import { faceMove, invertMove, invertMoves, isSameLayer, parseNotation, toNotation } from './moves';
import type { FaceLetter } from './moves';
import type { Move } from './types';

const R: Move = { axis: 'x', layer: 1, dir: -1 };
const U: Move = { axis: 'y', layer: 1, dir: -1 };

describe('invertMove / invertMoves / isSameLayer', () => {
  it('invertMove 只翻轉方向', () => {
    expect(invertMove(R)).toEqual({ axis: 'x', layer: 1, dir: 1 });
    expect(invertMove(invertMove(R))).toEqual(R);
  });

  it('invertMoves 順序倒過來、每步反向，不修改原陣列', () => {
    const moves = [R, U];
    expect(invertMoves(moves)).toEqual([invertMove(U), invertMove(R)]);
    expect(moves).toEqual([R, U]);
  });

  it('isSameLayer 比較軸和層，不管方向', () => {
    expect(isSameLayer(R, invertMove(R))).toBe(true);
    expect(isSameLayer(R, { axis: 'x', layer: -1, dir: -1 })).toBe(false);
    expect(isSameLayer(R, { axis: 'y', layer: 1, dir: -1 })).toBe(false);
  });
});

describe('parseNotation', () => {
  it('六個面的順時針：正方向的面 dir=-1，負方向的面 dir=1', () => {
    expect(parseNotation('R L U D F B')).toEqual([
      { axis: 'x', layer: 1, dir: -1 },
      { axis: 'x', layer: -1, dir: 1 },
      { axis: 'y', layer: 1, dir: -1 },
      { axis: 'y', layer: -1, dir: 1 },
      { axis: 'z', layer: 1, dir: -1 },
      { axis: 'z', layer: -1, dir: 1 },
    ]);
  });

  it("' 是逆時針、2 拆成兩個相同的轉動", () => {
    expect(parseNotation("R'")).toEqual([invertMove(R)]);
    expect(parseNotation('U2')).toEqual([U, U]);
    expect(parseNotation("U2'")).toEqual([U, U]);
  });

  it('依尺寸決定外層座標', () => {
    expect(parseNotation('R', 2)).toEqual([{ axis: 'x', layer: 0.5, dir: -1 }]);
    expect(parseNotation('L', 4)).toEqual([{ axis: 'x', layer: -1.5, dir: 1 }]);
  });

  it('容許多餘空白，空字串回傳空陣列', () => {
    expect(parseNotation('  R   U  ')).toEqual([R, U]);
    expect(parseNotation('')).toEqual([]);
    expect(parseNotation('   ')).toEqual([]);
  });

  it.each(['X', 'r', 'R3', "R''", 'RU', 'M', "2R", 'R-'])('不合法的記號 %s 丟出錯誤', (bad) => {
    expect(() => parseNotation(bad)).toThrow();
  });

  it('解析出來的轉動確實是該面順時針：R 把 F 面貼紙送到 U 面', () => {
    const state = applyMoves(createSolvedState(3), parseNotation('R'));
    const upRightColumn = state.stickers.filter((s) => s.normal[1] === 1 && s.position[0] === 1);
    expect(upRightColumn.map((s) => s.color)).toEqual(['F', 'F', 'F']);
  });
});

describe('toNotation', () => {
  it.each(['R', "R'", 'R2', "R U R' U'", "F2 B' L D2 U' R2 B", ''])('來回一致：%s', (notation) => {
    expect(toNotation(parseNotation(notation), 3)).toBe(notation);
  });

  it.each([2, 4])('%i×%i 外層也可以來回轉換', (size) => {
    const notation = "R U2 L' D F2 B";
    expect(toNotation(parseNotation(notation, size), size)).toBe(notation);
  });

  it("相鄰兩個相同的轉動合併成 2（R' R' 也是 R2）；三個不合併成一個", () => {
    expect(toNotation([R, R], 3)).toBe('R2');
    expect(toNotation([invertMove(R), invertMove(R)], 3)).toBe('R2');
    expect(toNotation([R, R, R], 3)).toBe('R2 R');
    expect(toNotation([R, invertMove(R)], 3)).toBe("R R'");
  });

  it('遇到內層轉動丟出錯誤', () => {
    expect(() => toNotation([{ axis: 'x', layer: 0, dir: 1 }], 3)).toThrow();
    expect(() => toNotation([{ axis: 'y', layer: 0.5, dir: 1 }], 4)).toThrow();
  });

  it('faceMove 涵蓋每個尺寸的兩個外層', () => {
    const faces: FaceLetter[] = ['R', 'L', 'U', 'D', 'F', 'B'];
    for (const size of [2, 3, 4]) {
      const outer = layerCoords(size);
      for (const face of faces) {
        const { layer } = faceMove(face, size);
        expect([outer[0], outer[size - 1]]).toContain(layer);
      }
    }
  });
});
