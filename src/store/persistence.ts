import type { CubeSize } from '../core/types';
import { DEFAULT_THEME_ID, THEMES } from '../themes';
import type { ThemeId } from '../themes/types';
import { STORAGE_KEYS } from './types';
import type { BestRecord } from './types';

/** 只用到 localStorage 的這兩個方法；測試時可以換成假的 */
export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>;

export const CUBE_SIZES: readonly CubeSize[] = [2, 3, 4];
export const DEFAULT_SIZE: CubeSize = 3;

export interface Preferences {
  size: CubeSize;
  themeId: ThemeId;
  bestRecords: Record<CubeSize, BestRecord | null>;
}

export function emptyBestRecords(): Record<CubeSize, BestRecord | null> {
  return { 2: null, 3: null, 4: null };
}

/** 取得瀏覽器的 localStorage。Safari 無痕模式或被封鎖時可能直接丟錯誤，這時回傳 null。 */
export function getBrowserStorage(): KeyValueStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function readJson(storage: KeyValueStorage | null, key: string): unknown {
  try {
    const raw = storage?.getItem(key);
    return raw == null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export function writeJson(storage: KeyValueStorage | null, key: string, value: unknown): void {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    // 寫不進去（無痕模式、容量滿）就算了，遊戲照樣可以玩
  }
}

export function isCubeSize(value: unknown): value is CubeSize {
  return CUBE_SIZES.includes(value as CubeSize);
}

function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && Object.hasOwn(THEMES, value);
}

function isBestRecord(value: unknown): value is BestRecord {
  if (typeof value !== 'object' || value === null) return false;
  const { timeMs, moves } = value as Record<string, unknown>;
  return (
    typeof timeMs === 'number' && Number.isFinite(timeMs) && timeMs >= 0 &&
    typeof moves === 'number' && Number.isInteger(moves) && moves >= 0
  );
}

function parseBestRecords(value: unknown): Record<CubeSize, BestRecord | null> {
  const records = emptyBestRecords();
  if (typeof value !== 'object' || value === null) return records;
  for (const size of CUBE_SIZES) {
    const entry = (value as Record<string, unknown>)[size];
    if (isBestRecord(entry)) records[size] = { timeMs: entry.timeMs, moves: entry.moves };
  }
  return records;
}

/** 啟動時讀回上次的尺寸、主題和最佳紀錄；格式不對的資料直接忽略 */
export function loadPreferences(storage: KeyValueStorage | null): Preferences {
  const size = readJson(storage, STORAGE_KEYS.size);
  const themeId = readJson(storage, STORAGE_KEYS.theme);
  return {
    size: isCubeSize(size) ? size : DEFAULT_SIZE,
    themeId: isThemeId(themeId) ? themeId : DEFAULT_THEME_ID,
    bestRecords: parseBestRecords(readJson(storage, STORAGE_KEYS.best)),
  };
}
