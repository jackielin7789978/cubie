import confetti from 'canvas-confetti';
import { useEffect, useRef } from 'react';
import type { GameController } from '../hooks/gameController';
import { useGameStore } from '../store/useGameStore';
import { useUiStore } from '../store/useUiStore';
import { formatTime } from './formatTime';

/** 彩帶：從左右兩邊各噴一次。系統設定「減少動態效果」時不播。 */
function celebrate(big: boolean): void {
  const base = { particleCount: big ? 90 : 45, spread: 70, startVelocity: 45, disableForReducedMotion: true, zIndex: 30 };
  void confetti({ ...base, angle: 60, origin: { x: 0, y: 0.75 } });
  void confetti({ ...base, angle: 120, origin: { x: 1, y: 0.75 } });
}

function ResultLine({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="result">
      <span className="stat-label">{label}</span>
      <strong className="result-value" data-testid={testId}>
        {value}
      </strong>
    </div>
  );
}

/** 完成慶祝畫面 */
export function SolvedModal({ controller }: { controller: GameController }) {
  const open = useUiStore((s) => s.solvedModalOpen);
  const finalTimeMs = useGameStore((s) => s.finalTimeMs);
  const moveCount = useGameStore((s) => s.moveCount);
  const usedAutoSolve = useGameStore((s) => s.usedAutoSolve);
  const isNewBest = useGameStore((s) => s.isNewBest);
  const playAgainRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    celebrate(!usedAutoSolve);
    playAgainRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') controller.closeSolvedModal();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      confetti.reset(); // 關掉完成畫面時把還在飄的彩帶清掉
    };
  }, [open, usedAutoSolve, controller]);

  if (!open) return null;
  const title = usedAutoSolve ? '自動還原完成' : '完成！';
  return (
    <div className="modal-backdrop">
      <div className="modal glass" role="dialog" aria-modal="true" aria-labelledby="solved-title" data-testid="solved-modal">
        <h2 id="solved-title" className="modal-title">{title}</h2>
        {isNewBest && <p className="new-best">新紀錄！</p>}
        {usedAutoSolve && <p className="modal-note">使用自動還原，這局不列入最佳紀錄</p>}
        <div className="results">
          <ResultLine label="時間" value={finalTimeMs === null ? '—' : formatTime(finalTimeMs)} testId="modal-time" />
          <ResultLine label="步數" value={String(moveCount)} testId="modal-moves" />
        </div>
        <div className="modal-actions">
          <button ref={playAgainRef} type="button" className="btn btn-primary" data-testid="btn-play-again" onClick={() => controller.playAgain()}>
            再玩一次
          </button>
          <button type="button" className="btn glass" data-testid="btn-close-modal" onClick={() => controller.closeSolvedModal()}>
            關閉
          </button>
        </div>
      </div>
    </div>
  );
}
