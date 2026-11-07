// src/pages/inventory/NuevoElementoInventario.tsx
import ItemOnboarding from '../../components/itemOnboarding';
import { navigateContextualBack } from '../../utils/navigation';

interface NuevoElementoInventarioProps {
  onBack?: () => void;
  editItemId?: string | null;
  editItemType?: 'PRODUCT' | 'INGREDIENT' | 'PACKAGING' | 'ASSET' | null;
  onEditItem?: (itemId: string, type: 'PRODUCT' | 'INGREDIENT' | 'PACKAGING' | 'ASSET') => void;
  onViewItem?: (itemId: string) => void;
}

export default function NuevoElementoInventario({ onBack, editItemId, editItemType, onEditItem, onViewItem }: NuevoElementoInventarioProps) {
  const handleBack = onBack || (() => navigateContextualBack({ fallback: '/inventory' }));
  return (
    <div className="flex flex-col flex-1 h-full min-h-full w-full">
      <ItemOnboarding
        onBack={handleBack}
        editItemId={editItemId}
        editItemType={editItemType}
        onEditItem={onEditItem}
        onViewItem={onViewItem}
      />
    </div>
  );
}
