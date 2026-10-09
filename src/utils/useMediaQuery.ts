import { useEffect, useState } from 'react';

/** Tracks a CSS media query. SSR/test-safe: returns `false` when matchMedia does not exist. */
export function useMediaQuery(query: string): boolean {
  const read = () =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false;
  const [matches, setMatches] = useState<boolean>(read);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    // Safari < 14 only has addListener/removeListener.
    if (mq.addEventListener) mq.addEventListener('change', on); else mq.addListener(on);
    return () => { if (mq.removeEventListener) mq.removeEventListener('change', on); else mq.removeListener(on); };
  }, [query]);
  return matches;
}

/** Below Tailwind's `lg` breakpoint: phones and portrait tablets get the stacked layout. */
export const NARROW_QUERY = '(max-width: 1023px)';
export const useIsNarrow = () => useMediaQuery(NARROW_QUERY);
