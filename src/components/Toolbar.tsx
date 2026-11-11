import type { GameController } from '../hooks/gameController';
import { useGameFlags } from '../hooks/useGameFlags';
import { useGameStore } from '../store/useGameStore';
import { GiveUpButton } from './GiveUpButton';

/** 待機時只有「開始遊戲」；一局進行中換成「上一步」和「放棄」 */
export function Toolbar({ controller }: { controller: GameController }) {
  const { inGame, canStart, canUndo, canGiveUp } = useGameFlags();
  // 只有 3×3 有 Kociemba 解法器
  const hasKociemba = useGameStore((s) => s.size === 3);
  return (
    <div className="toolbar" role="toolbar" aria-label="遊戲操作" data-in-game={inGame}>
      {inGame ? (
        <>
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
          <GiveUpButton disabled={!canGiveUp} kociemba={hasKociemba} onConfirm={() => void controller.giveUp()} />
        </>
      ) : (
        <button
          type="button"
          className="btn btn-primary btn-start"
          data-testid="btn-start"
          aria-label="開始遊戲"
          disabled={!canStart}
          onClick={() => void controller.startGame()}
        >
          開始遊戲
        </button>
      )}
    </div>
  );
}
