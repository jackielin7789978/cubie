// 方塊的 3D 模型：小方塊（本體＋貼紙）、共用的幾何與材質、依 CubeState 擺放貼紙顏色。
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { FACES, FACE_NORMALS, createSolvedState, layerCoords } from '../core';
import type { Axis, CubeState, FaceColor, Sticker, Vec3 } from '../core/types';

// 尺寸照第 0 階段預覽（previews/phase0/cube.js）
const BODY_SIZE = 0.98;
const BODY_RADIUS = 0.09;
const STICKER_SIZE = 0.84;
const STICKER_RADIUS = 0.14;
const STICKER_OFFSET = 0.495;

interface Cubie {
  group: THREE.Group;
  home: Vec3;
  /** key 是貼紙在「原位」時的法向量，例如 "0,1,0" */
  stickers: Map<string, THREE.Mesh>;
}

const vecKey = (v: readonly number[]) => v.map((n) => n + 0).join(',');

/** 圓角正方形貼紙（ShapeGeometry，面朝 +z） */
function createStickerGeometry(size: number, radius: number): THREE.ShapeGeometry {
  const h = size / 2;
  const s = new THREE.Shape();
  s.moveTo(-h + radius, -h);
  s.lineTo(h - radius, -h);
  s.quadraticCurveTo(h, -h, h, -h + radius);
  s.lineTo(h, h - radius);
  s.quadraticCurveTo(h, h, h - radius, h);
  s.lineTo(-h + radius, h);
  s.quadraticCurveTo(-h, h, -h, h - radius);
  s.lineTo(-h, -h + radius);
  s.quadraticCurveTo(-h, -h, -h + radius, -h);
  return new THREE.ShapeGeometry(s, 6);
}

/** 把座標四捨五入到 0.5 的倍數 */
function snapPosition(v: THREE.Vector3): void {
  v.set(Math.round(v.x * 2) / 2, Math.round(v.y * 2) / 2, Math.round(v.z * 2) / 2);
}

const snapMatrix = new THREE.Matrix4();
/** 把旋轉校正成精確的 90° 倍數：旋轉矩陣每個元素只會是 -1、0、1 */
function snapQuaternion(q: THREE.Quaternion): void {
  snapMatrix.makeRotationFromQuaternion(q);
  const e = snapMatrix.elements;
  for (const i of [0, 1, 2, 4, 5, 6, 8, 9, 10]) e[i] = Math.round(e[i]);
  q.setFromRotationMatrix(snapMatrix);
}

