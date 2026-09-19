import {useEffect} from 'react';

/**
 * Ports the demo's `updateHeaderOffset()`: measures the real header/topbar
 * height and writes it as CSS vars so the hero (`--topchrome-offset`) and
 * the sticky mobile nav (`--header-offset`) fill exactly the remaining
 * viewport instead of relying on a guessed fallback value.
 */
export function HeaderOffset() {
  useEffect(() => {
    function update() {
      const header = document.querySelector('.header');
      const h = header instanceof HTMLElement ? header.offsetHeight : 0;
      document.documentElement.style.setProperty('--header-offset', `${h}px`);

      const topbar = document.querySelector('.topbar');
      const topbarH = topbar instanceof HTMLElement ? topbar.offsetHeight : 0;
      document.documentElement.style.setProperty('--topchrome-offset', `${h + topbarH}px`);
    }

    update();
    window.addEventListener('resize', update);
    void document.fonts?.ready.then(update);

    return () => window.removeEventListener('resize', update);
  }, []);

  return null;
}
