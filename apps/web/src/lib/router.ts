import { createElement, useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react';

/**
 * Three routes don't justify a router dependency: this is pathname state over the History API.
 * Routes: `/` dashboard, `/b/:id` board.
 */
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
window.addEventListener('popstate', notify);

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function navigate(to: string, { replace = false } = {}) {
  if (replace) history.replaceState(null, '', to);
  else history.pushState(null, '', to);
  notify();
}

export function usePathname(): string {
  return useSyncExternalStore(subscribe, () => location.pathname);
}

export function matchBoard(pathname: string): string | null {
  return /^\/b\/([\w-]+)\/?$/.exec(pathname)?.[1] ?? null;
}

export function Link({ to, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  return createElement('a', {
    ...rest,
    href: to,
    onClick: (e: MouseEvent<HTMLAnchorElement>) => {
      onClick?.(e);
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      navigate(to);
    },
  });
}
