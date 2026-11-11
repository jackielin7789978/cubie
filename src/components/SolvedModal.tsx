import confetti from 'canvas-confetti';
import { useEffect, useRef } from 'react';
import type { GameController } from '../hooks/gameController';
import { useGameStore } from '../store/useGameStore';
import { useUiStore } from '../store/useUiStore';
import { formatTime } from './formatTime';

/** 彩帶：從左右兩邊各噴一次。系統設定「減少動態效果」時不播。 */
function celebrate(): void {
  const base = { particleCount: 90, spread: 70, startVelocity: 45, disableForReducedMotion: true, zIndex: 30 };
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

/** 3×3 放棄後的文案：Kociemba 用了幾步 */
function KociembaMessage({ steps }: { steps: number }) {
  // 人名是連到 Kociemba 個人網站的連結（另開新分頁）；不要從中間斷行（窄螢幕會斷成「Herbert／Kociemba」）
  return (
    <>
      數學老師{' '}
      <a
        className="modal-link nowrap"
        href="https://kociemba.org/"
        target="_blank"
        rel="noopener noreferrer"
        data-testid="link-kociemba"
      >
        Herbert Kociemba
      </a>{' '}
      用 <strong className="modal-steps">{steps}</strong> 步幫你解完了
    </>
  );
}

/** 玩家自己解完的成績 */
function Results({ finalTimeMs, moveCount }: { finalTimeMs: number | null; moveCount: number }) {
  return (
    <div className="results">
      <ResultLine label="時間" value={finalTimeMs === null ? '—' : formatTime(finalTimeMs)} testId="modal-time" />
      <ResultLine label="步數" value={String(moveCount)} testId="modal-moves" />
    </div>
  );
}

/**
 * 完成慶祝畫面。玩家自己解完：顯示成績和新紀錄；
 * 3×3 放棄、Kociemba 還原播完：一樣放彩帶，但只顯示 Kociemba 用幾步解完（不算玩家的成績）。
 */
export function SolvedModal({ controller }: { controller: GameController }) {
  const open = useUiStore((s) => s.solvedModalOpen);
  const finalTimeMs = useGameStore((s) => s.finalTimeMs);
  const moveCount = useGameStore((s) => s.moveCount);
  const isNewBest = useGameStore((s) => s.isNewBest);
  const kociembaSteps = useGameStore((s) => s.kociembaSteps);
  const playAgainRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    celebrate();
    playAgainRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') controller.closeSolvedModal();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      confetti.reset(); // 關掉完成畫面時把還在飄的彩帶清掉
    };
  }, [open, controller]);

  if (!open) return null;
  return (
    <div className="modal-backdrop">
      <div className="modal glass" role="dialog" aria-modal="true" aria-labelledby="solved-title" data-testid="solved-modal">
        {kociembaSteps !== null ? (
          <h2 id="solved-title" className="modal-title modal-title-message" data-testid="modal-message">
            <KociembaMessage steps={kociembaSteps} />
          </h2>
        ) : (
          <>
            <h2 id="solved-title" className="modal-title">完成！</h2>
            {isNewBest && <p className="new-best">新紀錄！</p>}
            <Results finalTimeMs={finalTimeMs} moveCount={moveCount} />
          </>
        )}
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
