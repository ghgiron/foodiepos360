// src/pages/inventory/NuevoIngrediente.tsx
import { useNavigate } from '../../hooks/useNavigate';
import InventoryOnboardingForm from '../../components/inventoryOnboardingForm';
import { getNavigationState } from '../../utils/navigation';
import type { VoiceIngredientExtraction } from '../../types/voiceCopilot';

export default function NuevoIngrediente({ 
  onBack,
  prefillData 
}: { 
  onBack?: () => void;
  prefillData?: VoiceIngredientExtraction | null;
}) {
  const navigate = useNavigate();
  const handleBack = onBack || (() => navigate(-1));
  const initialPrefill = prefillData || (getNavigationState()?.prefillData as VoiceIngredientExtraction) || null;
  return <InventoryOnboardingForm type="INGREDIENT" onBack={handleBack} prefillData={initialPrefill} />;
}
