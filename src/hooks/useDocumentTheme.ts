import { useEffect } from 'react';
import type { Theme } from '../themes/types';

/** 把主題的背景和浮層色調（light / dark）套到整個頁面 */
export function useDocumentTheme(theme: Theme): void {
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--page-bg', theme.background);
    root.dataset.ui = theme.ui;
    root.dataset.theme = theme.id;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.ui === 'dark' ? '#05060F' : '#4F46E5');
  }, [theme]);
}
