// src/components/SyncStatusBadge.tsx
import React, { useState } from 'react';
import { useSyncStatus, type SyncStatus } from '../services/syncService';
import { SyncDiagnosticsModal } from './sync/SyncDiagnosticsModal';

interface StatusBadgeStyle {
  label: string;
  icon: string;
  badgeClass: string;
  dotClass: string;
  title: string;
}

const STATUS_CONFIGS: Record<SyncStatus, (pendingCount: number, errorMsg?: string | null) => StatusBadgeStyle> = {
  SYNCHRONIZED: () => ({
    label: 'Sincronizado',
    icon: 'cloud_done',
    badgeClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20',
    dotClass: 'bg-emerald-500',
    title: 'Datos sincronizados en tiempo real entre Dexie y Firestore'
  }),
  SYNCING: (pending) => ({
    label: pending > 0 ? `Sincronizando (${pending})` : 'Sincronizando...',
    icon: 'sync',
    badgeClass: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20 hover:bg-indigo-500/20',
    dotClass: 'bg-indigo-500 animate-ping',
    title: 'Guardado local en Dexie. Sincronizando con Firestore en segundo plano'
  }),
  LOCAL_AHEAD: () => ({
    label: 'Pendiente subir',
    icon: 'cloud_upload',
    badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 hover:bg-amber-500/20',
    dotClass: 'bg-amber-500',
    title: 'Existen registros locales pendientes de sincronizar con Firebase Firestore'
  }),
  REMOTE_AHEAD: () => ({
    label: 'Pendiente bajar',
    icon: 'cloud_download',
    badgeClass: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20 hover:bg-indigo-500/20',
    dotClass: 'bg-indigo-500',
    title: 'Existen registros nuevos en la nube pendientes de hidratar en Dexie.js'
  }),
  OFFLINE: () => ({
    label: 'Modo Local (Offline)',
    icon: 'cloud_off',
    badgeClass: 'bg-raised text-content-secondary border-line hover:bg-surface',
    dotClass: 'bg-neutral-500',
    title: 'Sin conexión. Todo se guarda localmente en IndexedDB y se sincronizará al conectar'
  }),
  ERROR: (_, errorMsg) => ({
    label: 'Sync pendiente',
    icon: 'cloud_sync',
    badgeClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 hover:bg-rose-500/20',
    dotClass: 'bg-rose-500 animate-pulse',
    title: errorMsg || 'Error de conexión con la nube. Reintentando...'
  })
};

export const SyncStatusBadge: React.FC = () => {
  const syncInfo = useSyncStatus();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const statusKey: SyncStatus = syncInfo.status in STATUS_CONFIGS ? syncInfo.status : 'SYNCHRONIZED';
  const getBadgeStyle = STATUS_CONFIGS[statusKey] || STATUS_CONFIGS.SYNCHRONIZED;
  const config = getBadgeStyle(syncInfo.pendingCount, syncInfo.errorMessage);

  const isSyncing = syncInfo.status === 'SYNCING';

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        type="button"
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all duration-200 cursor-pointer select-none active:scale-95 ${config.badgeClass}`}
        title={`${config.title} (Clic para abrir Centro de Sincronización y Diagnóstico)`}
        aria-label={`Estado de sincronización: ${config.label}`}
      >
        <span className="relative flex h-2 w-2">
          <span className={`relative inline-flex rounded-full h-2 w-2 ${config.dotClass}`} />
        </span>
        <span className={`material-symbols-outlined text-sm font-bold ${isSyncing ? 'animate-spin' : ''}`}>
          {config.icon}
        </span>
        <span className="hidden sm:inline-block font-medium tracking-tight">
          {config.label}
        </span>
      </button>

      <SyncDiagnosticsModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
};
