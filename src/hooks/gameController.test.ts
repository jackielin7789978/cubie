import { describe, expect, it, vi } from 'vitest';
import { invertMoves } from '../core';
import type { CubeState, Move } from '../core/types';
import type { CubeEngine } from '../engine/types';
import { createGameStore } from '../store/useGameStore';
import { createUiStore } from '../store/useUiStore';
import { GameController } from './gameController';

const R: Move = { axis: 'x', layer: 1, dir: -1 };
const U: Move = { axis: 'y', layer: 1, dir: -1 };
const SCRAMBLE = [R, U];

/** 假 engine：記錄呼叫，enqueueMoves 立刻 resolve */
function fakeEngine() {
  const calls = { enqueued: [] as Move[][], input: [] as boolean[], sizes: [] as number[], states: [] as CubeState[] };
  const engine: CubeEngine = {
    setSize: (size) => void calls.sizes.push(size),
    setState: (state) => void calls.states.push(state),
    setTheme: vi.fn(),
    enqueueMoves: async (moves) => void calls.enqueued.push([...moves]),
    whenIdle: async () => {},
    isBusy: () => false,
    setInputEnabled: (enabled) => void calls.input.push(enabled),
    resetView: vi.fn(),
    dispose: vi.fn(),
  };
  return { engine, calls };
}

function setup() {
  const game = createGameStore({ storage: null, scramble: () => [...SCRAMBLE] });
  const ui = createUiStore();
  const controller = new GameController(game, ui);
  const { engine, calls } = fakeEngine();
  controller.attachEngine(engine);
  return { game, ui, controller, calls };
}

