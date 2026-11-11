import type { GameController } from '../hooks/gameController';
import { useGameFlags } from '../hooks/useGameFlags';

/** 打亂、上一步、自動還原 */
export function Toolbar({ controller }: { controller: GameController }) {
  const { busy, canUndo, canAutoSolve } = useGameFlags();
  return (
    <div className="toolbar" role="toolbar" aria-label="遊戲操作">
      <button
        type="button"
        className="btn btn-primary"
        data-testid="btn-scramble"
        aria-label="打亂方塊"
        disabled={busy}
        onClick={() => void controller.scramble()}
      >
        打亂
      </button>
      <button
        type="button"
        className="btn glass"
        data-testid="btn-undo"
        aria-label="上一步"
        disabled={!canUndo}
        onClick={() => controller.undo()}
      >
        上一步
      </button>
      <button
        type="button"
        className="btn glass"
        data-testid="btn-solve"
        aria-label="自動還原"
        disabled={!canAutoSolve}
        onClick={() => void controller.autoSolve()}
      >
        自動還原
      </button>
    </div>
  );
}
