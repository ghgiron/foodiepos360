import { describe, it, expect } from 'vitest';
import { getEffectiveImpoconsumoRate } from '../types/settings';

describe('getEffectiveImpoconsumoRate Selector', () => {
  it('returns 8 by default when settings are null or undefined', () => {
    expect(getEffectiveImpoconsumoRate(null)).toBe(8);
    expect(getEffectiveImpoconsumoRate(undefined)).toBe(8);
    expect(getEffectiveImpoconsumoRate({})).toBe(8);
  });

  it('returns 0 when enableImpoconsumo is false (Régimen No Responsable)', () => {
    expect(getEffectiveImpoconsumoRate({ enableImpoconsumo: false, impoconsumoRate: 8 })).toBe(0);
    expect(getEffectiveImpoconsumoRate({ enableImpoconsumo: false, taxPercentage: 8 })).toBe(0);
    expect(getEffectiveImpoconsumoRate({ enableImpoconsumo: false })).toBe(0);
  });

  it('returns configured impoconsumoRate when enableImpoconsumo is true', () => {
    expect(getEffectiveImpoconsumoRate({ enableImpoconsumo: true, impoconsumoRate: 8 })).toBe(8);
    expect(getEffectiveImpoconsumoRate({ enableImpoconsumo: true, impoconsumoRate: 10 })).toBe(10);
    expect(getEffectiveImpoconsumoRate({ enableImpoconsumo: true, taxPercentage: 12 })).toBe(12);
  });

  it('preserves legacy taxPercentage if impoconsumoRate is absent', () => {
    expect(getEffectiveImpoconsumoRate({ taxPercentage: 8 })).toBe(8);
    expect(getEffectiveImpoconsumoRate({ taxPercentage: 0 })).toBe(0);
  });
});
