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
  it('打亂：先把畫面設成完成狀態，播完打亂序列後變成 ready；打亂中關掉輸入', async () => {
    const { game, controller, calls } = setup();
    await controller.scramble();
    expect(calls.states.at(-1)?.size).toBe(3);
    expect(calls.enqueued).toEqual([SCRAMBLE]);
    expect(calls.input).toContain(false);
    expect(calls.input.at(-1)).toBe(true);
    expect(game.getState().status).toBe('ready');
  });

  it('玩家轉完：等動畫播完才打開完成畫面', async () => {
    const { ui, controller } = setup();
    await controller.scramble();
    for (const move of invertMoves(SCRAMBLE)) controller.handleUserMove(move);
    expect(ui.getState().solvedModalOpen).toBe(false);
    await vi.waitFor(() => expect(ui.getState().solvedModalOpen).toBe(true));
  });

  it('上一步：把反向轉動交給 engine', async () => {
    const { controller, calls } = setup();
    await controller.scramble();
    controller.handleUserMove(R);
    controller.undo();
    expect(calls.enqueued.at(-1)).toEqual([{ ...R, dir: 1 }]);
  });

  it('自動還原：有外部解法就用它，播完打開完成畫面', async () => {
    const { game, ui, controller, calls } = setup();
    const solution = invertMoves(SCRAMBLE);
    const provider = vi.fn(() => Promise.resolve(solution));
    controller.setSolutionProvider(provider);
    await controller.scramble();
    await controller.autoSolve();
    expect(provider).toHaveBeenCalledOnce();
    expect(calls.enqueued.at(-1)).toEqual(solution);
    expect(game.getState().status).toBe('solved');
    expect(ui.getState().solvedModalOpen).toBe(true);
    expect(ui.getState().computingSolution).toBe(false);
  });

  it('外部解法失敗或回傳 null：改用反轉歷史', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const failing = setup();
    failing.controller.setSolutionProvider(() => Promise.reject(new Error('boom')));
    await failing.controller.scramble();
    await failing.controller.autoSolve();
    expect(failing.calls.enqueued.at(-1)).toEqual(invertMoves(SCRAMBLE));

    const declining = setup();
    declining.controller.setSolutionProvider(() => null);
    await declining.controller.scramble();
    await declining.controller.autoSolve();
    expect(declining.calls.enqueued.at(-1)).toEqual(invertMoves(SCRAMBLE));
    warn.mockRestore();
  });

  it('已經是完成狀態時自動還原不做事', async () => {
    const { controller, calls } = setup();
    await controller.autoSolve();
    expect(calls.enqueued).toEqual([]);
  });

  it('換尺寸會通知 engine，關掉完成畫面', () => {
    const { ui, controller, calls } = setup();
    ui.getState().openSolvedModal();
    controller.setSize(4);
    expect(calls.sizes).toEqual([4]);
    expect(ui.getState().solvedModalOpen).toBe(false);
  });
});
