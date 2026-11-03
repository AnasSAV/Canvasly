import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme, type ThemePref } from '../state/theme';
import { IconButton } from './IconButton';

const NEXT: Record<ThemePref, ThemePref> = { light: 'dark', dark: 'system', system: 'light' };
const LABEL: Record<ThemePref, string> = {
  light: 'Theme: light',
  dark: 'Theme: dark',
  system: 'Theme: same as system',
};

/** Cycles light → dark → follow system. */
export function ThemeToggle() {
  const pref = useTheme((s) => s.pref);
  const setPref = useTheme((s) => s.setPref);
  const Icon = pref === 'light' ? Sun : pref === 'dark' ? Moon : Monitor;
  return (
    <IconButton label={LABEL[pref]} onClick={() => setPref(NEXT[pref])} data-testid="theme-toggle">
      <Icon size={17} />
    </IconButton>
  );
}
