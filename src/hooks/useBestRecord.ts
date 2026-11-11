import { useGameStore } from '../store/useGameStore';
import type { BestRecord } from '../store/types';

/** 目前尺寸的最佳紀錄（讀寫 localStorage 由 store 負責） */
export function useBestRecord(): BestRecord | null {
  return useGameStore((s) => s.bestRecords[s.size]);
}
