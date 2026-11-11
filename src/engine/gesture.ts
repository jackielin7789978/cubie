// 手勢與鍵盤的純計算：不碰 DOM，方便單元測試。
import { Vector3 } from 'three';
import type { Axis, Move, Vec3 } from '../core/types';
import { AXES, AXIS_INDEX } from '../core/types';
import { faceMove, invertMove } from '../core/moves';
import type { FaceLetter } from '../core/moves';

/** 螢幕座標（像素，y 往下） */
export interface ScreenPoint {
  x: number;
  y: number;
}

/** 按到方塊表面的結果：哪個面、哪個小方塊 */
export interface FaceHit {
  /** 按到的點（方塊座標） */
  point: Vector3;
  /** 該面朝外的軸與正負號 */
  faceAxis: Axis;
  faceSign: 1 | -1;
  /** 被按到的小方塊座標（和 core 的 Sticker.position 同一套） */
  cubie: Vec3;
}

/** 把世界座標投影成螢幕座標 */
export type Projector = (v: Vector3) => ScreenPoint;

const AXIS_VECTORS: Record<Axis, Vec3> = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

function dominantAxis(v: Vector3): Axis {
  const abs = [Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)];
  return AXES[abs.indexOf(Math.max(...abs))];
}

/** 把某一軸上的連續座標換成最接近的小方塊座標（-(N-1)/2 ~ (N-1)/2） */
function cubieCoord(value: number, size: number): number {
  const index = Math.min(size - 1, Math.max(0, Math.floor(value + size / 2)));
  return index - (size - 1) / 2;
}

/**
 * 由按到的點（和該點的表面法向量，可省略）判斷按到哪一面、哪個小方塊。
 * 法向量在圓角上可能是斜的，所以只取最大的分量；若它指向的不是外表面（例如動畫中露出的內側），改用點的位置判斷。
 */
export function faceHitFromPoint(point: Vector3, size: number, normal?: Vector3): FaceHit {
  const half = size / 2;
  let faceAxis = normal ? dominantAxis(normal) : dominantAxis(point);
  if (Math.abs(point.getComponent(AXIS_INDEX[faceAxis])) < half - 0.3) faceAxis = dominantAxis(point);
  const i = AXIS_INDEX[faceAxis];
  const faceSign: 1 | -1 = point.getComponent(i) >= 0 ? 1 : -1;
  const coords = [0, 1, 2].map((k) =>
    k === i ? (faceSign * (size - 1)) / 2 : cubieCoord(point.getComponent(k), size),
  );
  return { point: point.clone(), faceAxis, faceSign, cubie: [coords[0], coords[1], coords[2]] };
}

function screenDirection(origin: Vector3, axis: Axis, project: Projector): ScreenPoint {
  const a = project(origin);
  const b = project(origin.clone().add(new Vector3(...AXIS_VECTORS[axis])));
  return { x: b.x - a.x, y: b.y - a.y };
}

function normalize(p: ScreenPoint): ScreenPoint {
  const len = Math.hypot(p.x, p.y) || 1;
  return { x: p.x / len, y: p.y / len };
}

/**
 * 依拖曳方向算出要轉哪一層（SPEC 4.4）。
 * 1. 把該面兩條切線軸投影到螢幕，取和拖曳方向最接近的那條當「拖曳軸」a（含正負號）。
 * 2. 轉動軸 ω = 面法向量 n × a。繞 ω 轉 +90° 時，表面上的點剛好往 a 的方向走，所以手指往哪拖、那層就往哪轉。
 */
export function dragToMove(hit: FaceHit, drag: ScreenPoint, project: Projector): Move {
  const tangents = AXES.filter((axis) => axis !== hit.faceAxis);
  const dragDir = normalize(drag);
  const scored = tangents.map((axis) => {
    const s = screenDirection(hit.point, axis, project);
    const dot = dragDir.x * normalize(s).x + dragDir.y * normalize(s).y;
    return { axis, dot };
  });
  const best = Math.abs(scored[0].dot) >= Math.abs(scored[1].dot) ? scored[0] : scored[1];
  const dragAxis = new Vector3(...AXIS_VECTORS[best.axis]).multiplyScalar(best.dot >= 0 ? 1 : -1);
  const normal = new Vector3(...AXIS_VECTORS[hit.faceAxis]).multiplyScalar(hit.faceSign);
  const omega = new Vector3().crossVectors(normal, dragAxis);
  const axis = dominantAxis(omega);
  const dir: 1 | -1 = omega.getComponent(AXIS_INDEX[axis]) > 0 ? 1 : -1;
  return { axis, layer: hit.cubie[AXIS_INDEX[axis]], dir };
}

/** 外層面代號 → 轉動軸、在哪一側、順時針時的 dir。順時針 = 從面外面看過去順時針 = 繞外向法向量 -90°。 */
const FACE_LETTERS: readonly string[] = ['U', 'D', 'R', 'L', 'F', 'B'];

/** 鍵盤按鍵 → Move（對照表用 core 的 faceMove）。不是 U D L R F B 時回傳 null。shift = 逆時針。 */
export function keyToMove(key: string, shift: boolean, size: number): Move | null {
  const letter = key.toUpperCase();
  if (!FACE_LETTERS.includes(letter)) return null;
  const clockwise = faceMove(letter as FaceLetter, size);
  return shift ? invertMove(clockwise) : clockwise;
}
