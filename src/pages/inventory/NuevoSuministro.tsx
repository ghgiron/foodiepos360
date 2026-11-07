// src/pages/inventory/NuevoSuministro.tsx
import { useNavigate } from '../../hooks/useNavigate';
import SupplyOnboardingForm from '../../components/supplyOnboardingForm';
import { getNavigationState } from '../../utils/navigation';
import type { VoiceIngredientExtraction } from '../../types/voiceCopilot';

export default function NuevoSuministro({ 
  onBack,
  prefillData 
}: { 
  onBack?: () => void;
  prefillData?: VoiceIngredientExtraction | null;
}) {
  const navigate = useNavigate();
  const handleBack = onBack || (() => navigate(-1));
  const initialPrefill = prefillData || (getNavigationState()?.prefillData as VoiceIngredientExtraction) || null;
  return <SupplyOnboardingForm onBack={handleBack} prefillData={initialPrefill} />;
}
