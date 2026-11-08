// src/pages/inventory/EntradasCompras.tsx
import PurchaseOrderForm from '../../components/purchaseOrderForm';

interface EntradasComprasProps {
  initialSupplierId?: string;
  initialItems?: any[];
  initialPurchaseOrderId?: string;
  onComplete?: () => void;
  onNavigateSection?: (section: 'INVENTORY_RECEIPTS' | 'INVENTORY_ALERTS' | 'PURCHASE_ORDERS_HISTORY') => void;
}

/**
 * [US-10A] / [US-09B] / [US-09C] Envoltorio de página para la pantalla de Entradas Inteligentes (Compras).
 * Conecta la precarga de órdenes de compra, asentamiento en Kardex y resolución de insumos nuevos.
 */
export default function EntradasCompras({
  initialSupplierId,
  initialItems,
  initialPurchaseOrderId,
  onComplete,
  onNavigateSection
}: EntradasComprasProps) {
  return (
    <PurchaseOrderForm
      initialSupplierId={initialSupplierId}
      initialItems={initialItems}
      initialPurchaseOrderId={initialPurchaseOrderId}
      onComplete={onComplete}
      onNavigateSection={onNavigateSection}
    />
  );
}

