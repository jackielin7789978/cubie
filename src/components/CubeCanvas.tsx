import { useEffect, useRef, useState } from 'react';
import { createCubeEngine } from '../engine';
import type { CreateCubeEngine, CubeEngine } from '../engine/types';
import type { GameController } from '../hooks/gameController';
import { useGameStore } from '../store/useGameStore';
import { THEMES } from '../themes';

/**
 * 開發模式下網址帶 ?mockEngine 時改用開發用的假 engine。
 * import.meta.env.DEV 在正式版建置時會被換成 false，整段（連同動態 import）被移除，不會打包 mock。
 */
async function loadEngineFactory(): Promise<CreateCubeEngine> {
  if (!import.meta.env.DEV || !new URLSearchParams(window.location.search).has('mockEngine')) return createCubeEngine;
  const { createMockEngine } = await import('./__dev__/mockEngine');
  return createMockEngine;
}

/** 建立 3D engine 並掛進畫面；元件移除時釋放 */
export function CubeCanvas({ controller }: { controller: GameController }) {
  // useRef：拿到實際的 DOM 元素（這裡是放 canvas 的 div），engine 需要它才能把 canvas 塞進去。
  // ref 的值改變不會讓畫面重畫，適合存這種「React 以外」的東西。
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const size = useGameStore((s) => s.size);

  // 這個 effect 只在元件第一次出現時執行（依賴陣列是空的）。
  // 開發模式的 React StrictMode 會故意「掛上 → 卸載 → 再掛上」一次來抓錯，
  // 所以 cleanup 一定要把 engine 完整釋放，第二次才會乾淨地重新建立，不會有兩個 canvas。
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let engine: CubeEngine | null = null;
    let cancelled = false;

    loadEngineFactory()
      .then((create) => {
        if (cancelled) return;
        const { size, themeId } = useGameStore.getState();
        // 鍵盤轉動只給自動化測試用（網址帶 ?testKeys 才開），一般玩家用拖曳操作
        const keyboard = new URLSearchParams(window.location.search).has('testKeys');
        engine = create({ container, size, theme: THEMES[themeId], onUserMove: controller.handleUserMove, keyboard });
        controller.attachEngine(engine);
      })
      .catch((error: unknown) => {
        console.error('無法建立 3D 方塊', error);
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (!engine) return;
      controller.detachEngine(engine);
      engine.dispose();
    };
  }, [controller]);

  return (
    <div className="stage">
      <div
        ref={containerRef}
        className="cube-canvas"
        data-testid="cube-canvas"
        role="img"
        aria-label={`${size}×${size} 魔術方塊，拖曳方塊轉動一層，拖曳空白處旋轉視角`}
      />
      {failed && <p className="stage-error">這個瀏覽器無法顯示 3D 方塊</p>}
    </div>
  );
}
