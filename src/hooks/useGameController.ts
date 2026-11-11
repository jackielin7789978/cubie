import { useEffect } from 'react';
import { useGameStore } from '../store/useGameStore';
import { useUiStore } from '../store/useUiStore';
import { GameController } from './gameController';
import type { SolutionProvider } from './gameController';

/** 整個 App 只有一個控制器，所以直接在模組裡建好 */
export const gameController = new GameController(useGameStore, useUiStore);

/**
 * 自訂 hook：名字以 use 開頭、裡面可以使用其他 hook 的函式，用來把一段元件邏輯包起來重複使用。
 * 這裡回傳共用的控制器，並把外部解法器（例如 Kociemba）裝上去。
 */
export function useGameController(solutionProvider?: SolutionProvider | null): GameController {
  // useEffect：畫面畫完之後才執行的「副作用」（改外部的東西，例如這裡設定控制器）。
  // 第二個參數 [solutionProvider] 表示只有它變了才重新執行；回傳的函式是 cleanup，
  // 下次重新執行前或元件移除時會先呼叫，用來把設定還原。
  useEffect(() => {
    gameController.setSolutionProvider(solutionProvider ?? null);
    return () => gameController.setSolutionProvider(null);
  }, [solutionProvider]);
  return gameController;
}
