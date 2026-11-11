import { CubeCanvas } from './components/CubeCanvas';
import { SizeSelector } from './components/SizeSelector';
import { SolvedModal } from './components/SolvedModal';
import { StatsPanel } from './components/StatsPanel';
import { ThemeSwitcher } from './components/ThemeSwitcher';
import { Toolbar } from './components/Toolbar';
import type { SolutionProvider } from './hooks/gameController';
import { useDocumentTheme } from './hooks/useDocumentTheme';
import { useGameController } from './hooks/useGameController';
import { useGameStore } from './store/useGameStore';
import { THEMES } from './themes';

interface AppProps {
  /** 外部解法器（例如 3×3 Kociemba）；沒有時自動還原用反轉歷史 */
  solutionProvider?: SolutionProvider | null;
}

/**
 * 版面：方塊在最底層，標題、切換、統計、按鈕都是浮在上面的元件。
 * 桌機、手機直式、手機橫式的位置全部由 CSS（src/styles/app.css）決定。
 */
export default function App({ solutionProvider }: AppProps) {
  const controller = useGameController(solutionProvider);
  const themeId = useGameStore((s) => s.themeId);
  const status = useGameStore((s) => s.status);
  useDocumentTheme(THEMES[themeId]);

  return (
    <main className="app">
      <CubeCanvas controller={controller} />
      <h1 className="title">Cubie</h1>
      <div className="switchers">
        <SizeSelector controller={controller} />
        <ThemeSwitcher controller={controller} />
      </div>
      <StatsPanel />
      <Toolbar controller={controller} />
      <SolvedModal controller={controller} />
      <span className="visually-hidden" data-testid="game-status">
        {status}
      </span>
    </main>
  );
}
