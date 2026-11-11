import { describe, expect, it } from 'vitest';
import { applyMove, applyMoves, createSolvedState, isInLayer, isSolved, layerCoords, rotateVec } from './cubeState';
import { invertMove, parseNotation } from './moves';
import { AXES } from './types';
import type { Axis, CubeState, FaceColor, Move, Sticker, Vec3 } from './types';

const SIZES = [2, 3, 4];

/** 某尺寸所有可能的單層轉動 */
function allMoves(size: number): Move[] {
  return AXES.flatMap((axis) =>
    layerCoords(size).flatMap((layer) => [1, -1].map((dir) => ({ axis, layer, dir }) as Move)),
  );
}

/** 整顆方塊一起轉（所有層同方向） */
function wholeCubeRotation(size: number, axis: Axis, dir: 1 | -1): Move[] {
  return layerCoords(size).map((layer) => ({ axis, layer, dir }));
}

/** 找出某個位置、朝向的貼紙 */
function stickerAt(state: CubeState, position: Vec3, normal: Vec3): Sticker | undefined {
  const same = (a: Vec3, b: Vec3) => a.every((v, i) => Math.abs(v - b[i]) < 1e-6);
  return state.stickers.find((s) => same(s.position, position) && same(s.normal, normal));
}

/** 不在乎貼紙順序，比較兩個狀態是否相同 */
function canonical(state: CubeState): string[] {
  return state.stickers.map((s) => `${s.position.join()}|${s.normal.join()}|${s.color}`).sort();
}

describe('rotateVec', () => {
  it('右手定則：繞 x +90° 把 +y 轉到 +z', () => {
    expect(rotateVec([0, 1, 0], 'x', 1)).toEqual([0, 0, 1]);
  });
  it('右手定則：繞 y +90° 把 +z 轉到 +x', () => {
    expect(rotateVec([0, 0, 1], 'y', 1)).toEqual([1, 0, 0]);
  });
  it('右手定則：繞 z +90° 把 +x 轉到 +y', () => {
    expect(rotateVec([1, 0, 0], 'z', 1)).toEqual([0, 1, 0]);
  });
  it('不會產生 -0', () => {
    const result = rotateVec([0, 0, 0], 'x', -1);
    result.forEach((v) => expect(Object.is(v, -0)).toBe(false));
  });
});

describe.each(SIZES)('%i×%i 方塊', (size) => {
  const solved = createSolvedState(size);

  it('貼紙數量正確，每面 N×N 張，初始為完成狀態', () => {
    expect(solved.stickers).toHaveLength(6 * size * size);
    const counts = new Map<FaceColor, number>();
    solved.stickers.forEach((s) => counts.set(s.color, (counts.get(s.color) ?? 0) + 1));
    expect([...counts.values()]).toEqual(Array(6).fill(size * size));
    expect(isSolved(solved)).toBe(true);
  });

  it('每張貼紙都在表面上，而且位置＋朝向不重複', () => {
    const surface = (size - 1) / 2;
    for (const s of solved.stickers) {
      const axis = s.normal.findIndex((n) => n !== 0);
      expect(s.position[axis]).toBe(s.normal[axis] * surface);
    }
    expect(new Set(canonical(solved)).size).toBe(solved.stickers.length);
  });

  it.each(allMoves(size).map((m) => [m.axis, m.layer, m.dir, m] as const))(
    '轉動 %s 軸 layer=%s dir=%s：只影響該層、轉 4 次復原、接反向轉動復原',
    (_axis, _layer, _dir, move) => {
      const turned = applyMove(solved, move);
      turned.stickers.forEach((sticker, i) => {
        if (!isInLayer(solved.stickers[i].position, move)) expect(sticker).toBe(solved.stickers[i]);
      });
      expect(turned.stickers.some((s, i) => s !== solved.stickers[i])).toBe(true);
      expect(canonical(applyMoves(solved, [move, move, move, move]))).toEqual(canonical(solved));
      expect(canonical(applyMoves(solved, [move, invertMove(move)]))).toEqual(canonical(solved));
    },
  );

  it('applyMove 不修改原本的狀態', () => {
    const before = canonical(solved);
    applyMove(solved, allMoves(size)[0]);
    expect(canonical(solved)).toEqual(before);
  });

  it('isSolved：整顆方塊轉向後仍算完成', () => {
    for (const axis of AXES) {
      const rotated = applyMoves(solved, wholeCubeRotation(size, axis, 1));
      expect(isSolved(rotated)).toBe(true);
    }
    const tumbled = applyMoves(solved, [...wholeCubeRotation(size, 'x', 1), ...wholeCubeRotation(size, 'y', -1)]);
    expect(isSolved(tumbled)).toBe(true);
  });

  it('isSolved：只差一步不算完成', () => {
    for (const move of allMoves(size)) expect(isSolved(applyMove(solved, move))).toBe(false);
  });
});

describe('3×3 方向定義（已知事實）', () => {
  const solved = createSolvedState(3);

  it('R：F 面右欄跑到 U 面（F→U→B→D→F）', () => {
    const afterR = applyMoves(solved, parseNotation('R'));
    for (const y of [-1, 0, 1]) {
      // 原本 F 面右欄 (x=1, z=1, 朝 +z) → U 面右欄 (x=1, y=1, 朝 +y)
      expect(stickerAt(afterR, [1, 1, -y], [0, 1, 0])?.color).toBe('F');
      expect(stickerAt(afterR, [1, y, -1], [0, 0, -1])?.color).toBe('U');
      expect(stickerAt(afterR, [1, -1, y], [0, -1, 0])?.color).toBe('B');
      expect(stickerAt(afterR, [1, y, 1], [0, 0, 1])?.color).toBe('D');
    }
  });

  it('U：F 面上排跑到 L 面（F→L→B→R→F）', () => {
    const afterU = applyMoves(solved, parseNotation('U'));
    expect(stickerAt(afterU, [-1, 1, 0], [-1, 0, 0])?.color).toBe('F');
    expect(stickerAt(afterU, [0, 1, -1], [0, 0, -1])?.color).toBe('L');
    expect(stickerAt(afterU, [1, 1, 0], [1, 0, 0])?.color).toBe('B');
    expect(stickerAt(afterU, [0, 1, 1], [0, 0, 1])?.color).toBe('R');
  });

  it('F：U 面下排跑到 R 面（U→R→D→L→U）', () => {
    const afterF = applyMoves(solved, parseNotation('F'));
    expect(stickerAt(afterF, [1, 0, 1], [1, 0, 0])?.color).toBe('U');
    expect(stickerAt(afterF, [0, -1, 1], [0, -1, 0])?.color).toBe('R');
    expect(stickerAt(afterF, [-1, 0, 1], [-1, 0, 0])?.color).toBe('D');
    expect(stickerAt(afterF, [0, 1, 1], [0, 1, 0])?.color).toBe('L');
  });

  it("(R U R' U') ×6 回到完成狀態；只做一次不是完成", () => {
    const sexy = parseNotation("R U R' U'");
    expect(isSolved(applyMoves(solved, sexy))).toBe(false);
    const six = Array.from({ length: 6 }, () => sexy).flat();
    expect(canonical(applyMoves(solved, six))).toEqual(canonical(solved));
  });

  it('(R2 U2) ×6 回到完成狀態；×3 不是完成', () => {
    const seq = Array.from({ length: 6 }, () => parseNotation('R2 U2')).flat();
    expect(isSolved(applyMoves(solved, seq))).toBe(true);
    expect(isSolved(applyMoves(solved, seq.slice(0, 12)))).toBe(false);
  });
});
