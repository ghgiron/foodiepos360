// src/pages/inventory/NuevoProductoUnico.tsx
import { useNavigate } from '../../hooks/useNavigate';
import InventoryOnboardingForm from '../../components/inventoryOnboardingForm';
import { getNavigationState } from '../../utils/navigation';
import type { VoiceIngredientExtraction } from '../../types/voiceCopilot';

export default function NuevoProductoUnico({ 
  onBack,
  prefillData 
}: { 
  onBack?: () => void;
  prefillData?: VoiceIngredientExtraction | null;
}) {
  const navigate = useNavigate();
  const handleBack = onBack || (() => navigate(-1));
  const initialPrefill = prefillData || (getNavigationState()?.prefillData as VoiceIngredientExtraction) || null;
  return <InventoryOnboardingForm type="PRODUCT" onBack={handleBack} prefillData={initialPrefill} />;
}
