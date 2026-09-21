import {useEffect, useState} from 'react';
import {Icon} from '~/lib/icons';
import {useI18n} from '~/lib/i18n';

const KEY = 'vs_theme';

function getEffectiveTheme(): 'light' | 'dark' {
  if (typeof document === 'undefined') return 'light';
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'light' || attr === 'dark') return attr;
  return typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

/** Boton sol/luna que alterna data-theme en <html> y lo persiste en localStorage. */
export function ThemeToggle({className = 'theme-toggle', showLabel = false}: {className?: string; showLabel?: boolean}) {
  const {t} = useI18n();
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    setTheme(getEffectiveTheme());
  }, []);

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // localStorage no disponible (modo privado, etc.): el tema no se persiste
    }
    setTheme(next);
  }

  const label = theme === 'dark' ? t('themeLight') : t('themeDark');

  return (
    <button className={className} onClick={toggle} aria-label={label}>
      <span className="icon">
        <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
      </span>
      {showLabel && <span>{label}</span>}
    </button>
  );
}
