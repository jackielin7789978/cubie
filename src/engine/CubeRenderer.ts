// WebGL 渲染：renderer、場景、相機、燈光、環境貼圖、尺寸同步，以及「需要時才畫」的 render loop。
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CameraRig } from './CameraRig';
import { CubeModel } from './CubeModel';
import { faceHitFromPoint } from './gesture';
import type { FaceHit, ScreenPoint } from './gesture';

/** 後製（bloom）介面：ThemeApplier 提供，renderer 只負責呼叫 */
export interface PostProcess {
  render(): void;
  setSize(width: number, height: number): void;
  setPixelRatio(ratio: number): void;
  dispose(): void;
}

/** 每一幀要做的事。回傳 true 代表還需要下一幀。 */
export type FrameHandler = (now: number) => boolean;

const MAX_PIXEL_RATIO = 2;

export class CubeRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
  readonly ambientLight = new THREE.AmbientLight(0xffffff, 1.1);
  readonly cameraRig = new CameraRig(this.keyLight);
  readonly model: CubeModel;
  private readonly environment: THREE.Texture;
  private readonly resizeObserver: ResizeObserver;
  private readonly raycaster = new THREE.Raycaster();
  private postProcess: PostProcess | null = null;
  private pixelRatioCap = MAX_PIXEL_RATIO;
  private frameId: number | null = null;
  private frameHandler: FrameHandler | null = null;
  private width = 0;
  private height = 0;

  constructor(
    private readonly container: HTMLElement,
    size: number,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.toneMapping = THREE.NoToneMapping; // ACES 會把貼紙顏色洗灰（DECISIONS.md）
    this.renderer.setPixelRatio(this.currentPixelRatio());
    this.styleCanvas(this.renderer.domElement);
    container.appendChild(this.renderer.domElement);

    this.environment = this.createEnvironment();
    this.scene.environment = this.environment;
    this.scene.add(this.cameraRig.rig, this.ambientLight);
    this.model = new CubeModel(size);
    this.scene.add(this.model.root);

    this.resizeObserver = new ResizeObserver(() => this.syncSize());
    this.resizeObserver.observe(container);
    this.syncSize();
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  get camera(): THREE.PerspectiveCamera {
    return this.cameraRig.camera;
  }

  setFrameHandler(handler: FrameHandler): void {
    this.frameHandler = handler;
  }

  /** 排一幀來畫。同一幀內呼叫多次只會畫一次；沒人呼叫時不會跑 loop。 */
  requestRender(): void {
    if (this.frameId === null) this.frameId = requestAnimationFrame(this.frame);
  }

  /** 換後製（null = 不用後製，直接畫到透明畫布） */
  setPostProcess(post: PostProcess | null, pixelRatioCap: number): void {
    this.postProcess?.dispose();
    this.postProcess = post;
    this.pixelRatioCap = pixelRatioCap;
    this.renderer.setPixelRatio(this.currentPixelRatio());
    this.applySize();
  }

  /** 換尺寸後重新算相機距離 */
  refit(): void {
    this.applySize();
  }

  /** 由螢幕座標找出按到方塊的哪一面；沒按到回傳 null */
  pickFace(clientX: number, clientY: number): FaceHit | null {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObject(this.model.root, true)[0];
    if (!hit) return null;
    const normal = hit.face?.normal.clone().transformDirection(hit.object.matrixWorld);
    return faceHitFromPoint(hit.point, this.model.size, normal);
  }

  /** 世界座標 → 螢幕座標（像素，和 PointerEvent 的 clientX/Y 同一套） */
  projectToScreen = (v: THREE.Vector3): ScreenPoint => {
    const rect = this.canvas.getBoundingClientRect();
    const p = v.clone().project(this.camera);
    return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height };
  };

  /** 立刻畫一張 */
  draw(): void {
    if (this.width === 0 || this.height === 0) return;
    if (this.postProcess) this.postProcess.render();
    else this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    if (this.frameId !== null) cancelAnimationFrame(this.frameId);
    this.frameId = null;
    this.frameHandler = null;
    this.resizeObserver.disconnect();
    this.postProcess?.dispose();
    this.postProcess = null;
    this.model.dispose();
    this.environment.dispose();
    this.scene.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }

  private frame = (now: number): void => {
    this.frameId = null;
    const needsMore = this.frameHandler?.(now) ?? false;
    this.draw();
    if (needsMore) this.requestRender();
  };

  private currentPixelRatio(): number {
    return Math.min(window.devicePixelRatio || 1, this.pixelRatioCap);
  }

  private styleCanvas(canvas: HTMLCanvasElement): void {
    // touch-action: none 讓手機拖曳時頁面不跟著捲動、也不會觸發縮放
    Object.assign(canvas.style, {
      display: 'block',
      width: '100%',
      height: '100%',
      touchAction: 'none',
      userSelect: 'none',
      webkitUserSelect: 'none',
      webkitTapHighlightColor: 'transparent',
      outline: 'none',
    });
  }

  private createEnvironment(): THREE.Texture {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    const texture = pmrem.fromScene(room, 0.04).texture;
    room.dispose();
    pmrem.dispose();
    return texture;
  }

  /** ResizeObserver 回呼：container 大小變了就同步並立刻重畫（避免閃一下空白） */
  private syncSize(): void {
    this.width = this.container.clientWidth;
    this.height = this.container.clientHeight;
    this.applySize();
  }

  private applySize(): void {
    if (this.width === 0 || this.height === 0) return;
    this.renderer.setSize(this.width, this.height, false);
    this.postProcess?.setPixelRatio(this.currentPixelRatio());
    this.postProcess?.setSize(this.width, this.height);
    this.cameraRig.fit(this.model.size, this.width / this.height);
    this.draw();
  }
}
