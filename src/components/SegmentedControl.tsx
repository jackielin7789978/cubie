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
  disabled?: boolean;
  className?: string;
}

/**
 * 圓角膠囊的分段選擇器（尺寸、主題共用）。
 * React 元件就是「回傳畫面的函式」，props 是外面傳進來的參數；
 * 這裡用泛型 <T>，讓同一個元件可以選數字（尺寸）也可以選字串（主題）。
 */
export function SegmentedControl<T extends string | number>(props: SegmentedControlProps<T>) {
  const { label, options, value, onChange, disabled = false, className = '' } = props;
  return (
    <div className={`segmented glass ${className}`} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="segment"
          data-testid={option.testId}
          aria-pressed={option.value === value}
          disabled={disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
