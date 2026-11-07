import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  pushNavigationState,
  getNavigationState,
  getNavigationOrigin,
  navigateContextualBack
} from './navigation';

describe('Navigation and Contextual History State', () => {
  beforeEach(() => {
    // Reset window history state
    window.history.replaceState(null, '', '/inventory');
  });

  it('should push navigation state with from origin path', () => {
    pushNavigationState('/inventory/view/ing-001', {
      from: '/inventory/dashboard',
      originTab: 'INVENTORY_DASHBOARD',
      itemId: 'ing-001'
    });

    const state = getNavigationState();
    expect(state).not.toBeNull();
    expect(state?.from).toBe('/inventory/dashboard');
    expect(state?.originTab).toBe('INVENTORY_DASHBOARD');
    expect(state?.itemId).toBe('ing-001');
  });

  it('should retrieve navigation origin from state or fallback', () => {
    pushNavigationState('/inventory/edit/ing-002', {
      from: '/inventory/onboarding',
      originTab: 'INVENTORY_ONBOARDING'
    });

    const origin = getNavigationOrigin('/inventory');
    expect(origin).toBe('/inventory/onboarding');
  });

  it('should return fallback if no state exists', () => {
    window.history.replaceState(null, '', '/');
    const origin = getNavigationOrigin('/inventory/dashboard');
    expect(origin).toBe('/inventory/dashboard');
  });

  it('should execute onNavigate callback when provided in navigateContextualBack', () => {
    pushNavigationState('/inventory/view/ing-003', {
      from: '/inventory/pre-verification',
      originTab: 'INVENTORY_ONBOARDING'
    });

    const onNavigate = vi.fn();
    navigateContextualBack({ onNavigate });

    expect(onNavigate).toHaveBeenCalledWith('/inventory/pre-verification');
  });
});
