import {useEffect} from 'react';
import {useLocation} from 'react-router';

/**
 * Ports the demo's `.reveal` scroll-in behavior (app.js `revealObserver`):
 * sections start at opacity:0/translateY(24px) via the `.reveal` CSS class
 * and get `.in-view` added once they enter the viewport. Re-scans on route
 * changes and DOM mutations since Hydrogen streams/defers content instead
 * of doing full page loads like the static demo did.
 */
export function ScrollReveal() {
  const location = useLocation();

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('in-view');
            observer.unobserve(entry.target);
          }
        }
      },
      {threshold: 0.1, rootMargin: '0px 0px -40px 0px'},
    );

    function observeAll() {
      document.querySelectorAll('.reveal:not(.in-view)').forEach((el) => observer.observe(el));
    }

    observeAll();

    const mutationObserver = new MutationObserver(() => observeAll());
    mutationObserver.observe(document.body, {childList: true, subtree: true});

    return () => {
      observer.disconnect();
      mutationObserver.disconnect();
    };
  }, [location.pathname]);

  return null;
}
