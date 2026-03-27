import * as React from 'react';
import { useLocation } from 'react-router-dom';

type ScrollResetTarget = Window | HTMLElement;

function scrollTargetToTop(target: ScrollResetTarget) {
  target.scrollTo({ top: 0, left: 0, behavior: 'auto' });
}

export function useRouteScrollReset(targetRef?: React.RefObject<HTMLElement | null>) {
  const location = useLocation();

  React.useLayoutEffect(() => {
    const target = targetRef?.current ?? (typeof window !== 'undefined' ? window : null);

    if (!target || typeof target.scrollTo !== 'function') {
      return;
    }

    /**
     * The app shell keeps long-lived layout containers mounted across route
     * changes. Reset scroll on every navigation so the next page never inherits
     * the previous page's vertical position.
     */
    scrollTargetToTop(target);
  }, [location.key, targetRef]);
}
