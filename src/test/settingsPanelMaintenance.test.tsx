// src/test/settingsPanelMaintenance.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SettingsPanel from '../components/settingsPanel';
import * as databaseReset from '../utils/databaseReset';
import toast from 'react-hot-toast';

vi.mock('../db/localDb', () => ({
  db: {
    systemSettings: {
      get: vi.fn().mockResolvedValue(null),
      toArray: vi.fn().mockResolvedValue([])
    },
    orders: { count: vi.fn().mockResolvedValue(12), clear: vi.fn() },
    clients: { count: vi.fn().mockResolvedValue(4), clear: vi.fn() },
    inventoryItems: { count: vi.fn().mockResolvedValue(25), clear: vi.fn() },
    inventoryLogs: { count: vi.fn().mockResolvedValue(30), clear: vi.fn() },
    operationalLosses: { count: vi.fn().mockResolvedValue(3), clear: vi.fn() },
    domainOutbox: { count: vi.fn().mockResolvedValue(0), clear: vi.fn() },
    reservas: { count: vi.fn().mockResolvedValue(2), clear: vi.fn() },
    suppliers: { count: vi.fn().mockResolvedValue(5), clear: vi.fn() },
    kdsLowStockAlertsHistory: { count: vi.fn().mockResolvedValue(1), clear: vi.fn() },
    kdsProductPrepHistory: { count: vi.fn().mockResolvedValue(8), clear: vi.fn() }
  }
}));

vi.mock('../db/settingsStore', () => ({
  getSystemSetting: vi.fn().mockImplementation((key, fallback) => {
    if (fallback !== undefined) return Promise.resolve(fallback);
    if (key === 'tax_options') return Promise.resolve([0, 8, 19]);
    if (key === 'master_allergens') return Promise.resolve([]);
    if (key === 'master_categories') return Promise.resolve([]);
    if (key === 'operating_zones') return Promise.resolve([]);
    if (key === 'asset_categories') return Promise.resolve([]);
    if (key === 'asset_locations') return Promise.resolve([]);
    if (key === 'taxPercentage') return Promise.resolve(8);
    if (key === 'safetyMarginPercentage') return Promise.resolve(5);
    if (key === 'operationalCostPercentage') return Promise.resolve(10);
    if (key === 'min_utility_margin') return Promise.resolve(30);
    return Promise.resolve([]);
  }),
  saveSystemSetting: vi.fn().mockResolvedValue(undefined),
  DEFAULT_SETTINGS: {
    ipoconsumo_pct: 8,
    error_margin_pct: 5,
    operationalCostPercentage: 10,
    min_utility_margin: 30,
    min_stock_alert_threshold: 5,
    profitabilityThresholdHigh: 60,
    profitabilityThresholdMedium: 30,
    kds_urgent_threshold_minutes: 15,
    official_units: ['g', 'kg'],
    unit_equivalences: {},
    supply_categories: [],
    ingredient_categories: [],
    operating_zones: [],
    tax_options: [0, 8, 19],
    asset_categories: [],
    asset_locations: [],
    system_branches: [],
    waste_reasons: [],
    production_zones: [],
    salon_tables: []
  }
}));

vi.mock('../utils/geminiConfig', () => ({
  getGeminiApiKey: vi.fn().mockReturnValue(''),
  setGeminiApiKey: vi.fn(),
  getGroqApiKey: vi.fn().mockReturnValue(''),
  setGroqApiKey: vi.fn(),
  getActiveAIProvider: vi.fn().mockReturnValue('groq'),
  setActiveAIProvider: vi.fn(),
  isVoiceFeedbackEnabled: vi.fn().mockReturnValue(false),
  setVoiceFeedbackEnabled: vi.fn()
}));

vi.mock('../services/geminiCopilotService', () => ({
  testGeminiApiKey: vi.fn().mockResolvedValue({ success: true, message: 'OK' })
}));

vi.mock('../services/groqCopilotService', () => ({
  testGroqApiKey: vi.fn().mockResolvedValue({ success: true, message: 'OK' })
}));

vi.mock('react-hot-toast', () => {
  const toastObj = {
    success: vi.fn(),
    error: vi.fn()
  };
  return {
    default: toastObj,
    toast: toastObj
  };
});

describe('SettingsPanel - Zona de Mantenimiento / Base de Datos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the maintenance section and purge button in settings panel', () => {
    render(<SettingsPanel />);

    expect(screen.getByText(/Zona de Mantenimiento \/ Base de Datos/i)).toBeDefined();
    expect(
      screen.getByText(/Herramientas avanzadas de depuración, optimización y vaciado atómico de datos de prueba operacionales\./i)
    ).toBeDefined();

    const purgeBtn = screen.getByTestId('btn-purge-operational-data');
    expect(purgeBtn).toBeDefined();
    expect(purgeBtn.textContent).toContain('Purgar Datos de Prueba y Operacionales');
  });

  it('opens double confirmation modal and blocks confirmation until safety checkbox is checked', async () => {
    const onNavigate = vi.fn();
    const resetSpy = vi.spyOn(databaseReset, 'resetOperationalData').mockResolvedValue({
      success: true,
      timestamp: new Date().toISOString(),
      clearedStats: {
        orders: 12,
        customers: 4,
        reservations: 2,
        suppliers: 5,
        inventoryItems: 25,
        inventoryMovements: 30,
        operationalLosses: 3,
        stockAlerts: 1,
        syncOutbox: 0,
        prepHistory: 8,
        totalRecords: 90
      },
      clearedStorageKeys: []
    });

    render(<SettingsPanel onNavigateToDashboard={onNavigate} />);

    // 1. Click open purge modal
    const purgeBtn = screen.getByTestId('btn-purge-operational-data');
    fireEvent.click(purgeBtn);

    // 2. Modal header and description displayed
    expect(screen.getByText('Confirmar Purga de Datos de Prueba')).toBeDefined();
    expect(
      screen.getByText(
        'Esta acción eliminará pedidos, clientes, pérdidas operativas e inventario de prueba. La configuración y API keys se mantendrán intactas.'
      )
    ).toBeDefined();

    // 3. Confirm button initially disabled
    const confirmBtn = screen.getByRole('button', { name: /confirmar y purgar datos/i }) as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);

    // 4. Check safety confirmation box
    const checkbox = screen.getByTestId('checkbox-purge-confirmation');
    fireEvent.click(checkbox);

    // 5. Button should now be enabled
    expect(confirmBtn.disabled).toBe(false);

    // 6. Click Confirm Purge
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(resetSpy).toHaveBeenCalledTimes(1);
      expect(toast.success).toHaveBeenCalledWith(
        expect.stringContaining('Purga completada: 90 registros operacionales eliminados'),
        expect.anything()
      );
      expect(onNavigate).toHaveBeenCalledTimes(1);
    });
  });
});
