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

/** 開始遊戲並播完打亂動畫，進入 ready */
function scrambled(initial?: Record<string, string>) {
  const ctx = setup(initial);
  ctx.act().startGame();
  ctx.act().finishScramble();
  return ctx;
}

/** 假的 Kociemba 解：把打亂和玩家轉動倒過來（一定能把方塊解完） */
function solutionFor(ctx: ReturnType<typeof setup>): Move[] {
  const { scrambleMoves, history } = ctx.act();
  return invertMoves([...scrambleMoves, ...history]);
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

  it('開始遊戲 → 打亂 → ready → solving → solved', () => {
    const ctx = setup();
    const moves = ctx.act().startGame();
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

  it('一局進行中不能重新開始（中途不能重新打亂）', () => {
    const ctx = setup();
    ctx.act().startGame();
    expect(ctx.act().startGame()).toEqual([]);
    ctx.act().finishScramble();
    expect(ctx.act().startGame()).toEqual([]);
    ctx.act().applyUserMove(F, 0);
    expect(ctx.act().startGame()).toEqual([]);
    expect(ctx.act().status).toBe('solving');
  });

  it('完成後可以直接開始下一局（再玩一次）', () => {
    const ctx = scrambled();
    solveManually(ctx, 0, 1000);
    expect(ctx.act().startGame()).toEqual(SCRAMBLE);
    expect(ctx.act().status).toBe('scrambling');
    expect(ctx.act().moveCount).toBe(0);
    expect(ctx.act().finalTimeMs).toBeNull();
  });

  it('打亂中和 Kociemba 還原動畫中忽略玩家轉動', () => {
    const ctx = setup();
    ctx.act().startGame();
    const cube = ctx.act().cube;
    ctx.act().applyUserMove(F, 10);
    expect(ctx.act().cube).toBe(cube);

    ctx.act().finishScramble();
    ctx.act().beginKociembaSolve(solutionFor(ctx));
    const solvedCube = ctx.act().cube;
    ctx.act().applyUserMove(F, 20);
    expect(ctx.act().cube).toBe(solvedCube);
    expect(ctx.act().undo()).toBeNull();
  });

  it('idle 時可以自由轉動：不計時、不計步、不留歷史', () => {
    const { act } = setup();
    act().applyUserMove(R, 100);
    act().applyUserMove(U, 200);
    expect(act().status).toBe('idle');
    expect(act().moveCount).toBe(0);
    expect(act().startedAt).toBeNull();
    expect(act().history).toEqual([]);
    expect(act().cube).toEqual(applyMoves(createSolvedState(3), [R, U]));
  });

  it('idle 自由轉動後開始遊戲：從完成狀態重新打亂', () => {
    const { act } = setup();
    act().applyUserMove(R, 100);
    act().startGame();
    expect(act().cube).toEqual(applyMoves(createSolvedState(3), SCRAMBLE));
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

  it('解完（完成畫面還沒關）時忽略轉動，慶祝畫面不會被吃掉', () => {
    const ctx = scrambled();
    solveManually(ctx, 0, 1000);
    const solvedCube = ctx.act().cube;
    ctx.act().applyUserMove(F, 2000);
    expect(ctx.act().status).toBe('solved');
    expect(ctx.act().cube).toBe(solvedCube);
    expect(ctx.act().moveCount).toBe(2);
    expect(ctx.act().finalTimeMs).toBe(1000);
  });

  it('關掉完成畫面回到 idle 之後才能自由轉動', () => {
    const ctx = scrambled();
    solveManually(ctx, 0, 1000);
    ctx.act().dismissSolved();
    ctx.act().applyUserMove(F, 2000);
    expect(ctx.act().status).toBe('idle');
    expect(isSolved(ctx.act().cube)).toBe(false);
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

  it('待機時沒有上一步', () => {
    const { act } = setup();
    act().applyUserMove(R);
    expect(act().undo()).toBeNull();
    expect(act().cube).toEqual(applyMoves(createSolvedState(3), [R]));
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
    ctx.act().startGame();
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

describe('放棄：直接重設（2×2、4×4，或 3×3 解法器失敗）', () => {
  it('立刻回到 idle：方塊完成、時間步數歸零、歷史和打亂清空、不寫紀錄', () => {
    const ctx = scrambled();
    ctx.act().applyUserMove(F, 1000);
    ctx.act().applyUserMove(R, 1500);
    ctx.act().abandonGame();
    const state = ctx.act();
    expect(state.status).toBe('idle');
    expect(isSolved(state.cube)).toBe(true);
    expect(state.moveCount).toBe(0);
    expect(state.startedAt).toBeNull();
    expect(state.finalTimeMs).toBeNull();
    expect(state.history).toEqual([]);
    expect(state.scrambleMoves).toEqual([]);
    expect(state.kociembaSteps).toBeNull();
    expect(state.bestRecords[3]).toBeNull();
    expect(ctx.storage.data.has(STORAGE_KEYS.best)).toBe(false);
  });

  it('2×2、4×4 都可以直接放棄', () => {
    for (const size of [2, 4] as const) {
      const ctx = setup();
      ctx.act().setSize(size);
      ctx.act().startGame();
      ctx.act().finishScramble();
      ctx.act().abandonGame();
      expect(ctx.act().status).toBe('idle');
      expect(ctx.act().size).toBe(size);
      expect(ctx.act().cube).toEqual(createSolvedState(size));
    }
  });

  it('放棄後可以換尺寸、開始新的一局', () => {
    const ctx = scrambled();
    ctx.act().abandonGame();
    ctx.act().setSize(2);
    expect(ctx.act().size).toBe(2);
    expect(ctx.act().startGame()).toEqual(SCRAMBLE);
  });

  it('待機、打亂中、完成後、Kociemba 還原中都不能直接放棄', () => {
    const idle = setup();
    idle.act().applyUserMove(R);
    idle.act().abandonGame();
    expect(idle.act().cube).toEqual(applyMoves(createSolvedState(3), [R]));

    const scrambling = setup();
    scrambling.act().startGame();
    scrambling.act().abandonGame();
    expect(scrambling.act().status).toBe('scrambling');

    const solved = scrambled();
    solveManually(solved, 0, 1000);
    solved.act().abandonGame();
    expect(solved.act().status).toBe('solved');

    const solving = scrambled();
    solving.act().beginKociembaSolve(solutionFor(solving));
    solving.act().abandonGame();
    expect(solving.act().autoSolving).toBe(true);
  });

  it('不影響已經有的最佳紀錄', () => {
    const ctx = scrambled({ [STORAGE_KEYS.best]: JSON.stringify({ 3: { timeMs: 9000, moves: 30 } }) });
    ctx.act().applyUserMove(F, 0);
    ctx.act().abandonGame();
    expect(ctx.act().bestRecords[3]).toEqual({ timeMs: 9000, moves: 30 });
  });
});

describe('放棄：3×3 交給 Kociemba', () => {
  it('接受能解完的解：邏輯狀態直接變成解完、計時停下、記下步數', () => {
    const ctx = scrambled();
    ctx.act().applyUserMove(F, 1000);
    const solution = solutionFor(ctx);
    expect(ctx.act().beginKociembaSolve(solution, 4000)).toEqual(solution);
    const state = ctx.act();
    expect(state.autoSolving).toBe(true);
    expect(state.kociembaSteps).toBe(3);
    expect(isSolved(state.cube)).toBe(true);
    expect(state.history).toEqual([]);
    expect(state.startedAt).toBeNull();
    expect(state.finalTimeMs).toBe(3000);
    expect(state.status).toBe('solving');
  });

  it('步數用標準記號算：180° 算一步', () => {
    const ctx = scrambled();
    const solution = [...solutionFor(ctx), F, F, F, F];
    ctx.act().beginKociembaSolve(solution);
    expect(ctx.act().kociembaSteps).toBe(4);
  });

  it('解不完或空的解：拒絕（回傳空陣列，狀態不變）', () => {
    const ctx = scrambled();
    const before = ctx.act().cube;
    expect(ctx.act().beginKociembaSolve([F])).toEqual([]);
    expect(ctx.act().beginKociembaSolve([])).toEqual([]);
    expect(ctx.act().autoSolving).toBe(false);
    expect(ctx.act().cube).toBe(before);
  });

  it('動畫播完變成 solved，但不列入最佳紀錄、不算新紀錄', () => {
    const ctx = scrambled();
    ctx.act().applyUserMove(F, 1000);
    ctx.act().beginKociembaSolve(solutionFor(ctx), 4000);
    ctx.act().finishKociembaSolve();
    const state = ctx.act();
    expect(state.status).toBe('solved');
    expect(state.autoSolving).toBe(false);
    expect(state.isNewBest).toBe(false);
    expect(state.bestRecords[3]).toBeNull();
    expect(ctx.storage.data.has(STORAGE_KEYS.best)).toBe(false);
    expect(state.kociembaSteps).toBe(3);
  });

  it('關掉完成畫面：回到 idle，時間、步數歸零，這一局整個清空', () => {
    const ctx = scrambled();
    ctx.act().applyUserMove(F, 1000);
    ctx.act().beginKociembaSolve(solutionFor(ctx), 4000);
    ctx.act().finishKociembaSolve();
    ctx.act().dismissSolved();
    const state = ctx.act();
    expect(state.status).toBe('idle');
    expect(state.moveCount).toBe(0);
    expect(state.finalTimeMs).toBeNull();
    expect(state.history).toEqual([]);
    expect(state.scrambleMoves).toEqual([]);
    expect(state.kociembaSteps).toBeNull();
    expect(isSolved(state.cube)).toBe(true);
  });

  it('關掉完成畫面：保留 Kociemba 解完的方塊（整顆轉了方向也一樣），邏輯和畫面才一致', () => {
    const ctx = scrambled();
    // 轉一次中間層：Kociemba 會把它解成整顆轉了方向的完成狀態
    const slice: Move = { axis: 'x', layer: 0, dir: 1 };
    ctx.act().applyUserMove(slice, 1000);
    const solution = solutionFor(ctx);
    ctx.act().beginKociembaSolve(solution, 4000);
    const solvedCube = ctx.act().cube;
    ctx.act().finishKociembaSolve();
    ctx.act().dismissSolved();
    expect(ctx.act().cube).toBe(solvedCube);
    expect(isSolved(ctx.act().cube)).toBe(true);
  });

  it('確認放棄時先停表；之後 Kociemba 開始播動畫也維持同一個時間', () => {
    const ctx = scrambled();
    ctx.act().applyUserMove(F, 1000);
    ctx.act().stopClock(2500);
    expect(ctx.act().startedAt).toBeNull();
    expect(ctx.act().finalTimeMs).toBe(1500);
    ctx.act().beginKociembaSolve(solutionFor(ctx), 9000);
    expect(ctx.act().finalTimeMs).toBe(1500);
  });

  it('還沒轉第一步就放棄：停表後時間是 null', () => {
    const ctx = scrambled();
    ctx.act().stopClock(2500);
    expect(ctx.act().finalTimeMs).toBeNull();
  });

  it('待機時 stopClock 不做事', () => {
    const ctx = setup();
    ctx.act().stopClock(2500);
    expect(ctx.act().status).toBe('idle');
    expect(ctx.act().finalTimeMs).toBeNull();
  });

  it('完成畫面直接再玩一次：新的一局清掉 Kociemba 的紀錄，自己解完照樣算新紀錄', () => {
    const ctx = scrambled();
    ctx.act().beginKociembaSolve(solutionFor(ctx));
    ctx.act().finishKociembaSolve();
    expect(ctx.act().startGame()).toEqual(SCRAMBLE);
    expect(ctx.act().kociembaSteps).toBeNull();
    ctx.act().finishScramble();
    solveManually(ctx, 0, 1000);
    expect(ctx.act().isNewBest).toBe(true);
  });

  it('待機、打亂中、完成後、已經在還原時都不能交給 Kociemba', () => {
    const idle = setup();
    expect(idle.act().beginKociembaSolve([R])).toEqual([]);

    const scrambling = setup();
    scrambling.act().startGame();
    expect(scrambling.act().beginKociembaSolve(invertMoves(SCRAMBLE))).toEqual([]);

    const solved = scrambled();
    solveManually(solved, 0, 1000);
    expect(solved.act().beginKociembaSolve([R])).toEqual([]);

    const twice = scrambled();
    const solution = solutionFor(twice);
    twice.act().beginKociembaSolve(solution);
    expect(twice.act().beginKociembaSolve(solution)).toEqual([]);
  });

  it('沒在播還原動畫時 finishKociembaSolve 不做事', () => {
    const ctx = scrambled();
    ctx.act().finishKociembaSolve();
    expect(ctx.act().status).toBe('ready');
  });

  it('玩家自己解完時 kociembaSteps 是 null', () => {
    const ctx = scrambled();
    solveManually(ctx, 0, 1000);
    expect(ctx.act().kociembaSteps).toBeNull();
  });
});

describe('尺寸和主題', () => {
  it('待機時換尺寸：重設成完成狀態，並存起來', () => {
    const ctx = setup();
    ctx.act().applyUserMove(F, 0);
    ctx.act().setSize(4);
    expect(ctx.act().size).toBe(4);
    expect(ctx.act().status).toBe('idle');
    expect(ctx.act().cube).toEqual(createSolvedState(4));
    expect(ctx.storage.data.get(STORAGE_KEYS.size)).toBe('4');
  });

  it('一局進行中（打亂中、ready、solving、Kociemba 還原中）不能換尺寸', () => {
    const ctx = setup();
    ctx.act().startGame();
    ctx.act().setSize(2);
    expect(ctx.act().size).toBe(3);
    ctx.act().finishScramble();
    ctx.act().setSize(2);
    expect(ctx.act().size).toBe(3);
    ctx.act().applyUserMove(F, 0);
    ctx.act().setSize(4);
    expect(ctx.act().size).toBe(3);
    expect(ctx.act().status).toBe('solving');
    expect(ctx.act().moveCount).toBe(1);
    ctx.act().beginKociembaSolve(solutionFor(ctx));
    ctx.act().setSize(4);
    expect(ctx.act().size).toBe(3);
    expect(ctx.storage.data.has(STORAGE_KEYS.size)).toBe(false);
  });

  it('完成後可以換尺寸', () => {
    const ctx = scrambled();
    solveManually(ctx, 0, 1000);
    ctx.act().setSize(2);
    expect(ctx.act().size).toBe(2);
    expect(ctx.act().status).toBe('idle');
  });

  it('一局進行中仍然可以換主題', () => {
    const ctx = scrambled();
    ctx.act().applyUserMove(F, 0);
    ctx.act().setTheme('neon');
    expect(ctx.act().themeId).toBe('neon');
    expect(ctx.act().status).toBe('solving');
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
