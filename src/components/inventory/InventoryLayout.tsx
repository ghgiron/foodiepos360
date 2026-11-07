// src/components/inventory/InventoryLayout.tsx
import React, { useEffect } from 'react';
import { VoiceCopilotProvider, useVoiceCopilot } from '../../context/VoiceCopilotContext';
import type { CopilotContextMode } from '../../types/voiceCopilot';

interface InventoryLayoutProps {
  children: React.ReactNode;
  activeContext?: CopilotContextMode;
  className?: string;
}

// Internal context to identify root provider layer
const LayoutNestingContext = React.createContext<boolean>(false);

function InnerInventoryLayout({ 
  children, 
  activeContext, 
  className 
}: InventoryLayoutProps) {
  const copilot = useVoiceCopilot();

  useEffect(() => {
    if (activeContext && copilot?.setMode) {
      copilot.setMode(activeContext);
    }
  }, [activeContext, copilot]);

  return (
    <LayoutNestingContext.Provider value={true}>
      <div className={className || "relative flex-1 flex flex-col h-full min-h-0 w-full"}>
        {children}
      </div>
    </LayoutNestingContext.Provider>
  );
}

export default function InventoryLayout(props: InventoryLayoutProps) {
  return (
    <VoiceCopilotProvider initialMode={props.activeContext}>
      <InnerInventoryLayout {...props} />
    </VoiceCopilotProvider>
  );
}
