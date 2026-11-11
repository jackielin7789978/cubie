import type { GameController } from '../hooks/gameController';
import { useGameStore } from '../store/useGameStore';
import { THEME_LIST } from '../themes';
import type { ThemeId } from '../themes/types';
import { SegmentedControl } from './SegmentedControl';
import type { SegmentOption } from './SegmentedControl';

const THEME_OPTIONS: readonly SegmentOption<ThemeId>[] = THEME_LIST.map((theme) => ({
  value: theme.id,
  label: theme.name,
  testId: `theme-${theme.id}`,
}));

export function ThemeSwitcher({ controller }: { controller: GameController }) {
  const themeId = useGameStore((s) => s.themeId);
  return (
    <SegmentedControl
      label="主題"
      className="theme-switcher"
      options={THEME_OPTIONS}
      value={themeId}
      onChange={(next) => controller.setTheme(next)}
    />
  );
}
