import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/localDb';
import type { Recipe } from '../types';

describe('Recipe Persistence and Reactive Dexie.js Deletion', () => {
  beforeEach(async () => {
    await db.recipes.clear();
  });

  it('should initialize with an empty recipe table and no mock data blocking mutation', async () => {
    const recipes = await db.recipes.toArray();
    expect(recipes.length).toBe(0);
  });

  it('should add, retrieve and reactively delete recipes from db.recipes', async () => {
    const newRecipe: Recipe = {
      id: 'rec-test-burrito-01',
      name: 'Burrito Ranchero',
      description: 'Burrito de carne con frijoles refritos y queso cheddar.',
      category: 'Platos Fuertes',
      costPrice: 8500,
      sellPrice: 26000,
      prepTime: 12,
      difficulty: 'Media',
      cmvPercentage: 32.69,
      isSubRecipe: false,
      isCombo: false,
      ingredients: [],
      yieldFactor: 1,
      updatedAt: new Date().toISOString()
    };

    await db.recipes.put(newRecipe);

    let list = await db.recipes.toArray();
    expect(list.length).toBe(1);
    expect(list[0].id).toBe('rec-test-burrito-01');
    expect(list[0].name).toBe('Burrito Ranchero');

    // Delete recipe
    await db.recipes.delete('rec-test-burrito-01');

    list = await db.recipes.toArray();
    expect(list.length).toBe(0);
  });

  it('should support cloning a recipe structure directly into Dexie.js', async () => {
    const baseRecipe: Recipe = {
      id: 'rec-base-01',
      name: 'Pizza Artesanal',
      description: 'Pizza con masa madre y mozzarella fresca.',
      category: 'Pizzas',
      costPrice: 12000,
      sellPrice: 38000,
      prepTime: 18,
      difficulty: 'Media',
      cmvPercentage: 31.57,
      isSubRecipe: false,
      isCombo: false,
      ingredients: [],
      yieldFactor: 1,
      updatedAt: new Date().toISOString()
    };

    await db.recipes.put(baseRecipe);

    const clonedId = `rec-pizza-copy-${Date.now().toString().slice(-4)}`;
    const clonedRecipe: Recipe = {
      ...baseRecipe,
      id: clonedId,
      name: `Copia de ${baseRecipe.name}`,
      updatedAt: new Date().toISOString()
    };

    await db.recipes.put(clonedRecipe);

    const all = await db.recipes.toArray();
    expect(all.length).toBe(2);
    expect(all.some(r => r.name === 'Copia de Pizza Artesanal')).toBe(true);
  });
});
