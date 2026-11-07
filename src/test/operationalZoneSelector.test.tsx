// src/test/operationalZoneSelector.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import InventoryOnboardingForm from '../components/inventoryOnboardingForm';
import SupplyOnboardingForm from '../components/supplyOnboardingForm';
import { VoiceCopilotProvider } from '../context/VoiceCopilotContext';
import { db } from '../db/localDb';
import toast from 'react-hot-toast';

vi.mock('../db/localDb', () => ({
  db: {
    systemSettings: {
      toArray: vi.fn().mockResolvedValue([])
    },
    supplyCategories: {
      toArray: vi.fn().mockResolvedValue([])
    },
    inventoryCategories: {
      toArray: vi.fn().mockResolvedValue([])
    },
    suppliers: {
      toArray: vi.fn().mockResolvedValue([])
    },
    inventoryItems: {
      toArray: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue('ok'),
      add: vi.fn().mockResolvedValue('ok')
    }
  },
  enqueueOfflineEvent: vi.fn()
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn()
  }
}));

describe('Operational Zone UI / UX across Onboarding Forms', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders "ZONA DE OPERACIÓN / PRODUCCIÓN" selector in INGREDIENT mode', async () => {
    render(
      <VoiceCopilotProvider initialMode="INGREDIENT">
        <InventoryOnboardingForm type="INGREDIENT" onBack={() => {}} />
      </VoiceCopilotProvider>
    );

    const label = screen.getByText(/ZONA DE OPERACIÓN \/ PRODUCCIÓN/i);
    expect(label).toBeDefined();

    const placeholder = screen.getByText(/Seleccionar estación operativa\.\.\./i);
    expect(placeholder).toBeDefined();

    // Click selector to open dropdown
    fireEvent.click(placeholder);

    // Verify all 5 standardized zones are displayed
    await waitFor(() => {
      expect(screen.getByText('Cocina')).toBeDefined();
      expect(screen.getByText('Bar')).toBeDefined();
      expect(screen.getByText('Licuadoras / Batidos')).toBeDefined();
      expect(screen.getByText('Salón y Servicio')).toBeDefined();
      expect(screen.getByText('General / Almacén / Suministros')).toBeDefined();
    });
  });

  it('renders "ZONA DE OPERACIÓN / PRODUCCIÓN" selector in PRODUCT mode', async () => {
    render(
      <VoiceCopilotProvider initialMode="PRODUCT">
        <InventoryOnboardingForm type="PRODUCT" onBack={() => {}} />
      </VoiceCopilotProvider>
    );

    const label = screen.getByText(/ZONA DE OPERACIÓN \/ PRODUCCIÓN/i);
    expect(label).toBeDefined();
  });

  it('renders "ZONA DE OPERACIÓN / PRODUCCIÓN" selector in SUPPLY mode', async () => {
    render(
      <VoiceCopilotProvider initialMode="SUPPLY">
        <SupplyOnboardingForm onBack={() => {}} />
      </VoiceCopilotProvider>
    );

    const label = screen.getByText(/ZONA DE OPERACIÓN \/ PRODUCCIÓN/i);
    expect(label).toBeDefined();
  });

  it('validates operationalZone as required before saving in INGREDIENT mode', async () => {
    render(
      <VoiceCopilotProvider initialMode="INGREDIENT">
        <InventoryOnboardingForm type="INGREDIENT" onBack={() => {}} />
      </VoiceCopilotProvider>
    );

    // Find and fill the name field
    const nameInput = screen.getByPlaceholderText(/ej\. Pechuga de Pollo Fresca/i);
    fireEvent.change(nameInput, { target: { value: 'Tomate Chonto' } });

    // Click submit button (Guardar)
    const submitBtn = screen.getByRole('button', { name: /guardar ingrediente/i });
    fireEvent.click(submitBtn);

    // Should show error toast for missing operational zone
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Zona de Operación es obligatoria.');
    });

    // Dexie put should not have been called
    expect(db.inventoryItems.put).not.toHaveBeenCalled();
  });
});
