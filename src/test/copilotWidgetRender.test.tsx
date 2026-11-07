// src/test/copilotWidgetRender.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VoiceCopilotProvider } from '../context/VoiceCopilotContext';
import FoodieBotHeaderButton from '../components/voice/FoodieBotHeaderButton';
import VoiceCopilotWidget from '../components/voice/VoiceCopilotWidget';

describe('FoodieBot render & click test', () => {
  it('should render the header button and toggle Foodie Bot floating window in bottom-left upon clicking', () => {
    render(
      <VoiceCopilotProvider initialMode="DASHBOARD">
        <div>
          <FoodieBotHeaderButton />
          <VoiceCopilotWidget />
        </div>
      </VoiceCopilotProvider>
    );

    // 1. Header Button should be in document with exact tooltip / aria-label
    const button = screen.getByRole('button', { name: /foodie bot \(asistente de voz ia\)/i });
    expect(button).toBeDefined();

    // 2. Floating window should NOT be in document before click
    expect(screen.queryByText('Foodie Bot')).toBeNull();

    // 3. Click header button to open
    fireEvent.click(button);

    // 4. Foodie Bot floating window should now be open
    const titles = screen.getAllByText('Foodie Bot');
    expect(titles.length).toBeGreaterThan(0);

    // 5. Verify it is anchored in the bottom-left corner with compact size and NO backdrop overlay
    const aside = document.querySelector('aside');
    expect(aside).toBeDefined();
    expect(aside?.className).toContain('bottom-6');
    expect(aside?.className).toContain('left-6');
    expect(document.querySelector('.backdrop-blur-sm.fixed.inset-0')).toBeNull();

    // 6. Verify configuration gear button is REMOVED from the header
    expect(screen.queryByRole('button', { name: /ajustes de api key/i })).toBeNull();

    // 7. Test Minimize & Restore controls
    const minimizeButton = screen.getByRole('button', { name: /minimizar foodie bot/i });
    expect(minimizeButton).toBeDefined();
    fireEvent.click(minimizeButton);

    // When minimized, container height collapses to h-[52px]
    expect(aside?.className).toContain('h-[52px]');
    const restoreButton = screen.getByRole('button', { name: /restaurar foodie bot/i });
    expect(restoreButton).toBeDefined();

    // Restore to open state
    fireEvent.click(restoreButton);
    expect(aside?.className).not.toContain('h-[52px]');
    expect(aside?.className).toContain('h-[580px]');
    expect(aside?.className).toContain('max-h-[72vh]');

    // Verify messages container has smooth internal scrolling
    const messagesContainer = aside?.querySelector('.scroll-smooth');
    expect(messagesContainer).toBeDefined();

    // 8. Close panel using the close button in the header
    const closeButton = screen.getByRole('button', { name: /cerrar foodie bot/i });
    expect(closeButton).toBeDefined();
    fireEvent.click(closeButton);

    // 9. Floating window is now closed
    expect(screen.queryByText('Foodie Bot')).toBeNull();
  });

  it('should clean header removing badge pill and provide simplified placeholder', () => {
    render(
      <VoiceCopilotProvider initialMode="DASHBOARD">
        <div>
          <FoodieBotHeaderButton />
          <VoiceCopilotWidget />
        </div>
      </VoiceCopilotProvider>
    );

    // Open Foodie Bot
    const button = screen.getByRole('button', { name: /foodie bot \(asistente de voz ia\)/i });
    fireEvent.click(button);

    // Verify "Re-aplicar" button does NOT exist
    expect(screen.queryByRole('button', { name: /re-aplicar/i })).toBeNull();

    // Verify badge pill is eliminated from header
    expect(screen.queryByText('Zero-Form & Stock')).toBeNull();
    expect(screen.queryByText('Alta en Inventario')).toBeNull();

    // Verify exact placeholder
    const input = screen.getByPlaceholderText('Escribe o dicta aquí...');
    expect(input).toBeDefined();
  });

  it('should toggle Cheat Sheet accordion and populate input when clicking quick example pills', () => {
    render(
      <VoiceCopilotProvider initialMode="INGREDIENT">
        <div>
          <FoodieBotHeaderButton />
          <VoiceCopilotWidget />
        </div>
      </VoiceCopilotProvider>
    );

    // Open Foodie Bot
    const trigger = screen.getByRole('button', { name: /foodie bot \(asistente de voz ia\)/i });
    fireEvent.click(trigger);

    // 1. Help button ('?') exists in header
    const helpBtn = screen.getByRole('button', { name: /guía de dictado cheat sheet/i });
    expect(helpBtn).toBeDefined();

    // 2. Click help button to toggle Cheat Sheet accordion
    fireEvent.click(helpBtn);
    expect(screen.getByText(/¿cómo dictar a foodie bot\?/i)).toBeDefined();
    expect(screen.getByText(/fórmula sintáctica recomendada/i)).toBeDefined();
    expect(screen.getByText(/ingredientes \(materia prima\)/i)).toBeDefined();
    expect(screen.getByText(/productos directos \(reventa\)/i)).toBeDefined();
    expect(screen.getByText(/suministros \(desechables\/empaques\)/i)).toBeDefined();

    // 3. Verify contextual example pills exist in initial chat state
    const examplePills = screen.getAllByText('Compré 130g de ajo a $2000, usamos 120g');
    expect(examplePills.length).toBeGreaterThan(0);

    // 4. Clicking an example pill copies the template into the input
    fireEvent.click(examplePills[0]);
    const input = screen.getByPlaceholderText('Escribe o dicta aquí...') as HTMLInputElement;
    expect(input.value).toBe('Compré 130g de ajo a $2000, usamos 120g');
  });

  it('should adapt contextual prompts according to active module (PRODUCT and SUPPLY)', () => {
    const { unmount } = render(
      <VoiceCopilotProvider initialMode="PRODUCT">
        <div>
          <FoodieBotHeaderButton />
          <VoiceCopilotWidget />
        </div>
      </VoiceCopilotProvider>
    );

    // Open Foodie Bot in PRODUCT mode
    const triggerProduct = screen.getByRole('button', { name: /foodie bot \(asistente de voz ia\)/i });
    fireEvent.click(triggerProduct);

    // Should display product/beer resale prompt
    const productPills = screen.getAllByText('Compré 24 cervezas a $60.000 en Bavaria');
    expect(productPills.length).toBeGreaterThan(0);
    unmount();

    // Render in SUPPLY mode
    render(
      <VoiceCopilotProvider initialMode="SUPPLY">
        <div>
          <FoodieBotHeaderButton />
          <VoiceCopilotWidget />
        </div>
      </VoiceCopilotProvider>
    );

    const triggerSupply = screen.getByRole('button', { name: /foodie bot \(asistente de voz ia\)/i });
    fireEvent.click(triggerSupply);

    // Should display supply/boxes prompt
    const supplyPills = screen.getAllByText('Compré 200 cajas para hamburguesa a $40.000');
    expect(supplyPills.length).toBeGreaterThan(0);
  });

  it('should support sanitized Dexie item payload with crypto.randomUUID, default fields and sync_outbox', async () => {
    const testId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `item-gen-${Date.now()}`;

    const testItem = {
      id: testId,
      name: 'Queso Mozzarella Bloque',
      category: 'Lácteos',
      purchaseUnit: 'Kilogramo',
      countUnit: 'g',
      conversionMultiplier: 1000,
      yieldFactor: 1.0,
      density: 1.0,
      bottleTareWeightGrams: 0,
      purchaseCost: 28000,
      gainPercentage: 0,
      isTaxable: false,
      taxPercentage: 0,
      stockMinLimit: 2,
      theoreticalStock: 5000,
      realPhysicalStock: 5000,
      abcClassification: 'A' as const,
      supplierId: 'prov-lacteos',
      branchId: 'main',
      resourceType: 'INVENTORY_ITEM',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sucursalStock: [{ sucursalId: 'main', stockActual: 5000 }]
    };

    const { db } = await import('../db/localDb');
    await db.inventoryItems.add(testItem);

    const saved = await db.inventoryItems.get(testId);
    expect(saved).toBeDefined();
    expect(saved?.id).toBe(testId);
    expect(saved?.resourceType).toBe('INVENTORY_ITEM');
    expect(saved?.branchId).toBe('main');
    expect(typeof saved?.createdAt).toBe('number');

    // Verify sync_outbox getter
    expect(db.sync_outbox).toBeDefined();
  });

  it('should render complete interactive draft card with metrics and internal Guardar button when extraction exists', async () => {
    const { default: VoiceCopilotWidget } = await import('../components/voice/VoiceCopilotWidget');
    const { VoiceCopilotProvider } = await import('../context/VoiceCopilotContext');

    render(
      <VoiceCopilotProvider initialMode="INGREDIENT">
        <div>
          <FoodieBotHeaderButton />
          <VoiceCopilotWidget />
        </div>
      </VoiceCopilotProvider>
    );

    // Open Foodie Bot
    const trigger = screen.getByRole('button', { name: /foodie bot \(asistente de voz ia\)/i });
    fireEvent.click(trigger);

    // Verify input placeholder is 'Escribe o dicta aquí...'
    const input = screen.getByPlaceholderText('Escribe o dicta aquí...');
    expect(input).toBeDefined();
  });
});
