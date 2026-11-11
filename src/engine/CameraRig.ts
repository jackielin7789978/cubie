// 相機支架：用「水平角 yaw ＋ 仰角 pitch」繞著原點轉，相機永遠看向方塊中心。
// 主光掛在支架上跟著相機轉，所以從任何角度看，方塊的明暗都和預設視角一樣。
import * as THREE from 'three';

const FOV = 32;
/** 預設視角：和第 0 階段預覽相同的相機方向 (5.2, 4.6, 6.4) */
const DEFAULT_DIRECTION = new THREE.Vector3(5.2, 4.6, 6.4);
/** 預覽裡主光的世界座標（在預設視角下） */
const KEY_LIGHT_POSITION = new THREE.Vector3(4, 7, 6);
const MAX_PITCH = THREE.MathUtils.degToRad(80);
/** 四周留白：方塊外接球外再多留的比例 */
const FIT_MARGIN = 1.1;

const DEFAULT_YAW = Math.atan2(DEFAULT_DIRECTION.x, DEFAULT_DIRECTION.z);
const DEFAULT_PITCH = Math.asin(DEFAULT_DIRECTION.y / DEFAULT_DIRECTION.length());

export class CameraRig {
  readonly rig = new THREE.Group();
  readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
  private yaw = DEFAULT_YAW;
  private pitch = DEFAULT_PITCH;

  constructor(keyLight: THREE.Object3D) {
    this.rig.add(this.camera);
    this.rig.add(keyLight);
    // 把主光放在「支架座標」中，讓它在預設視角時剛好位於預覽的位置
    this.applyRotation(DEFAULT_YAW, DEFAULT_PITCH);
    keyLight.position.copy(KEY_LIGHT_POSITION).applyQuaternion(this.rig.quaternion.clone().invert());
  }

  /** 拖曳空白處時呼叫，dYaw / dPitch 單位是弧度 */
  rotateBy(dYaw: number, dPitch: number): void {
    this.yaw += dYaw;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dPitch, -MAX_PITCH, MAX_PITCH);
    this.applyRotation(this.yaw, this.pitch);
  }

  reset(): void {
    this.yaw = DEFAULT_YAW;
    this.pitch = DEFAULT_PITCH;
    this.applyRotation(this.yaw, this.pitch);
  }

  /**
   * 依方塊尺寸和畫面長寬比調整相機距離：讓方塊的外接球剛好塞進視野（取直向、橫向較窄的那個），
   * 所以方塊轉到任何角度都不會出框。
   */
  fit(size: number, aspect: number): void {
    const radius = (size * Math.sqrt(3)) / 2;
    const halfV = THREE.MathUtils.degToRad(FOV / 2);
    const halfH = Math.atan(Math.tan(halfV) * aspect);
    const distance = (radius / Math.sin(Math.min(halfV, halfH))) * FIT_MARGIN;
    this.camera.aspect = aspect;
    this.camera.position.set(0, 0, distance);
    this.camera.near = Math.max(0.1, distance - radius * 2);
    this.camera.far = distance + radius * 2;
    this.camera.updateProjectionMatrix();
    this.rig.updateMatrixWorld(true);
  }

  private applyRotation(yaw: number, pitch: number): void {
    // YXZ 順序：先抬頭（x 軸）再轉水平角（y 軸），相機在支架座標的 +z 上看向原點
    this.rig.rotation.set(-pitch, yaw, 0, 'YXZ');
    this.rig.updateMatrixWorld(true);
  }
}
