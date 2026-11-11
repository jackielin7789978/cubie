// engine 開發頁：依網址參數建立 engine，並把 engine、core、themes 掛到 window，方便手動測試和 Playwright 呼叫。
import * as core from '../src/core';
import type { Move } from '../src/core/types';
import { createCubeEngine, MOVE_DURATION } from '../src/engine';
import type { CubeEngine, CubeEngineDebug } from '../src/engine';
import { THEMES } from '../src/themes';
import type { ThemeId } from '../src/themes';

declare global {
  interface Window {
    engine: CubeEngine & CubeEngineDebug;
    core: typeof core;
    themes: typeof THEMES;
    MOVE_DURATION: typeof MOVE_DURATION;
    __userMoves: Move[];
    /** 重新建立 engine（測試 create → dispose → create 用） */
    recreateEngine: () => CubeEngine & CubeEngineDebug;
  }
}

const params = new URLSearchParams(location.search);
const size = Number(params.get('size') ?? 3);
const themeId = (params.get('theme') ?? 'classic') as ThemeId;
const stage = document.getElementById('stage') as HTMLElement;

window.core = core;
window.themes = THEMES;
window.MOVE_DURATION = MOVE_DURATION;
window.__userMoves = [];

function create(): CubeEngine & CubeEngineDebug {
  return createCubeEngine({
    container: stage,
    size,
    theme: THEMES[themeId] ?? THEMES.classic,
    onUserMove: (move) => window.__userMoves.push(move),
  }) as CubeEngine & CubeEngineDebug;
}

window.engine = create();
window.recreateEngine = () => {
  window.engine.dispose();
  window.engine = create();
  return window.engine;
};
