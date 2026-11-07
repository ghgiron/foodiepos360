import { describe, it, expect } from 'vitest';
import { normalizeSearchText, flexibleMultiMatch, filterByFlexibleSearch } from './searchEngine';

describe('searchEngine utility', () => {
  describe('normalizeSearchText', () => {
    it('normalizes accents and diacritics', () => {
      expect(normalizeSearchText('Hamburguesa Pícara con Limón')).toBe('hamburguesa picara con limon');
      expect(normalizeSearchText('Café, Té & Güisqui')).toBe('cafe te guisqui');
    });

    it('removes punctuation and orthographic symbols', () => {
      expect(normalizeSearchText('¿¡Hamburguesa... Pícara (Especial)!?')).toBe('hamburguesa picara especial');
      expect(normalizeSearchText('Item #123 / SKU-456_A+B')).toBe('item 123 sku 456 a b');
    });

    it('collapses multiple spaces and trims', () => {
      expect(normalizeSearchText('   muchos    espacios   aqui   ')).toBe('muchos espacios aqui');
    });

    it('handles null and undefined gracefully', () => {
      expect(normalizeSearchText(null)).toBe('');
      expect(normalizeSearchText(undefined)).toBe('');
      expect(normalizeSearchText('')).toBe('');
    });
  });

  describe('flexibleMultiMatch', () => {
    it('matches when query is empty or whitespace', () => {
      expect(flexibleMultiMatch(['Hamburguesa'], '')).toBe(true);
      expect(flexibleMultiMatch(['Hamburguesa'], '   ')).toBe(true);
      expect(flexibleMultiMatch(['Hamburguesa'], null)).toBe(true);
      expect(flexibleMultiMatch(['Hamburguesa'], undefined)).toBe(true);
    });

    it('matches regardless of word order', () => {
      expect(flexibleMultiMatch(['Hamburguesa Pícara'], 'picara hamburguesa')).toBe(true);
      expect(flexibleMultiMatch(['Hamburguesa Pícara'], 'hamburguesa picara')).toBe(true);
      expect(flexibleMultiMatch(['Hamburguesa Pícara Clásica'], 'clasica picara')).toBe(true);
    });

    it('matches partial tokens (prefixes / substrings)', () => {
      expect(flexibleMultiMatch(['Hamburguesa Pícara'], 'pi')).toBe(true);
      expect(flexibleMultiMatch(['Hamburguesa Pícara'], 'ham pic')).toBe(true);
    });

    it('searches across multiple target fields', () => {
      const name = 'Mojito Cubano';
      const category = 'Coctelería de Autor';
      const sku = 'COC-001';
      const description = 'Hierbabuena fresca, ron y soda';

      expect(flexibleMultiMatch([name, category, sku, description], 'mojito autor')).toBe(true);
      expect(flexibleMultiMatch([name, category, sku, description], 'ron hierbabuena')).toBe(true);
      expect(flexibleMultiMatch([name, category, sku, description], 'coc 001 mojito')).toBe(true);
      expect(flexibleMultiMatch([name, category, sku, description], 'mojito vodka')).toBe(false);
    });

    it('handles null/undefined target values seamlessly', () => {
      expect(flexibleMultiMatch([null, undefined, 'Salmón Grillé'], 'salmon')).toBe(true);
      expect(flexibleMultiMatch([null, undefined], 'algo')).toBe(false);
    });
  });

  describe('filterByFlexibleSearch', () => {
    const catalog = [
      { id: '1', name: 'Hamburguesa Pícara', category: 'Burgers' },
      { id: '2', name: 'Papas Rústicas', category: 'Entradas' },
      { id: '3', name: 'Cerveza Corona', category: 'Bebidas' },
    ];

    it('filters accurately with multiple terms and accents', () => {
      const results = filterByFlexibleSearch(catalog, item => [item.name, item.category], 'burgers picara');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Hamburguesa Pícara');
    });

    it('returns all items when search is empty', () => {
      const results = filterByFlexibleSearch(catalog, item => [item.name, item.category], '');
      expect(results).toHaveLength(3);
    });
  });
});
