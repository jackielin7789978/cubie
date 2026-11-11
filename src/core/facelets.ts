import { layerCoords } from './cubeState';
import type { CubeState, FaceColor, Vec3 } from './types';

/**
 * Kociemba facelet 字串：54 個字元，面的順序是 U R F D L B，每面 9 格。
 * 每一面的 9 格是「站在該面正前方看」由左上到右下逐列讀取：
 * - U：上方是 B 面（第一列靠後面）
 * - R、F、L、B：上方是 U 面
 * - D：上方是 F 面（第一列靠前面）
 *
 * 下面用三個向量描述每一面：normal 朝外、right 是讀取時往右的方向、down 是往下一列的方向。
 */
interface FaceFrame {
  face: FaceColor;
  normal: Vec3;
  right: Vec3;
  down: Vec3;
}

export const KOCIEMBA_FACE_FRAMES: readonly FaceFrame[] = [
  { face: 'U', normal: [0, 1, 0], right: [1, 0, 0], down: [0, 0, 1] },
  { face: 'R', normal: [1, 0, 0], right: [0, 0, -1], down: [0, -1, 0] },
  { face: 'F', normal: [0, 0, 1], right: [1, 0, 0], down: [0, -1, 0] },
  { face: 'D', normal: [0, -1, 0], right: [1, 0, 0], down: [0, 0, -1] },
  { face: 'L', normal: [-1, 0, 0], right: [0, 0, 1], down: [0, -1, 0] },
  { face: 'B', normal: [0, 0, -1], right: [-1, 0, 0], down: [0, -1, 0] },
];

const KOCIEMBA_SIZE = 3;

/** 位置＋朝向的查表 key（四捨五入到 0.5 的倍數，避免浮點誤差） */
function stickerKey(position: Vec3, normal: Vec3): string {
  const round = (n: number) => Math.round(n * 2) / 2 + 0;
  return [...position, ...normal].map(round).join(',');
}

/** 某一面第 row 列、第 col 欄那一格的貼紙座標 */
function faceletPosition(frame: FaceFrame, row: number, col: number): Vec3 {
  const surface = (KOCIEMBA_SIZE - 1) / 2;
  const coords = layerCoords(KOCIEMBA_SIZE);
  const axisValue = (i: number) =>
    frame.normal[i] * surface + frame.right[i] * coords[col] + frame.down[i] * coords[row];
  return [axisValue(0), axisValue(1), axisValue(2)];
}

/** 依 Kociemba 順序列出 54 格要讀的（位置, 朝向） */
function faceletSlots(): { position: Vec3; normal: Vec3 }[] {
  return KOCIEMBA_FACE_FRAMES.flatMap((frame) =>
    Array.from({ length: KOCIEMBA_SIZE * KOCIEMBA_SIZE }, (_, i) => ({
      position: faceletPosition(frame, Math.floor(i / KOCIEMBA_SIZE), i % KOCIEMBA_SIZE),
      normal: frame.normal,
    })),
  );
}

/**
 * 顏色 → 目前所在的面。依中心塊判斷，所以就算玩家轉過中間層、
 * 整顆方塊換了方向，產生的字串仍然以「目前的」六個面為準。
 */
function colorToFace(colorAt: Map<string, FaceColor>): Map<FaceColor, FaceColor> {
  const mapping = new Map<FaceColor, FaceColor>();
  for (const frame of KOCIEMBA_FACE_FRAMES) {
    const center = colorAt.get(stickerKey(faceletPosition(frame, 1, 1), frame.normal));
    if (center === undefined) throw new Error(`找不到 ${frame.face} 面的中心塊`);
    mapping.set(center, frame.face);
  }
  return mapping;
}

/** 把 3×3 的 CubeState 轉成 Kociemba 標準的 54 字元 facelet 字串（cubejs 用的格式） */
export function toFaceletString(state: CubeState): string {
  if (state.size !== KOCIEMBA_SIZE) {
    throw new Error(`facelet 字串只支援 3×3，收到 ${state.size}×${state.size}`);
  }
  const colorAt = new Map<string, FaceColor>();
  for (const sticker of state.stickers) colorAt.set(stickerKey(sticker.position, sticker.normal), sticker.color);
  const faceOf = colorToFace(colorAt);
  return faceletSlots()
    .map(({ position, normal }) => {
      const color = colorAt.get(stickerKey(position, normal));
      if (color === undefined) throw new Error('貼紙資料不完整，缺少某一格');
      return faceOf.get(color);
    })
    .join('');
}
