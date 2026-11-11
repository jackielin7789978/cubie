import { describe, expect, it } from 'vitest';
import { applyMoves, createSolvedState, invertMoves, isSolved } from '../core';
import type { Move } from '../core/types';
import type { KeyValueStorage } from './persistence';
import { STORAGE_KEYS } from './types';
import { createGameStore } from './useGameStore';

const R: Move = { axis: 'x', layer: 1, dir: -1 };
const U: Move = { axis: 'y', layer: 1, dir: -1 };
const F: Move = { axis: 'z', layer: 1, dir: -1 };
const SCRAMBLE: Move[] = [R, U];
const [UNDO_U, UNDO_R] = invertMoves(SCRAMBLE);

function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

function setup(initial?: Record<string, string>) {
  const storage = memoryStorage(initial);
  const store = createGameStore({ storage, now: () => 0, scramble: () => [...SCRAMBLE] });
  return { store, storage, act: () => store.getState() };
}

/** 打亂並播完，進入 ready */
function scrambled(initial?: Record<string, string>) {
  const ctx = setup(initial);
  ctx.act().beginScramble();
  ctx.act().finishScramble();
  return ctx;
}

/** 在 t0 開始、t1 解完（照打亂的反向轉回去） */
function solveManually(ctx: ReturnType<typeof setup>, t0: number, t1: number) {
  ctx.act().applyUserMove(UNDO_U, t0);
  ctx.act().applyUserMove(UNDO_R, t1);
}

describe('狀態機', () => {
  it('一開始是 idle、完成狀態、3×3', () => {
    const { act } = setup();
    expect(act().status).toBe('idle');
    expect(act().size).toBe(3);
    expect(isSolved(act().cube)).toBe(true);
  });

  it('idle → scrambling → ready → solving → solved', () => {
    const ctx = setup();
    const moves = ctx.act().beginScramble();
    expect(moves).toEqual(SCRAMBLE);
    expect(ctx.act().status).toBe('scrambling');
    expect(ctx.act().cube).toEqual(applyMoves(createSolvedState(3), SCRAMBLE));

    ctx.act().finishScramble();
    expect(ctx.act().status).toBe('ready');
    expect(ctx.act().startedAt).toBeNull();

    ctx.act().applyUserMove(UNDO_U, 1000);
    expect(ctx.act().status).toBe('solving');
    expect(ctx.act().startedAt).toBe(1000);
    expect(ctx.act().moveCount).toBe(1);

    ctx.act().applyUserMove(UNDO_R, 3500);
    expect(ctx.act().status).toBe('solved');
    expect(ctx.act().finalTimeMs).toBe(2500);
    expect(ctx.act().moveCount).toBe(2);
  });

  it('打亂中和自動還原中忽略玩家轉動', () => {
    const ctx = setup();
    ctx.act().beginScramble();
    const cube = ctx.act().cube;
    ctx.act().applyUserMove(F, 10);
    expect(ctx.act().cube).toBe(cube);
    expect(ctx.act().beginScramble()).toEqual([]);

    ctx.act().finishScramble();
    ctx.act().beginAutoSolve();
    const solvedCube = ctx.act().cube;
    ctx.act().applyUserMove(F, 20);
    expect(ctx.act().cube).toBe(solvedCube);
    expect(ctx.act().undo()).toBeNull();
  });

  it('idle 時可以自由轉動：不計時、不計步', () => {
    const { act } = setup();
    act().applyUserMove(R, 100);
    expect(act().status).toBe('idle');
    expect(act().moveCount).toBe(0);
    expect(act().startedAt).toBeNull();
    expect(act().history).toEqual([R]);
  });

  it('關掉完成畫面回到 idle，成績留著、歷史清空', () => {
    const ctx = scrambled();
    solveManually(ctx, 0, 1000);
    ctx.act().dismissSolved();
    expect(ctx.act().status).toBe('idle');
    expect(ctx.act().history).toEqual([]);
    expect(ctx.act().scrambleMoves).toEqual([]);
    expect(ctx.act().finalTimeMs).toBe(1000);
    expect(ctx.act().moveCount).toBe(2);
  });

  it('完成後直接轉動：當成自由轉動', () => {
    const ctx = scrambled();
    solveManually(ctx, 0, 1000);
    ctx.act().applyUserMove(F, 2000);
    expect(ctx.act().status).toBe('idle');
    expect(ctx.act().history).toEqual([F]);
  });
});

