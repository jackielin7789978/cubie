import { useEffect, useRef, useState } from 'react';

/** 第一次按下後，這段時間內再按一次才真的放棄 */
export const GIVE_UP_CONFIRM_MS = 3000;

interface GiveUpButtonProps {
  disabled: boolean;
  /** 3×3 有 Kociemba 解法器：確認狀態的文字換成「Kociemba」（小彩蛋） */
  kociemba: boolean;
  onConfirm: () => void;
}

/** 等確認時的文字和給螢幕閱讀器的說明 */
function armedText(kociemba: boolean): { label: string; ariaLabel: string } {
  return kociemba
    ? { label: 'Kociemba', ariaLabel: '確定放棄，再按一次請 Kociemba 幫你解完' }
    : { label: '確定放棄？', ariaLabel: '確定放棄？再按一次放棄這一局' };
}

/**
 * 「放棄」按鈕：為了避免誤觸要按兩次。
 * 第一次按下變成「確定放棄？」（3×3 是「Kociemba」，紅色），3 秒內再按一次才放棄；
 * 逾時或按了別的地方就恢復原狀。
 */
export function GiveUpButton({ disabled, kociemba, onConfirm }: GiveUpButtonProps) {
  // armed：是不是已經按過第一次、正在等確認。useState 的值變了，React 會重新畫這顆按鈕。
  const [armed, setArmed] = useState(false);
  // useRef：拿到真正的 <button> DOM 元素，用來判斷「點的是不是這顆按鈕以外的地方」。
  // ref 的值改變不會讓元件重新畫，適合放這種只給程式用的東西。
  const buttonRef = useRef<HTMLButtonElement>(null);
  const active = armed && !disabled;

  // 進入「等確認」時才啟動計時器和「點別的地方」的監聽。
  // effect 回傳的 cleanup 會在恢復原狀、按鈕被移除時執行：清掉計時器、拿掉監聽，
  // 不然舊的計時器還是會在 3 秒後觸發，或監聽器一直留在 document 上。
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setArmed(false), GIVE_UP_CONFIRM_MS);
    const onPointerDown = (event: PointerEvent) => {
      if (!buttonRef.current?.contains(event.target as Node)) setArmed(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [active]);

  const handleClick = () => {
    if (!active) return setArmed(true);
    setArmed(false);
    onConfirm();
  };

  const confirm = armedText(kociemba);
  return (
    <button
      ref={buttonRef}
      type="button"
      className={active ? 'btn btn-danger' : 'btn glass'}
      data-testid="btn-giveup"
      data-armed={active}
      aria-label={active ? confirm.ariaLabel : '放棄這一局'}
      disabled={disabled}
      onClick={handleClick}
    >
      {active ? confirm.label : '放棄'}
    </button>
  );
}
