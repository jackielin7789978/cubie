// 套用主題：只換材質參數、燈光強度、container 背景和 bloom，不重建幾何。
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FACES } from '../core/types';
import type { Theme } from '../themes/types';
import type { CubeRenderer, PostProcess } from './CubeRenderer';

// 第 0 階段預覽用的是 three r170（radius 0.5）。r187 的 UnrealBloomPass 模糊核加大（three.js PR #31528），
// 同樣參數光暈會明顯變強、貼紙被洗白。實際截圖比對後，用 radius 0.3、強度 ×0.7 最接近 Jackie 看過的預覽。
const BLOOM_RADIUS = 0.3;
const BLOOM_STRENGTH_SCALE = 0.7;
const BLOOM_THRESHOLD = 0.1;
const DEFAULT_BLOOM_STRENGTH = 0.3;
/** bloom 的 render target 很吃效能，開啟時 pixelRatio 上限降到 1.5 */
const BLOOM_PIXEL_RATIO_CAP = 1.5;
const NORMAL_PIXEL_RATIO_CAP = 2;
/** 自動降級：連續這麼多幀都超過門檻，就關掉 bloom */
const SLOW_FRAME_MS = 45;
const SLOW_FRAME_LIMIT = 30;

/** bloom 後製：RenderPass → UnrealBloomPass → OutputPass */
function createBloom(renderer: CubeRenderer, strength: number): PostProcess {
  const composer = new EffectComposer(renderer.renderer);
  const passes = [
    new RenderPass(renderer.scene, renderer.camera),
    new UnrealBloomPass(new THREE.Vector2(256, 256), strength * BLOOM_STRENGTH_SCALE, BLOOM_RADIUS, BLOOM_THRESHOLD),
    new OutputPass(),
  ];
  for (const pass of passes) composer.addPass(pass);
  return {
    render: () => composer.render(),
    setSize: (w, h) => composer.setSize(w, h),
    setPixelRatio: (ratio) => composer.setPixelRatio(ratio),
    dispose: () => {
      for (const pass of passes) pass.dispose();
      composer.dispose();
    },
  };
}

export class ThemeApplier {
  private theme: Theme | null = null;
  private bloomActive = false;
  /** 偵測到太慢而關掉 bloom 之後，這個 engine 之後都不再開 */
  private bloomDegraded = false;
  private slowFrames = 0;
  private readonly originalBackground: string;

  constructor(
    private readonly renderer: CubeRenderer,
    private readonly container: HTMLElement,
  ) {
    this.originalBackground = container.style.background;
  }

  apply(theme: Theme): void {
    this.theme = theme;
    this.applyMaterials(theme);
    this.applyLighting(theme);
    this.container.style.background = theme.background;
    this.applyBloom(theme);
    this.renderer.requestRender();
  }

  /** 每一幀（只在連續動畫期間）回報這幀花了多久；太慢就自動降級 */
  reportFrameTime(deltaMs: number): void {
    if (!this.bloomActive) return;
    this.slowFrames = deltaMs > SLOW_FRAME_MS ? this.slowFrames + 1 : 0;
    if (this.slowFrames < SLOW_FRAME_LIMIT) return;
    this.bloomDegraded = true;
    if (this.theme) this.applyBloom(this.theme);
  }

  isBloomActive(): boolean {
    return this.bloomActive;
  }

  dispose(): void {
    this.container.style.background = this.originalBackground;
    this.renderer.scene.background = null;
  }

  private applyMaterials(theme: Theme): void {
    const { model } = this.renderer;
    const { sticker } = theme;
    const glowing = sticker.emissiveIntensity !== undefined;
    for (const face of FACES) {
      const mat = model.stickerMaterials[face];
      const hex = theme.faceColors[face];
      // 發光貼紙的底色設成黑色，顏色完全由 emissive 決定，才不會被燈光疊到過曝
      mat.color.set(glowing ? '#000000' : hex);
      mat.emissive.set(glowing ? hex : '#000000');
      mat.emissiveIntensity = sticker.emissiveIntensity ?? 0;
      mat.roughness = sticker.roughness;
      mat.metalness = sticker.metalness;
      mat.clearcoat = sticker.clearcoat ?? 0;
      mat.clearcoatRoughness = 0.15;
      mat.needsUpdate = true;
    }
    model.bodyMaterial.color.set(theme.bodyColor);
  }

  private applyLighting(theme: Theme): void {
    const { scene, keyLight, ambientLight } = this.renderer;
    scene.environmentIntensity = theme.lighting.environment;
    keyLight.intensity = theme.lighting.key;
    ambientLight.intensity = theme.lighting.ambient;
  }

  private applyBloom(theme: Theme): void {
    const wantBloom = theme.bloom && !this.bloomDegraded;
    this.slowFrames = 0;
    this.bloomActive = wantBloom;
    // bloom 需要不透明畫布，所以把背景色畫進場景；沒有 bloom 時畫布透明，看得到 container 的 CSS 背景
    this.renderer.scene.background = wantBloom ? new THREE.Color(theme.sceneBackground ?? '#000000') : null;
    const post = wantBloom ? createBloom(this.renderer, theme.bloomStrength ?? DEFAULT_BLOOM_STRENGTH) : null;
    this.renderer.setPostProcess(post, wantBloom ? BLOOM_PIXEL_RATIO_CAP : NORMAL_PIXEL_RATIO_CAP);
  }
}
