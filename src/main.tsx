import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/app.css';

/** iOS Safari 不理會 user-scalable=no，要另外擋掉雙指縮放手勢，頁面才不會被放大拖動 */
function preventPageZoom(): void {
  const block = (event: Event) => event.preventDefault();
  document.addEventListener('gesturestart', block, { passive: false });
  document.addEventListener('gesturechange', block, { passive: false });
}

/**
 * 只在開發模式：React 19 開發版會呼叫 performance.measure 畫效能時間軸，
 * WebKit（Safari）偶爾因為時間值不是有限數字而丟出 TypeError，打斷畫面更新。
 * 這裡把那個錯誤吞掉；正式版 React 不會呼叫它，所以不受影響。
 */
function guardDevPerformanceMeasure(): void {
  const measure = performance.measure.bind(performance);
  performance.measure = ((...args: Parameters<Performance['measure']>) => {
    try {
      return measure(...args);
    } catch {
      return undefined as unknown as PerformanceMeasure;
    }
  }) as Performance['measure'];
}

preventPageZoom();
if (import.meta.env.DEV) guardDevPerformanceMeasure();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
