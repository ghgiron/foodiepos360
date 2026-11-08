// src/pages/inventory/AlertasDeStock.tsx
import InventoryAlerts from '../../components/inventoryAlerts';
import { useNavigate } from '../../hooks/useNavigate';

interface AlertasDeStockProps {
  initialFilter?: {
    level?: 'Crítico' | 'Bajo' | 'ALL';
    type?: 'Stock' | 'Vencimiento' | 'Mantenimiento' | 'ALL';
  } | null;
  onClearFilter?: () => void;
  onNavigateToPurchaseOrder?: (draft: { supplierId?: string; items?: any[]; purchaseOrderId?: string }) => void;
  onNavigateSection?: (section: 'INVENTORY_RECEIPTS' | 'INVENTORY_ALERTS' | 'PURCHASE_ORDERS_HISTORY') => void;
}

/**
 * [US-09] / [US-09B] / [US-09C] Envoltorio de página para la consola de Alertas de Stock Crítico y Compras.
 * Conecta la navegación hacia /inventario/compras?orderId=... preservando estado y query params.
 */
export default function AlertasDeStock({
  initialFilter,
  onClearFilter,
  onNavigateToPurchaseOrder,
  onNavigateSection
}: AlertasDeStockProps) {
  const navigate = useNavigate();

  const handleNavigateToPurchaseOrder = (draft: { supplierId?: string; items?: any[]; purchaseOrderId?: string }) => {
    if (draft.purchaseOrderId) {
      navigate(`/inventario/compras?orderId=${draft.purchaseOrderId}`, {
        state: { orderId: draft.purchaseOrderId }
      });
    }
    if (onNavigateToPurchaseOrder) {
      onNavigateToPurchaseOrder(draft);
    }
  };

  return (
    <InventoryAlerts
      initialFilter={initialFilter}
      onClearFilter={onClearFilter}
      onNavigateToPurchaseOrder={handleNavigateToPurchaseOrder}
      onNavigateSection={onNavigateSection}
    />
  );
}

