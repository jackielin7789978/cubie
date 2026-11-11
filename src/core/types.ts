// 核心型別。這一層不依賴 React 或 Three.js。

export type Axis = 'x' | 'y' | 'z';

/** 六個面的代號：U 上、D 下、F 前、B 後、L 左、R 右。也用來代表該面完成時的顏色。 */
export type FaceColor = 'U' | 'D' | 'F' | 'B' | 'L' | 'R';

export type Vec3 = readonly [number, number, number];

/** 目前支援的尺寸。核心邏輯對任何 N 都適用，這個型別只是限制 UI 能選的值。 */
export type CubeSize = 2 | 3 | 4;

export interface Sticker {
  /** 小方塊座標，每一軸的範圍是 -(N-1)/2 ~ (N-1)/2，間隔 1（N 是偶數時會是 ±0.5、±1.5） */
  position: Vec3;
  /** 貼紙朝向的單位向量，例如 [0, 1, 0] 是朝上 */
  normal: Vec3;
  color: FaceColor;
}

/**
 * 一次 90° 的單層轉動。
 * dir = 1：從該軸「正方向」往原點看是逆時針（右手定則，繞正軸 +90°）。
 * dir = -1：反方向。
 * 例：標準記號 R（右面順時針）= { axis: 'x', layer: (N-1)/2, dir: -1 }
 */
export interface Move {
  axis: Axis;
  /** 這一層在該軸上的座標值（和 Sticker.position 同一套座標） */
  layer: number;
  dir: 1 | -1;
}

export interface CubeState {
  size: number;
  stickers: readonly Sticker[];
}

/** 每個面朝外的方向 */
export const FACE_NORMALS: Record<FaceColor, Vec3> = {
  U: [0, 1, 0],
  D: [0, -1, 0],
  F: [0, 0, 1],
  B: [0, 0, -1],
  R: [1, 0, 0],
  L: [-1, 0, 0],
};

export const AXIS_INDEX: Record<Axis, 0 | 1 | 2> = { x: 0, y: 1, z: 2 };
export const AXES: readonly Axis[] = ['x', 'y', 'z'];
export const FACES: readonly FaceColor[] = ['U', 'D', 'F', 'B', 'L', 'R'];