export class CubeModel {
  /** 整顆方塊的根節點 */
  readonly root = new THREE.Group();
  /** 轉動動畫時暫時掛小方塊的節點 */
  readonly pivot = new THREE.Group();
  readonly bodyMaterial = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.1 });
  readonly stickerMaterials: Record<FaceColor, THREE.MeshPhysicalMaterial>;
  private readonly bodyGeometry = new RoundedBoxGeometry(BODY_SIZE, BODY_SIZE, BODY_SIZE, 4, BODY_RADIUS);
  private readonly stickerGeometry = createStickerGeometry(STICKER_SIZE, STICKER_RADIUS);
  private cubies: Cubie[] = [];
  private _size = 0;

  constructor(size: number) {
    this.stickerMaterials = Object.fromEntries(
      FACES.map((face) => [face, new THREE.MeshPhysicalMaterial()]),
    ) as Record<FaceColor, THREE.MeshPhysicalMaterial>;
    this.root.add(this.pivot);
    this.rebuild(size);
  }

  get size(): number {
    return this._size;
  }

  /** 換尺寸：移除舊的小方塊、建立新的（幾何與材質共用，不重建） */
  rebuild(size: number): void {
    this.returnFromPivot();
    for (const cubie of this.cubies) this.root.remove(cubie.group);
    this._size = size;
    this.cubies = this.createCubies(size);
    for (const cubie of this.cubies) this.root.add(cubie.group);
    this.setState(createSolvedState(size));
  }

  /** 直接把畫面設成指定狀態：小方塊回原位，再依狀態換每張貼紙的材質 */
  setState(state: CubeState): void {
    if (state.size !== this._size) this.rebuild(state.size);
    this.returnFromPivot();
    const byHome = new Map(this.cubies.map((c) => [vecKey(c.home), c]));
    for (const cubie of this.cubies) {
      cubie.group.position.set(...cubie.home);
      cubie.group.quaternion.identity();
    }
    for (const sticker of state.stickers) {
      const mesh = byHome.get(vecKey(sticker.position))?.stickers.get(vecKey(sticker.normal));
      if (mesh) mesh.material = this.stickerMaterials[sticker.color];
    }
  }

  /** 目前位在某一層的小方塊 */
  cubiesInLayer(axis: Axis, layer: number): THREE.Object3D[] {
    return this.cubies
      .map((c) => c.group)
      .filter((g) => Math.abs(g.position[axis] - layer) < 1e-3);
  }

  /** 動畫結束時把小方塊從 pivot 放回 root，並校正位置與旋轉 */
  settle(objects: readonly THREE.Object3D[]): void {
    this.pivot.updateMatrixWorld(true);
    for (const obj of objects) {
      this.root.attach(obj);
      snapPosition(obj.position);
      snapQuaternion(obj.quaternion);
    }
    this.pivot.rotation.set(0, 0, 0);
  }

  /** 從畫面反推目前的狀態（除錯與測試用） */
  readState(): CubeState {
    this.root.updateMatrixWorld(true);
    const colorOf = new Map(FACES.map((f) => [this.stickerMaterials[f] as THREE.Material, f]));
    const stickers: Sticker[] = [];
    const normal = new THREE.Vector3();
    for (const cubie of this.cubies) {
      for (const [key, mesh] of cubie.stickers) {
        normal.fromArray(key.split(',').map(Number)).applyQuaternion(cubie.group.quaternion).round();
        const p = cubie.group.position;
        stickers.push({
          position: [p.x + 0, p.y + 0, p.z + 0],
          normal: [normal.x + 0, normal.y + 0, normal.z + 0],
          color: colorOf.get(mesh.material as THREE.Material) ?? 'U',
        });
      }
    }
    return { size: this._size, stickers };
  }

  dispose(): void {
    this.bodyGeometry.dispose();
    this.stickerGeometry.dispose();
    this.bodyMaterial.dispose();
    for (const face of FACES) this.stickerMaterials[face].dispose();
    this.cubies = [];
    this.root.clear();
  }

  private returnFromPivot(): void {
    if (this.pivot.children.length > 0) this.settle([...this.pivot.children]);
  }

  private createCubies(size: number): Cubie[] {
    const coords = layerCoords(size);
    const cubies: Cubie[] = [];
    // 內部的小方塊也要建立：轉動時層與層之間的縫會露出它們，少了會看到破洞
    for (const x of coords) for (const y of coords) for (const z of coords) {
      cubies.push(this.createCubie([x, y, z], size));
    }
    return cubies;
  }

  private createCubie(home: Vec3, size: number): Cubie {
    const group = new THREE.Group();
    group.position.set(...home);
    group.add(new THREE.Mesh(this.bodyGeometry, this.bodyMaterial));
    const stickers = new Map<string, THREE.Mesh>();
    const outer = (size - 1) / 2;
    for (const face of FACES) {
      const n = FACE_NORMALS[face];
      const along = home[0] * n[0] + home[1] * n[1] + home[2] * n[2];
      if (Math.abs(along - outer) > 1e-6) continue;
      const mesh = new THREE.Mesh(this.stickerGeometry, this.stickerMaterials[face]);
      const nv = new THREE.Vector3(...n);
      mesh.position.copy(nv).multiplyScalar(STICKER_OFFSET);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), nv);
      group.add(mesh);
      stickers.set(vecKey(n), mesh);
    }
    return { group, home, stickers };
  }
}
