// src/hooks/useNavigate.ts
import { useCallback } from 'react';
import { navigateContextualBack, pushNavigationState } from '../utils/navigation';

export type NavigateFunction = {
  (delta: number): void;
  (to: string, options?: { replace?: boolean; state?: any }): void;
};

/**
 * Universal useNavigate hook compatible with React Router API patterns
 * Supports navigate(-1) for contextual history back navigation
 * and string paths with optional pushNavigationState.
 */
export function useNavigate(): NavigateFunction {
  return useCallback((toOrDelta: string | number, options?: { replace?: boolean; state?: any }) => {
    if (typeof toOrDelta === 'number') {
      if (toOrDelta === -1) {
        navigateContextualBack();
      } else if (typeof window !== 'undefined') {
        window.history.go(toOrDelta);
      }
    } else {
      if (options?.state) {
        pushNavigationState(toOrDelta, options.state);
      } else if (typeof window !== 'undefined') {
        if (options?.replace) {
          window.history.replaceState(null, '', toOrDelta);
        } else {
          window.history.pushState(null, '', toOrDelta);
        }
      }
    }
  }, []);
}

export default useNavigate;
