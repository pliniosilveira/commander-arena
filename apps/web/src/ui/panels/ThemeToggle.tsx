import { useEffect, useState } from 'react';
import { Segmented } from './Segmented';
import { applyTheme, currentTheme, readStoredTheme, type Theme } from './theme';

/** Light/dark switch. Applies the remembered theme when it first appears, so the menu honors it too. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    const stored = readStoredTheme();
    if (stored !== null) applyTheme(stored, false);
    setTheme(currentTheme());
  }, []);

  const choose = (next: Theme) => {
    applyTheme(next, true);
    setTheme(next);
  };

  return (
    <Segmented
      legend="Theme"
      value={theme}
      onChange={choose}
      options={[
        { value: 'dark', label: 'Dark' },
        { value: 'light', label: 'Light' },
      ]}
    />
  );
}
