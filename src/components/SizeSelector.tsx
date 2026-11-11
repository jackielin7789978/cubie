import type { CubeSize } from '../core/types';
import type { GameController } from '../hooks/gameController';
import { useGameFlags } from '../hooks/useGameFlags';
import { CUBE_SIZES } from '../store/persistence';
import { useGameStore } from '../store/useGameStore';
import { SegmentedControl } from './SegmentedControl';
import type { SegmentOption } from './SegmentedControl';

const SIZE_OPTIONS: readonly SegmentOption<CubeSize>[] = CUBE_SIZES.map((size) => ({
  value: size,
  label: `${size}×${size}`,
  testId: `size-${size}`,
}));

/** 2×2／3×3／4×4。一局進行中鎖住，要先放棄才能換。 */
export function SizeSelector({ controller }: { controller: GameController }) {
  const size = useGameStore((s) => s.size);
  const { sizeLocked } = useGameFlags();
  return (
    <SegmentedControl
      label="方塊尺寸"
      className="size-selector"
      options={SIZE_OPTIONS}
      value={size}
      disabled={sizeLocked}
      disabledHint="放棄這一局後才能切換尺寸"
      onChange={(next) => controller.setSize(next)}
    />
  );
}