describe('GameController', () => {
  it('開始遊戲：先把畫面設成完成狀態，播完打亂序列後變成 ready；打亂中關掉輸入', async () => {
    const { game, controller, calls } = setup();
    await controller.startGame();
    expect(calls.states.at(-1)?.size).toBe(3);
    expect(calls.enqueued).toEqual([SCRAMBLE]);
    expect(calls.input).toContain(false);
    expect(calls.input.at(-1)).toBe(true);
    expect(game.getState().status).toBe('ready');
  });

  it('一局進行中再按開始遊戲不會重新打亂', async () => {
    const { controller, calls } = setup();
    await controller.startGame();
    controller.handleUserMove(R);
    await controller.startGame();
    expect(calls.enqueued).toEqual([SCRAMBLE]);
  });

  it('待機時可以自由轉動，不會打開完成畫面', async () => {
    const { game, ui, controller } = setup();
    controller.handleUserMove(R);
    controller.handleUserMove({ ...R, dir: 1 });
    await Promise.resolve();
    expect(game.getState().status).toBe('idle');
    expect(game.getState().moveCount).toBe(0);
    expect(ui.getState().solvedModalOpen).toBe(false);
  });

  it('玩家轉完：等動畫播完才打開完成畫面', async () => {
    const { ui, controller } = setup();
    await controller.startGame();
    for (const move of invertMoves(SCRAMBLE)) controller.handleUserMove(move);
    expect(ui.getState().solvedModalOpen).toBe(false);
    await vi.waitFor(() => expect(ui.getState().solvedModalOpen).toBe(true));
  });

  it('再玩一次：關掉完成畫面並直接開始下一局', async () => {
    const { game, ui, controller, calls } = setup();
    await controller.startGame();
    for (const move of invertMoves(SCRAMBLE)) controller.handleUserMove(move);
    await vi.waitFor(() => expect(ui.getState().solvedModalOpen).toBe(true));
    controller.playAgain();
    expect(ui.getState().solvedModalOpen).toBe(false);
    await vi.waitFor(() => expect(game.getState().status).toBe('ready'));
    expect(calls.enqueued.at(-1)).toEqual(SCRAMBLE);
  });

  it('上一步：把反向轉動交給 engine', async () => {
    const { controller, calls } = setup();
    await controller.startGame();
    controller.handleUserMove(R);
    controller.undo();
    expect(calls.enqueued.at(-1)).toEqual([{ ...R, dir: 1 }]);
  });

  it('3×3 放棄：用 Kociemba 的解播動畫，播完打開完成畫面，不列入紀錄', async () => {
    const { game, ui, controller, calls } = setup();
    const solution = invertMoves(SCRAMBLE);
    const provider = vi.fn(() => Promise.resolve(solution));
    controller.setSolutionProvider(provider);
    await controller.startGame();
    await controller.giveUp();
    expect(provider).toHaveBeenCalledOnce();
    expect(calls.enqueued.at(-1)).toEqual(solution);
    expect(game.getState().status).toBe('solved');
    expect(game.getState().kociembaSteps).toBe(2);
    expect(game.getState().bestRecords[3]).toBeNull();
    expect(ui.getState().solvedModalOpen).toBe(true);
    expect(ui.getState().computingSolution).toBe(false);
  });

  it('解完的那一刻同步關掉轉層輸入：之後多轉的一步不算，完成畫面照樣打開', async () => {
    const { game, ui, controller, calls } = setup();
    await controller.startGame();
    for (const move of invertMoves(SCRAMBLE)) controller.handleUserMove(move);
    // 還在 handleUserMove 裡（同步）就已經關掉輸入
    expect(calls.input.at(-1)).toBe(false);
    const solvedCube = game.getState().cube;
    controller.handleUserMove(R);
    expect(game.getState().cube).toBe(solvedCube);
    expect(game.getState().status).toBe('solved');
    await vi.waitFor(() => expect(ui.getState().solvedModalOpen).toBe(true));
    controller.closeSolvedModal();
    expect(calls.input.at(-1)).toBe(true);
  });

  it('關掉 Kociemba 的完成畫面時，engine 也對齊 store 的方塊', async () => {
    const { game, controller, calls } = setup();
    controller.setSolutionProvider(() => Promise.resolve(invertMoves(SCRAMBLE)));
    await controller.startGame();
    await controller.giveUp();
    controller.closeSolvedModal();
    expect(calls.states.at(-1)).toBe(game.getState().cube);
  });

  it('確認放棄當下就停表；等解法期間時間不再走', async () => {
    let now = 0;
    const game = createGameStore({ storage: null, now: () => now, scramble: () => [...SCRAMBLE] });
    const ui = createUiStore();
    const controller = new GameController(game, ui);
    controller.attachEngine(fakeEngine().engine);
    let resolveSolution: (moves: Move[]) => void = () => {};
    controller.setSolutionProvider(() => new Promise<Move[]>((resolve) => (resolveSolution = resolve)));
    await controller.startGame();
    now = 1000;
    controller.handleUserMove(R);
    now = 3000;
    const done = controller.giveUp();
    expect(ui.getState().computingSolution).toBe(true);
    expect(game.getState().startedAt).toBeNull();
    expect(game.getState().finalTimeMs).toBe(2000);
    now = 9000;
    resolveSolution(invertMoves([...SCRAMBLE, R]));
    await done;
    expect(game.getState().finalTimeMs).toBe(2000);
    expect(game.getState().status).toBe('solved');
  });

  it('Kociemba 的解比打亂還長也照樣用它', async () => {
    const { controller, calls } = setup();
    const longer = [...invertMoves(SCRAMBLE), R, R, R, R];
    controller.setSolutionProvider(() => Promise.resolve(longer));
    await controller.startGame();
    await controller.giveUp();
    expect(calls.enqueued.at(-1)).toEqual(longer);
  });

  it('Kociemba 還原動畫和完成畫面期間關掉玩家輸入，關掉完成畫面回到 idle 再打開', async () => {
    const { game, ui, controller, calls } = setup();
    // 假的 Kociemba：把打亂和玩家轉動倒過來
    controller.setSolutionProvider(() => {
      const { scrambleMoves, history } = game.getState();
      return Promise.resolve(invertMoves([...scrambleMoves, ...history]));
    });
    await controller.startGame();
    controller.handleUserMove(R);
    calls.input.length = 0;
    await controller.giveUp();
    expect(calls.input).toContain(false);
    expect(calls.input.at(-1)).toBe(false);
    controller.closeSolvedModal();
    expect(ui.getState().solvedModalOpen).toBe(false);
    expect(game.getState().status).toBe('idle');
    expect(game.getState().moveCount).toBe(0);
    expect(calls.input.at(-1)).toBe(true);
  });

  /** 斷言「直接重設」：沒有播動畫、畫面設成完成狀態、回到 idle、沒有完成畫面 */
  function expectAbandoned(ctx: ReturnType<typeof setup>, enqueuedBefore: number) {
    expect(ctx.calls.enqueued.length).toBe(enqueuedBefore);
    expect(ctx.calls.states.at(-1)).toEqual(ctx.game.getState().cube);
    expect(ctx.game.getState().status).toBe('idle');
    expect(ctx.game.getState().moveCount).toBe(0);
    expect(ctx.ui.getState().solvedModalOpen).toBe(false);
    expect(ctx.game.getState().bestRecords[3]).toBeNull();
  }

  it('沒有解法器（2×2、4×4）：直接重設，不播動畫、不跳完成畫面', async () => {
    const ctx = setup();
    ctx.controller.setSolutionProvider(() => null);
    await ctx.controller.startGame();
    ctx.controller.handleUserMove(R);
    const enqueued = ctx.calls.enqueued.length;
    await ctx.controller.giveUp();
    expectAbandoned(ctx, enqueued);
  });

  it('3×3 解法器失敗、逾時或給錯的解：改成直接重設', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const providers = [() => Promise.reject(new Error('逾時')), () => Promise.resolve([R])];
    for (const provider of providers) {
      const ctx = setup();
      ctx.controller.setSolutionProvider(provider);
      await ctx.controller.startGame();
      const enqueued = ctx.calls.enqueued.length;
      await ctx.controller.giveUp();
      expectAbandoned(ctx, enqueued);
      expect(ctx.ui.getState().computingSolution).toBe(false);
    }
    warn.mockRestore();
  });

  it('待機時放棄不做事', async () => {
    const { controller, calls } = setup();
    controller.handleUserMove(R);
    await controller.giveUp();
    expect(calls.enqueued).toEqual([]);
  });

  it('待機時換尺寸會通知 engine，關掉完成畫面', () => {
    const { ui, controller, calls } = setup();
    ui.getState().openSolvedModal();
    controller.setSize(4);
    expect(calls.sizes).toEqual([4]);
    expect(ui.getState().solvedModalOpen).toBe(false);
  });

  it('一局進行中換尺寸被拒絕；放棄之後才可以換', async () => {
    const { game, controller, calls } = setup();
    await controller.startGame();
    controller.handleUserMove(R);
    controller.setSize(2);
    expect(game.getState().size).toBe(3);
    expect(calls.sizes).toEqual([]);
    await controller.giveUp(); // 沒有解法器：直接重設回 idle
    controller.setSize(2);
    expect(game.getState().size).toBe(2);
    expect(game.getState().status).toBe('idle');
    expect(calls.sizes).toEqual([2]);
  });

  it('一局進行中可以換主題', async () => {
    const { game, controller } = setup();
    await controller.startGame();
    controller.setTheme('neon');
    expect(game.getState().themeId).toBe('neon');
  });
});
