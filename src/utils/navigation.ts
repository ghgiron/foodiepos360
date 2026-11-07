// src/utils/navigation.ts

export interface NavigationState {
  from?: string;
  originTab?: string;
  itemId?: string;
  itemType?: string;
  [key: string]: any;
}

/**
 * Pushes a history entry with contextual state (e.g. { from: location.pathname }).
 */
export function pushNavigationState(targetUrl: string, state: NavigationState = {}): void {
  if (typeof window === 'undefined') return;

  const currentState = window.history.state || {};
  const currentPath = window.location.pathname;

  const nextState: NavigationState = {
    ...currentState,
    ...state,
    from: state.from || currentPath || '/inventory',
    timestamp: Date.now()
  };

  try {
    window.history.pushState(nextState, '', targetUrl);
  } catch (e) {
    console.warn('[Navigation] Could not pushState to history:', e);
  }
}

/**
 * Reads the contextual state from window.history or location.
 */
export function getNavigationState(): NavigationState | null {
  if (typeof window === 'undefined') return null;
  return (window.history.state as NavigationState) || null;
}

/**
 * Gets the 'from' origin route or tab from navigation state.
 */
export function getNavigationOrigin(fallback: string = '/inventory'): string {
  const state = getNavigationState();
  return state?.from || state?.originTab || fallback;
}

/**
 * Contextual back handler:
 * 1. If a custom callback is provided, executes it.
 * 2. If state.from exists and window.history is available, returns contextually.
 * 3. Falls back safely to window.history.back() or fallback URL.
 */
export function navigateContextualBack(options?: {
  from?: string;
  fallback?: string;
  onNavigate?: (destination: string) => void;
}): void {
  const from = options?.from || getNavigationOrigin(options?.fallback || '/inventory');

  if (options?.onNavigate) {
    options.onNavigate(from);
    return;
  }

  if (typeof window !== 'undefined') {
    if (window.history.length > 1) {
      window.history.back();
    } else if (from) {
      window.location.href = from;
    }
  }
}

export { useNavigate } from '../hooks/useNavigate';