describe('上一步', () => {
  it('復原玩家的轉動，步數照樣 +1', () => {
    const ctx = scrambled();
    const before = ctx.act().cube;
    ctx.act().applyUserMove(F, 0);
    const undoMove = ctx.act().undo(10);
    expect(undoMove).toEqual({ ...F, dir: 1 });
    expect(ctx.act().cube).toEqual(before);
    expect(ctx.act().moveCount).toBe(2);
    expect(ctx.act().history).toEqual([]);
    expect(ctx.act().status).toBe('solving');
  });

  it('不能撤銷打亂', () => {
    const ctx = scrambled();
    expect(ctx.act().undo()).toBeNull();
    expect(ctx.act().cube).toEqual(applyMoves(createSolvedState(3), SCRAMBLE));
    expect(ctx.act().moveCount).toBe(0);
  });

  it('可以連續撤銷到打亂後的狀態為止', () => {
    const ctx = scrambled();
    ctx.act().applyUserMove(F, 0);
    ctx.act().applyUserMove(R, 1);
    expect(ctx.act().undo()).not.toBeNull();
    expect(ctx.act().undo()).not.toBeNull();
    expect(ctx.act().undo()).toBeNull();
    expect(ctx.act().moveCount).toBe(4);
  });

  it('idle 時可以撤銷自由轉動，不計步', () => {
    const { act } = setup();
    act().applyUserMove(R);
    expect(act().undo()).toEqual({ ...R, dir: 1 });
    expect(isSolved(act().cube)).toBe(true);
    expect(act().moveCount).toBe(0);
    expect(act().status).toBe('idle');
  });

  it('完成後不能撤銷', () => {
    const ctx = scrambled();
    solveManually(ctx, 0, 1000);
    expect(ctx.act().undo()).toBeNull();
  });
});

describe('最佳紀錄', () => {
  it('第一次完成就是最佳紀錄，並存進 localStorage', () => {
    const ctx = scrambled();
    solveManually(ctx, 0, 5000);
    expect(ctx.act().isNewBest).toBe(true);
    expect(ctx.act().bestRecords[3]).toEqual({ timeMs: 5000, moves: 2 });
    expect(JSON.parse(ctx.storage.data.get(STORAGE_KEYS.best)!)[3]).toEqual({ timeMs: 5000, moves: 2 });
  });

  const withBest = (timeMs: number, moves: number) => ({ [STORAGE_KEYS.best]: JSON.stringify({ 3: { timeMs, moves } }) });

  it('比舊紀錄慢就不更新', () => {
    const ctx = scrambled(withBest(1000, 10));
    solveManually(ctx, 0, 5000);
    expect(ctx.act().isNewBest).toBe(false);
    expect(ctx.act().bestRecords[3]).toEqual({ timeMs: 1000, moves: 10 });
  });

  it('比舊紀錄快就更新', () => {
    const ctx = scrambled(withBest(9000, 10));
    solveManually(ctx, 0, 5000);
    expect(ctx.act().isNewBest).toBe(true);
    expect(ctx.act().bestRecords[3]).toEqual({ timeMs: 5000, moves: 2 });
  });

  it('時間一樣時步數比較少才更新', () => {
    const fewer = scrambled(withBest(5000, 3));
    solveManually(fewer, 0, 5000);
    expect(fewer.act().isNewBest).toBe(true);

    const same = scrambled(withBest(5000, 2));
    solveManually(same, 0, 5000);
    expect(same.act().isNewBest).toBe(false);
  });

  it('各尺寸的紀錄分開存', () => {
    const ctx = setup();
    ctx.act().setSize(2);
    ctx.act().beginScramble();
    ctx.act().finishScramble();
    // 2×2 的外層座標是 0.5，所以這裡用 2×2 自己的轉動
    const r2: Move = { axis: 'x', layer: 0.5, dir: -1 };
    ctx.store.setState({ cube: applyMoves(createSolvedState(2), [r2]) });
    ctx.act().applyUserMove({ ...r2, dir: 1 }, 0);
    expect(ctx.act().status).toBe('solved');
    expect(ctx.act().bestRecords[2]).not.toBeNull();
    expect(ctx.act().bestRecords[3]).toBeNull();
  });

  it('localStorage 裡格式不對的資料會被忽略', () => {
    const ctx = setup({
      [STORAGE_KEYS.best]: JSON.stringify({ 3: { timeMs: 'fast' }, 2: { timeMs: 100, moves: 5 } }),
      [STORAGE_KEYS.size]: '"huge"',
      [STORAGE_KEYS.theme]: '{not json',
    });
    expect(ctx.act().bestRecords).toEqual({ 2: { timeMs: 100, moves: 5 }, 3: null, 4: null });
    expect(ctx.act().size).toBe(3);
    expect(ctx.act().themeId).toBe('classic');
  });

  it('localStorage 讀寫丟錯誤時（Safari 無痕模式）照樣可以玩', () => {
    const throwing: KeyValueStorage = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    const store = createGameStore({ storage: throwing, now: () => 0, scramble: () => [R] });
    expect(store.getState().size).toBe(3);
    store.getState().setTheme('neon');
    expect(store.getState().themeId).toBe('neon');
  });
});

