// src/pages/inventory/EditarIngrediente.tsx
import { useNavigate } from '../../hooks/useNavigate';
import EditarIngredienteForm from '../../components/EditarIngredienteForm';

interface EditarIngredienteProps {
  editItemId?: string | null;
  onBack?: () => void;
}

export default function EditarIngrediente({ editItemId, onBack }: EditarIngredienteProps) {
  const navigate = useNavigate();
  const handleBack = onBack || (() => navigate(-1));
  return <EditarIngredienteForm editItemId={editItemId} onBack={handleBack} />;
}
