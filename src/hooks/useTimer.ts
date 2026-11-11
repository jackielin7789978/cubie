import { useEffect, useState } from 'react';
import { useGameStore } from '../store/useGameStore';

/** 目前要顯示的經過時間（毫秒）：計時中每一格畫面更新，停表後顯示最後成績，還沒開始是 0 */
export function useTimer(): number {
  const running = useGameStore((s) => s.status === 'solving' && s.startedAt !== null);
  const startedAt = useGameStore((s) => s.startedAt);
  const finalTimeMs = useGameStore((s) => s.finalTimeMs);
  // useState：元件自己的狀態。呼叫 setNow 改值時，React 會重新執行這個元件、更新畫面。
  const [now, setNow] = useState(() => performance.now());

  useEffect(() => {
    if (!running) return;
    let frame = 0;
    const tick = () => {
      setNow(performance.now());
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    // cleanup：停表或元件移除時取消下一格，不然 requestAnimationFrame 會一直跑下去
    return () => cancelAnimationFrame(frame);
  }, [running]);

  if (running && startedAt !== null) return Math.max(0, now - startedAt);
  return finalTimeMs ?? 0;
}