describe('自動還原', () => {
  it('沒給解法時反轉歷史，邏輯狀態直接變成解完', () => {
    const ctx = scrambled();
    ctx.act().applyUserMove(F, 0);
    const moves = ctx.act().beginAutoSolve();
    expect(moves).toEqual(invertMoves([...SCRAMBLE, F]));
    expect(ctx.act().autoSolving).toBe(true);
    expect(ctx.act().usedAutoSolve).toBe(true);
    expect(isSolved(ctx.act().cube)).toBe(true);
  });

  it('外部解法能解完就用它，解不完就退回反轉歷史', () => {
    const good = scrambled();
    const external = invertMoves(SCRAMBLE);
    expect(good.act().beginAutoSolve(external)).toEqual(external);

    const bad = scrambled();
    expect(bad.act().beginAutoSolve([F])).toEqual(invertMoves(SCRAMBLE));
  });

  it('完成後跳成 solved，但不列入最佳紀錄', () => {
    const ctx = scrambled();
    ctx.act().applyUserMove(F, 1000);
    ctx.act().beginAutoSolve();
    ctx.act().finishAutoSolve(4000);
    expect(ctx.act().status).toBe('solved');
    expect(ctx.act().autoSolving).toBe(false);
    expect(ctx.act().finalTimeMs).toBe(3000);
    expect(ctx.act().isNewBest).toBe(false);
    expect(ctx.act().bestRecords[3]).toBeNull();
  });

  it('還沒開始計時就自動還原：時間是 null', () => {
    const ctx = scrambled();
    ctx.act().beginAutoSolve();
    ctx.act().finishAutoSolve(4000);
    expect(ctx.act().status).toBe('solved');
    expect(ctx.act().finalTimeMs).toBeNull();
  });

  it('已經是完成狀態時不能自動還原', () => {
    const { act } = setup();
    expect(act().beginAutoSolve()).toEqual([]);
    expect(act().autoSolving).toBe(false);
  });

  it('沒在自動還原時 finishAutoSolve 不做事', () => {
    const ctx = scrambled();
    ctx.act().finishAutoSolve();
    expect(ctx.act().status).toBe('ready');
  });
});

describe('尺寸和主題', () => {
  it('換尺寸：重設成完成狀態、回到 idle，並存起來', () => {
    const ctx = scrambled();
    ctx.act().applyUserMove(F, 0);
    ctx.act().setSize(4);
    expect(ctx.act().size).toBe(4);
    expect(ctx.act().status).toBe('idle');
    expect(ctx.act().cube).toEqual(createSolvedState(4));
    expect(ctx.act().moveCount).toBe(0);
    expect(ctx.act().history).toEqual([]);
    expect(ctx.storage.data.get(STORAGE_KEYS.size)).toBe('4');
  });

  it('打亂中換尺寸，之後的 finishScramble 不會把狀態改成 ready', () => {
    const ctx = setup();
    ctx.act().beginScramble();
    ctx.act().setSize(2);
    ctx.act().finishScramble();
    expect(ctx.act().status).toBe('idle');
  });

  it('主題和尺寸在重新啟動後讀回來', () => {
    const first = setup();
    first.act().setTheme('brand');
    first.act().setSize(2);
    const initial = Object.fromEntries(first.storage.data);
    const second = setup(initial);
    expect(second.act().themeId).toBe('brand');
    expect(second.act().size).toBe(2);
    expect(second.act().cube).toEqual(createSolvedState(2));
  });
});
