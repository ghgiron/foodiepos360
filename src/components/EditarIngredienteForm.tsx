// src/components/EditarIngredienteForm.tsx
import { useNavigate } from '../hooks/useNavigate';
import InventoryOnboardingForm from './inventoryOnboardingForm';

export interface EditarIngredienteFormProps {
  editItemId?: string | null;
  onBack?: () => void;
}

/**
 * EditarIngredienteForm component
 * Wrapper around InventoryOnboardingForm specifically preset for INGREDIENT editing
 * with the universal unit conversion engine and cost calculation.
 */
export default function EditarIngredienteForm({ editItemId, onBack }: EditarIngredienteFormProps) {
  const navigate = useNavigate();
  const handleBack = onBack || (() => navigate(-1));
  return (
    <InventoryOnboardingForm
      type="INGREDIENT"
      editItemId={editItemId}
      onBack={handleBack}
    />
  );
}
