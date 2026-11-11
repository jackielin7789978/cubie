import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { applyMove, createSolvedState, isInLayer } from '../core';
import type { Axis, Move } from '../core/types';
import { dragToMove, faceHitFromPoint, keyToMove } from './gesture';
import type { Projector } from './gesture';

const VIEW = 1000;

function projectorFrom(position: Vector3): Projector {
  const camera = new PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.copy(position);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  return (v) => {
    const p = v.clone().project(camera);
    return { x: ((p.x + 1) / 2) * VIEW, y: ((1 - p.y) / 2) * VIEW };
  };
}

const DEFAULT_CAMERA = new Vector3(5.2, 4.6, 6.4);
const AXIS_VEC: Record<Axis, Vector3> = { x: new Vector3(1, 0, 0), y: new Vector3(0, 1, 0), z: new Vector3(0, 0, 1) };

describe('keyToMove', () => {
  it('R = { x, 最外層, -1 }，Shift 反向', () => {
    expect(keyToMove('r', false, 3)).toEqual({ axis: 'x', layer: 1, dir: -1 });
    expect(keyToMove('R', true, 3)).toEqual({ axis: 'x', layer: 1, dir: 1 });
    expect(keyToMove('L', false, 4)).toEqual({ axis: 'x', layer: -1.5, dir: 1 });
    expect(keyToMove('x', false, 3)).toBeNull();
  });

  it('六個面順時針的效果符合標準記號（用 core 驗證）', () => {
    const solved = createSolvedState(3);
    // [按鍵, 會被帶走的面, 帶到哪個面]：例如 R 會把前面右欄帶到上面
    const cases: [string, Vector3, Vector3][] = [
      ['R', new Vector3(0, 0, 1), new Vector3(0, 1, 0)],
      ['L', new Vector3(0, 0, 1), new Vector3(0, -1, 0)],
      ['U', new Vector3(0, 0, 1), new Vector3(-1, 0, 0)],
      ['D', new Vector3(0, 0, 1), new Vector3(1, 0, 0)],
      ['F', new Vector3(0, 1, 0), new Vector3(1, 0, 0)],
      ['B', new Vector3(0, 1, 0), new Vector3(-1, 0, 0)],
    ];
    for (const [key, from, to] of cases) {
      const move = keyToMove(key, false, 3) as Move;
      const after = applyMove(solved, move);
      const moved = solved.stickers.filter(
        (s) => isInLayer(s.position, move) && new Vector3(...s.normal).equals(from),
      );
      for (const s of moved) {
        const now = after.stickers.find((t) => t.color === s.color && isInLayer(t.position, move) && new Vector3(...t.normal).equals(to));
        expect(now, `${key}`).toBeDefined();
      }
    }
  });
});

describe('dragToMove', () => {
  const project = projectorFrom(DEFAULT_CAMERA);

  it('正面中間偏上的貼紙往右拖 → 最上層往右轉', () => {
    const hit = faceHitFromPoint(new Vector3(0, 1, 1.5), 3, new Vector3(0, 0, 1));
    expect(dragToMove(hit, { x: 40, y: 0 }, project)).toEqual({ axis: 'y', layer: 1, dir: 1 });
  });

  it('正面右欄往上拖 → 標準記號 R', () => {
    const hit = faceHitFromPoint(new Vector3(1, 0, 1.5), 3, new Vector3(0, 0, 1));
    expect(dragToMove(hit, { x: 0, y: -40 }, project)).toEqual({ axis: 'x', layer: 1, dir: -1 });
  });

  it('任何視角、任何面、任何拖曳方向：被按的貼紙都往手指的方向走', () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    for (let i = 0; i < 400; i++) {
      const size = 2 + (i % 3);
      const cameraPos = new Vector3(rand(), rand(), rand()).normalize().multiplyScalar(12);
      const proj = projectorFrom(cameraPos);
      // 找一個面向相機的面
      const axes: Axis[] = ['x', 'y', 'z'];
      const faceAxis = axes[i % 3];
      const facing = cameraPos.dot(AXIS_VEC[faceAxis]) / 12;
      // 幾乎側著看的面（玩家看不太到）不測
      if (Math.abs(facing) < 0.3) continue;
      const sign = Math.sign(facing);
      const point = new Vector3(rand(), rand(), rand()).multiplyScalar(size / 2 - 0.05);
      point.setComponent(axes.indexOf(faceAxis), (sign * size) / 2);
      const hit = faceHitFromPoint(point, size, AXIS_VEC[faceAxis].clone().multiplyScalar(sign));
      const angle = rand() * Math.PI;
      const drag = { x: Math.cos(angle) * 50, y: Math.sin(angle) * 50 };
      const move = dragToMove(hit, drag, proj);

      // 被按的小方塊在這一層
      expect(isInLayer(hit.cubie, move)).toBe(true);
      // 貼紙沿著面移動的方向（去掉垂直於面的分量）投影到螢幕後，和拖曳方向夾角小於 90°
      const omega = AXIS_VEC[move.axis].clone().multiplyScalar(move.dir);
      const normal = AXIS_VEC[faceAxis].clone().multiplyScalar(sign);
      const velocity = new Vector3().crossVectors(omega, point);
      velocity.addScaledVector(normal, -velocity.dot(normal)).multiplyScalar(0.01);
      const a = proj(point);
      const b = proj(point.clone().add(velocity));
      expect((b.x - a.x) * drag.x + (b.y - a.y) * drag.y, JSON.stringify({ cameraPos, point, drag, move })).toBeGreaterThan(0);
    }
  });
});
