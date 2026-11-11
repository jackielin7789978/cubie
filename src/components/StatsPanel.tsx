import { useBestRecord } from '../hooks/useBestRecord';
import { useTimer } from '../hooks/useTimer';
import { useGameStore } from '../store/useGameStore';
import { formatTime } from './formatTime';

function Stat({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <strong className="stat-value" data-testid={testId}>
        {value}
      </strong>
    </div>
  );
}

/** 時間、步數、最佳紀錄 */
export function StatsPanel() {
  const elapsed = useTimer();
  const moveCount = useGameStore((s) => s.moveCount);
  const best = useBestRecord();
  const timing = useGameStore((s) => s.status === 'solving');
  return (
    <section className="stats glass" aria-label="成績" data-timing={timing}>
      <Stat label="時間" value={formatTime(elapsed)} testId="stat-time" />
      <Stat label="步數" value={String(moveCount)} testId="stat-moves" />
      <Stat label="最佳" value={best ? formatTime(best.timeMs) : '—'} testId="stat-best" />
    </section>
  );
}
