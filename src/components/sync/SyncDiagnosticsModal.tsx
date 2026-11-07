// src/components/sync/SyncDiagnosticsModal.tsx
import React, { useState, useEffect } from 'react';
import { 
  useSyncStatus, 
  getDetailedSyncComparison, 
  pullDataFromFirestore, 
  pushDataToFirestore,
  forceResyncAll,
  subscribeSyncLogs,
  addSyncLog,
  type EntitySyncComparison,
  type SyncLogEntry
} from '../../services/syncService';
import { 
  getFirebaseConfig, 
  saveFirebaseConfig, 
  resetFirebaseConfig, 
  checkFirestoreHealth,
  type FirebaseAppConfig,
  type FirestoreHealthResult
} from '../../config/firebaseConfig';
import toast from 'react-hot-toast';

interface SyncDiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SyncDiagnosticsModal: React.FC<SyncDiagnosticsModalProps> = ({
  isOpen,
  onClose
}) => {
  const syncInfo = useSyncStatus();
  const [comparisons, setComparisons] = useState<EntitySyncComparison[]>([]);
  const [logs, setLogs] = useState<SyncLogEntry[]>([]);
  const [isLoadingMatrix, setIsLoadingMatrix] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [activeTab, setActiveTab] = useState<'matrix' | 'logs' | 'config'>('matrix');

  // Firebase Config State
  const [configForm, setConfigForm] = useState<FirebaseAppConfig>(() => getFirebaseConfig());
  const [healthStatus, setHealthStatus] = useState<FirestoreHealthResult | null>(null);
  const [isTestingHealth, setIsTestingHealth] = useState(false);

  const isOnline = typeof navigator !== 'undefined' && navigator.onLine;

  const loadMatrix = async () => {
    setIsLoadingMatrix(true);
    try {
      const data = await getDetailedSyncComparison();
      setComparisons(data);
    } catch (err) {
      console.error('[SyncDiagnosticsModal] Error loading matrix:', err);
    } finally {
      setIsLoadingMatrix(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadMatrix();
      setConfigForm(getFirebaseConfig());
      setHealthStatus(null);
    }
  }, [isOpen]);

  useEffect(() => {
    const unsub = subscribeSyncLogs(setLogs);
    return unsub;
  }, []);

  if (!isOpen) return null;

  const handleTestHealth = async () => {
    setIsTestingHealth(true);
    addSyncLog('INFO', `Ejecutando ping de diagnóstico a Firestore en proyecto "${configForm.projectId}"...`);
    const toastId = toast.loading('Comprobando conexión real con Firebase Firestore...');
    try {
      const result = await checkFirestoreHealth();
      setHealthStatus(result);
      if (result.ok) {
        toast.success(result.message, { id: toastId });
        addSyncLog('SUCCESS', result.message);
      } else {
        toast.error(result.message, { id: toastId, duration: 6000 });
        addSyncLog('ERROR', `${result.errorCode || 'FALLO'}: ${result.message}`);
      }
    } catch (e: any) {
      toast.error(`Fallo inesperado: ${e?.message || e}`, { id: toastId });
    } finally {
      setIsTestingHealth(false);
    }
  };

  const handleSaveConfig = () => {
    saveFirebaseConfig(configForm);
    toast.success('Configuración de Firebase guardada en este navegador.');
    addSyncLog('SUCCESS', `Proyecto Firebase actualizado a "${configForm.projectId}". Recarga la app si cambiaste la API Key.`);
  };

  const handleResetConfig = () => {
    resetFirebaseConfig();
    const defaults = getFirebaseConfig();
    setConfigForm(defaults);
    toast.success('Configuración de Firebase restablecida a los valores por defecto.');
    addSyncLog('INFO', 'Configuración de Firebase restablecida.');
  };

  const handlePullFromCloud = async () => {
    if (isPulling || isPushing) return;
    if (!isOnline) {
      toast.error('Sin conexión a Internet. No se puede descargar desde Firestore.');
      return;
    }

    setIsPulling(true);
    const toastId = toast.loading('Descargando datos desde Firebase Firestore a Dexie.js...');
    try {
      const stats = await pullDataFromFirestore({ logActivity: true });
      if (stats.success) {
        toast.success(`Descarga exitosa: ${stats.totalPulled} registros hidratados (${stats.durationMs}ms)`, { id: toastId });
        await loadMatrix();
      } else {
        toast.error(`Error al descargar: ${stats.error || 'Verifica el estado de Firestore'}`, { id: toastId });
      }
    } catch (err: any) {
      toast.error(`Error inesperado: ${err?.message || err}`, { id: toastId });
    } finally {
      setIsPulling(false);
    }
  };

  const handlePushToCloud = async () => {
    if (isPulling || isPushing) return;
    if (!isOnline) {
      toast.error('Sin conexión a Internet. No se puede subir a Firestore.');
      return;
    }

    setIsPushing(true);
    const toastId = toast.loading('Subiendo datos locales de Dexie.js a Firebase Firestore...');
    try {
      const stats = await pushDataToFirestore({ logActivity: true });
      if (stats.success) {
        toast.success(`Subida exitosa: ${stats.totalPushed} registros sincronizados (${stats.durationMs}ms)`, { id: toastId });
        await loadMatrix();
      } else {
        toast.error(`Fallo al subir a Firestore: ${stats.error || 'Verifica la consola de Firebase'}`, { id: toastId, duration: 6000 });
      }
    } catch (err: any) {
      toast.error(`Error inesperado: ${err?.message || err}`, { id: toastId });
    } finally {
      setIsPushing(false);
    }
  };

  const handleFullResync = async () => {
    if (isPulling || isPushing) return;
    if (!isOnline) {
      toast.error('Sin conexión a Internet.');
      return;
    }

    setIsPulling(true);
    const toastId = toast.loading('Ejecutando sincronización bidireccional completa...');
    try {
      await forceResyncAll();
      toast.success('Sincronización bidireccional completada con éxito', { id: toastId });
      await loadMatrix();
    } catch (err: any) {
      toast.error(`Error en resincronización: ${err?.message || err}`, { id: toastId });
    } finally {
      setIsPulling(false);
    }
  };

  const totalLocalRecords = comparisons.reduce((acc, c) => acc + c.localCount, 0);
  const totalRemoteRecords = comparisons.reduce((acc, c) => acc + c.remoteCount, 0);
  const hasErrors = comparisons.some(c => c.status === 'ERROR');
  const hasLocalAhead = comparisons.some(c => c.status === 'LOCAL_AHEAD') || (totalLocalRecords > totalRemoteRecords);
  const hasRemoteAhead = comparisons.some(c => c.status === 'REMOTE_AHEAD') || (totalRemoteRecords > totalLocalRecords);

  // Compute accurate general sync status
  let generalStatusLabel = 'Sincronizado';
  let generalStatusColor = 'text-emerald-600 dark:text-emerald-400';

  if (!isOnline) {
    generalStatusLabel = 'Modo Offline';
    generalStatusColor = 'text-slate-500';
  } else if (isPulling || isPushing || syncInfo.status === 'SYNCING') {
    generalStatusLabel = 'Sincronizando...';
    generalStatusColor = 'text-indigo-600 dark:text-indigo-400';
  } else if (hasErrors || syncInfo.status === 'ERROR') {
    generalStatusLabel = 'Error Conexión';
    generalStatusColor = 'text-rose-600 dark:text-rose-400';
  } else if (hasLocalAhead) {
    generalStatusLabel = 'Pendiente Subir';
    generalStatusColor = 'text-amber-600 dark:text-amber-400';
  } else if (hasRemoteAhead) {
    generalStatusLabel = 'Pendiente Bajar';
    generalStatusColor = 'text-indigo-600 dark:text-indigo-400';
  } else if (totalLocalRecords === 0 && totalRemoteRecords === 0) {
    generalStatusLabel = 'Sin Registros';
    generalStatusColor = 'text-slate-400';
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-200">
      <div className="bg-surface border border-line rounded-3xl w-full max-w-3xl max-h-[90vh] shadow-2xl flex flex-col overflow-hidden text-left">
        
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-line flex items-center justify-between bg-slate-50/50 dark:bg-surface/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-500 text-white flex items-center justify-center shadow-lg shadow-purple-500/20">
              <span className="material-symbols-outlined text-2xl">cloud_sync</span>
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-content tracking-tight flex items-center gap-2 flex-wrap">
                Centro de Sincronización
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${
                  isOnline 
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' 
                    : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                }`}>
                  {isOnline ? 'Online' : 'Offline'}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                  📁 {configForm.projectId}
                </span>
              </h2>
              <p className="text-xs text-content-secondary">
                Gestión bidireccional en tiempo real entre IndexedDB (Dexie) y Firebase Firestore
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-raised text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center justify-center transition-colors cursor-pointer"
            title="Cerrar modal"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* Quick Stats Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 p-4 sm:p-5 bg-slate-50/70 dark:bg-raised/30 border-b border-line">
          <div className="bg-surface p-3 rounded-2xl border border-line">
            <span className="text-[10px] font-black uppercase text-content-tertiary block">Registros Locales</span>
            <span className="text-lg font-black text-content mt-0.5 block">{totalLocalRecords}</span>
            <span className="text-[10px] text-purple-600 dark:text-purple-400 font-semibold">Dexie.js (IndexedDB)</span>
          </div>

          <div className="bg-surface p-3 rounded-2xl border border-line">
            <span className="text-[10px] font-black uppercase text-content-tertiary block">Registros en Nube</span>
            <span className="text-lg font-black text-content mt-0.5 block">{totalRemoteRecords}</span>
            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">Firebase Firestore</span>
          </div>

          <div className="bg-surface p-3 rounded-2xl border border-line">
            <span className="text-[10px] font-black uppercase text-content-tertiary block">Cola Pendiente</span>
            <span className="text-lg font-black text-content mt-0.5 block">{syncInfo.pendingCount}</span>
            <span className="text-[10px] text-slate-500 font-semibold">Domain Outbox</span>
          </div>

          <div className="bg-surface p-3 rounded-2xl border border-line">
            <span className="text-[10px] font-black uppercase text-content-tertiary block">Estado General</span>
            <div className="flex items-center gap-1.5 mt-1">
              <span className={`text-sm font-black ${generalStatusColor} truncate block`}>
                {generalStatusLabel}
              </span>
            </div>
            <span className="text-[10px] text-slate-400 block truncate">
              {hasLocalAhead ? `↑ ${Math.max(0, totalLocalRecords - totalRemoteRecords)} por subir` : `Última: ${new Date(syncInfo.lastSyncedAt || Date.now()).toLocaleTimeString()}`}
            </span>
          </div>
        </div>

        {/* Tabs Bar */}
        <div className="flex items-center justify-between px-5 pt-3 border-b border-line">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('matrix')}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'matrix'
                  ? 'bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-800'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <span className="material-symbols-outlined text-sm">table_chart</span>
              Matriz de Entidades
            </button>
            <button
              onClick={() => setActiveTab('logs')}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'logs'
                  ? 'bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-800'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <span className="material-symbols-outlined text-sm">terminal</span>
              Registro de Actividad ({logs.length})
            </button>
            <button
              onClick={() => setActiveTab('config')}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'config'
                  ? 'bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-800'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <span className="material-symbols-outlined text-sm">settings_ethernet</span>
              Proyecto Firebase
            </button>
          </div>

          <button
            onClick={loadMatrix}
            disabled={isLoadingMatrix}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-raised transition-all cursor-pointer"
            title="Recargar métricas"
          >
            <span className={`material-symbols-outlined text-sm ${isLoadingMatrix ? 'animate-spin' : ''}`}>refresh</span>
          </button>
        </div>

        {/* Tab Contents */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {activeTab === 'matrix' && (
            <div className="space-y-3">
              <div className="overflow-x-auto rounded-2xl border border-line">
                <table className="w-full text-xs text-left">
                  <thead className="bg-inset text-content-secondary uppercase text-[10px] font-black border-b border-line">
                    <tr>
                      <th className="p-3">Entidad / Colección</th>
                      <th className="p-3 text-center">Local (Dexie)</th>
                      <th className="p-3 text-center">Nube (Firestore)</th>
                      <th className="p-3 text-right">Estado de Sync</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/60">
                    {comparisons.map((item) => (
                      <tr key={item.tableName} className="hover:bg-slate-50/50 dark:hover:bg-raised/30 transition-colors">
                        <td className="p-3 font-semibold text-content">
                          <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-purple-600 dark:text-purple-400 text-base">
                              {item.icon}
                            </span>
                            <div>
                              <span>{item.entityLabel}</span>
                              <span className="text-[10px] text-slate-400 block font-mono">
                                {item.collectionName}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="p-3 text-center font-bold text-content">
                          {item.localCount}
                        </td>
                        <td className="p-3 text-center font-bold text-content">
                          {isOnline ? item.remoteCount : '—'}
                        </td>
                        <td className="p-3 text-right">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            item.status === 'IN_SYNC'
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/50'
                              : item.status === 'LOCAL_AHEAD'
                              ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-900/50'
                              : item.status === 'REMOTE_AHEAD'
                              ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-900/50'
                              : 'bg-slate-100 text-slate-600 dark:bg-raised dark:text-slate-400 border border-line'
                          }`}>
                            {item.status === 'IN_SYNC' && '✓ Sincronizado'}
                            {item.status === 'LOCAL_AHEAD' && '↑ Pendiente subir'}
                            {item.status === 'REMOTE_AHEAD' && '↓ Pendiente bajar'}
                            {item.status === 'EMPTY' && 'Sin registros'}
                            {item.status === 'ERROR' && '⚠️ Error'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'logs' && (
            <div className="bg-canvas text-slate-200 rounded-2xl p-4 font-mono text-xs max-h-80 overflow-y-auto space-y-2 border border-line shadow-inner">
              {logs.length === 0 ? (
                <p className="text-slate-500 italic">No hay registros de actividad aún.</p>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="flex items-start gap-2 leading-relaxed">
                    <span className="text-slate-500 shrink-0">[{log.timestamp}]</span>
                    <span className={`shrink-0 font-bold ${
                      log.type === 'SUCCESS' ? 'text-emerald-400' :
                      log.type === 'WARNING' ? 'text-amber-400' :
                      log.type === 'ERROR' ? 'text-rose-400' : 'text-cyan-400'
                    }`}>
                      {log.type}:
                    </span>
                    <span className="text-slate-300">{log.message}</span>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'config' && (
            <div className="space-y-4 text-xs">
              <div className="bg-purple-50 dark:bg-purple-950/30 p-3.5 rounded-2xl border border-purple-200 dark:border-purple-900/60 flex items-start gap-2.5">
                <span className="material-symbols-outlined text-purple-600 text-base mt-0.5">info</span>
                <div>
                  <h4 className="font-bold text-slate-800 dark:text-purple-200">Credenciales del Proyecto Firebase</h4>
                  <p className="text-slate-600 dark:text-purple-300/80 text-[11px] mt-0.5 leading-relaxed">
                    Verifica que el <strong>Project ID</strong> coincida exactamente con tu proyecto en la consola de Firebase y que hayas creado la base de datos <strong>Cloud Firestore</strong>.
                  </p>
                </div>
              </div>

              {/* Health Ping Box */}
              <div className="bg-inset p-4 rounded-2xl border border-line flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <span className="font-bold text-content block">Diagnóstico de Conexión Real</span>
                  <span className="text-content-secondary text-[11px] block mt-0.5">
                    Ejecuta una lectura de prueba directa contra el endpoint de Google Cloud Firestore.
                  </span>
                  {healthStatus && (
                    <div className={`mt-2 p-2.5 rounded-xl border text-[11px] font-medium leading-relaxed ${
                      healthStatus.ok 
                        ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800' 
                        : 'bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200 border-rose-200 dark:border-rose-800'
                    }`}>
                      {healthStatus.message}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleTestHealth}
                  disabled={isTestingHealth || !isOnline}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-40 flex items-center gap-1.5 shrink-0"
                >
                  <span className={`material-symbols-outlined text-sm ${isTestingHealth ? 'animate-spin' : ''}`}>
                    {isTestingHealth ? 'sync' : 'network_ping'}
                  </span>
                  {isTestingHealth ? 'Probando...' : 'Probar Conexión Firestore'}
                </button>
              </div>

              {/* Config Form */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-content-secondary text-[11px] mb-1">Project ID</label>
                  <input
                    type="text"
                    value={configForm.projectId}
                    onChange={(e) => setConfigForm({ ...configForm, projectId: e.target.value })}
                    className="w-full px-3 py-2 bg-inset border border-line rounded-xl font-mono text-content focus:outline-none focus:border-purple-500"
                    placeholder="ej. foodiepos360"
                  />
                </div>

                <div>
                  <label className="block font-bold text-content-secondary text-[11px] mb-1">API Key</label>
                  <input
                    type="text"
                    value={configForm.apiKey}
                    onChange={(e) => setConfigForm({ ...configForm, apiKey: e.target.value })}
                    className="w-full px-3 py-2 bg-inset border border-line rounded-xl font-mono text-content focus:outline-none focus:border-purple-500"
                    placeholder="AIzaSy..."
                  />
                </div>

                <div>
                  <label className="block font-bold text-content-secondary text-[11px] mb-1">Auth Domain</label>
                  <input
                    type="text"
                    value={configForm.authDomain}
                    onChange={(e) => setConfigForm({ ...configForm, authDomain: e.target.value })}
                    className="w-full px-3 py-2 bg-inset border border-line rounded-xl font-mono text-content focus:outline-none focus:border-purple-500"
                    placeholder="ej. foodiepos360.firebaseapp.com"
                  />
                </div>

                <div>
                  <label className="block font-bold text-content-secondary text-[11px] mb-1">App ID</label>
                  <input
                    type="text"
                    value={configForm.appId}
                    onChange={(e) => setConfigForm({ ...configForm, appId: e.target.value })}
                    className="w-full px-3 py-2 bg-inset border border-line rounded-xl font-mono text-content focus:outline-none focus:border-purple-500"
                    placeholder="1:667508544399:web:..."
                  />
                </div>
              </div>

              {/* Security Rules Helper */}
              <div className="bg-amber-500/10 border border-amber-500/30 p-3.5 rounded-2xl">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-1.5 font-bold text-amber-700 dark:text-amber-300 text-xs">
                    <span className="material-symbols-outlined text-base">shield_lock</span>
                    Reglas de Seguridad de Firestore (Solución a PERMISSION_DENIED)
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const rules = `rules_version = '2';\nservice cloud.firestore {\n  match /databases/{database}/documents {\n    match /{document=**} {\n      allow read, write: if true;\n    }\n  }\n}`;
                      navigator.clipboard.writeText(rules);
                      toast.success('Reglas de seguridad copiadas al portapapeles.');
                    }}
                    className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-700 dark:text-amber-300 font-bold rounded-lg text-[10px] transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-xs">content_copy</span>
                    Copiar Reglas
                  </button>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-amber-200/80 leading-relaxed">
                  Para permitir la lectura y escritura desde la aplicación: ve a tu consola en <a href={`https://console.firebase.google.com/project/${configForm.projectId}/firestore/rules`} target="_blank" rel="noreferrer" className="underline font-semibold text-amber-600 dark:text-amber-400">Firebase Console &rarr; Firestore &rarr; Reglas</a>, pega las reglas y haz clic en <strong>Publicar</strong>.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleResetConfig}
                  className="px-3 py-1.5 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-raised transition-colors cursor-pointer"
                >
                  Restablecer
                </button>
                <button
                  type="button"
                  onClick={handleSaveConfig}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl shadow-md transition-all cursor-pointer"
                >
                  Guardar Configuración
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Action Controls Footer */}
        <div className="p-4 sm:p-5 border-t border-line bg-slate-50/50 dark:bg-surface/50 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="text-[11px] text-content-secondary">
            Resolución de conflictos: <strong>Last-Write-Wins</strong> (marca temporal más reciente).
          </span>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={handlePullFromCloud}
              disabled={isPulling || isPushing || !isOnline}
              className="px-3.5 py-2 text-xs font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-xl hover:bg-indigo-100 transition-all cursor-pointer disabled:opacity-40 flex items-center gap-1.5"
            >
              <span className={`material-symbols-outlined text-sm ${isPulling ? 'animate-spin' : ''}`}>
                {isPulling ? 'sync' : 'cloud_download'}
              </span>
              {isPulling ? 'Descargando...' : 'Forzar Descarga (Pull)'}
            </button>

            <button
              type="button"
              onClick={handlePushToCloud}
              disabled={isPulling || isPushing || !isOnline}
              className="px-3.5 py-2 text-xs font-bold bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-300 border border-purple-200 dark:border-purple-800 rounded-xl hover:bg-purple-100 transition-all cursor-pointer disabled:opacity-40 flex items-center gap-1.5"
            >
              <span className={`material-symbols-outlined text-sm ${isPushing ? 'animate-spin' : ''}`}>
                {isPushing ? 'sync' : 'cloud_upload'}
              </span>
              {isPushing ? 'Subiendo...' : 'Forzar Subida (Push)'}
            </button>

            <button
              type="button"
              onClick={handleFullResync}
              disabled={isPulling || isPushing || !isOnline}
              className="px-4 py-2 text-xs font-bold bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl shadow-md hover:opacity-90 transition-all cursor-pointer disabled:opacity-40 flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-sm">sync</span>
              Sincronizar Todo
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
