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

export function SizeSelector({ controller }: { controller: GameController }) {
  const size = useGameStore((s) => s.size);
  const { busy } = useGameFlags();
  return (
    <SegmentedControl
      label="方塊尺寸"
      className="size-selector"
      options={SIZE_OPTIONS}
      value={size}
      disabled={busy}
      onChange={(next) => controller.setSize(next)}
    />
  );
}
