import { useId } from 'react';

export interface SegmentOption<T> {
  value: T;
  label: string;
  testId: string;
}

interface SegmentedControlProps<T> {
  /** 給螢幕閱讀器的群組名稱，例如「方塊尺寸」 */
  label: string;
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** 鎖住：選項變淡、按了沒有作用 */
  disabled?: boolean;
  /** 鎖住時的說明（滑鼠移上去的提示，也會念給螢幕閱讀器聽），例如「放棄這一局後才能切換尺寸」 */
  disabledHint?: string;
  className?: string;
}

/**
 * 圓角膠囊的分段選擇器（尺寸、主題共用）。
 * React 元件就是「回傳畫面的函式」，props 是外面傳進來的參數；
 * 這裡用泛型 <T>，讓同一個元件可以選數字（尺寸）也可以選字串（主題）。
 *
 * 鎖住時用 aria-disabled 而不是原生的 disabled：原生 disabled 的按鈕在 Safari／Chrome
 * 不會觸發滑鼠事件，title 提示出不來，鍵盤也跳不到它；aria-disabled 仍然可以聚焦和讀到說明。
 */
export function SegmentedControl<T extends string | number>(props: SegmentedControlProps<T>) {
  const { label, options, value, onChange, disabled = false, disabledHint, className = '' } = props;
  // useId：產生一個在整個頁面上不會重複的 id，讓 aria-describedby 可以指到下面那段說明文字。
  // 同一個元件用了好幾次（尺寸、主題）也不會撞 id。
  const hintId = useId();
  const hint = disabled ? disabledHint : undefined;
  return (
    <div
      className={`segmented glass ${className}`}
      role="group"
      aria-label={label}
      aria-disabled={disabled || undefined}
      aria-describedby={hint ? hintId : undefined}
      title={hint}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="segment"
          data-testid={option.testId}
          aria-pressed={option.value === value}
          aria-disabled={disabled || undefined}
          title={hint}
          onClick={() => {
            if (!disabled) onChange(option.value);
          }}
        >
          {option.label}
        </button>
      ))}
      {hint && (
        <span id={hintId} className="visually-hidden">
          {hint}
        </span>
      )}
    </div>
  );
}
