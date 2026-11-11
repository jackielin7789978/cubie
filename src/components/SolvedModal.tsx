import confetti from 'canvas-confetti';
import { useEffect, useRef } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
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

/** 彈窗裡可以用 Tab 移到的元素 */
const FOCUSABLE = 'a[href], button:not([disabled])';

/**
 * 焦點陷阱：在彈窗裡按 Tab／Shift+Tab 只會在彈窗裡的連結和按鈕之間循環，
 * 焦點不會跑到彈窗後面看不到的按鈕上。全部自己移動焦點，Safari 預設 Tab 不停在按鈕上也一樣能用。
 */
function trapTab(event: ReactKeyboardEvent<HTMLElement>): void {
  if (event.key !== 'Tab') return;
  const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE));
  if (items.length === 0) return;
  event.preventDefault();
  const current = items.indexOf(document.activeElement as HTMLElement);
  const step = event.shiftKey ? -1 : 1;
  const next = current === -1 ? (event.shiftKey ? items.length - 1 : 0) : (current + step + items.length) % items.length;
  items[next].focus();
}

/**
 * 關掉彈窗後把焦點還給工具列上第一顆能按的按鈕（通常是「開始遊戲」）。
 * 等下一幀再找：關掉彈窗和工具列換按鈕是同一次更新，要等新的按鈕畫出來。
 */
function restoreFocusToToolbar(): void {
  requestAnimationFrame(() => {
    if (document.activeElement && document.activeElement !== document.body) return;
    document.querySelector<HTMLElement>('.toolbar button:not([disabled])')?.focus();
  });
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
      restoreFocusToToolbar();
    };
  }, [open, controller]);

  if (!open) return null;
  return (
    <div className="modal-backdrop">
      {/* onKeyDown 是 React 的鍵盤事件：焦點在彈窗裡任何元素上按鍵都會傳到這裡，用來做焦點陷阱 */}
      <div
        className="modal glass"
        role="dialog"
        aria-modal="true"
        aria-labelledby="solved-title"
        data-testid="solved-modal"
        onKeyDown={trapTab}
      >
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
