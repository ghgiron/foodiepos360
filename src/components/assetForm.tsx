// src/components/assetForm.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../db/localDb';
import type { FixedAsset, DamageReport, AssetBreakAudit } from '../types';
import { useLiveQuery } from 'dexie-react-hooks';
import { getDropdownOptions } from '../utils/dataHelper';
import ImageUploader from './ImageUploader';
import SupplierForm from './supplierForm';
import Modal from './ui/Modal';
import ConfirmDialog from './ui/ConfirmDialog';
import toast from 'react-hot-toast';
import CustomSelect from './ui/CustomSelect';

interface AssetFormProps {
  view: 'create' | 'edit' | 'damage_report';
  asset: FixedAsset | null;
  onBack: () => void;
}

export default function AssetForm({ view, asset, onBack }: AssetFormProps) {
  const isEdit = view === 'edit';
  const isDamage = view === 'damage_report';

  // Load system settings dynamically from IndexedDB systemSettings table
  const systemSettings = useLiveQuery(async () => {
    const list = await db.systemSettings.toArray();
    return list.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {} as Record<string, any>);
  }) || {};

  const assetCategoriesList = getDropdownOptions('asset_categories', systemSettings);
  const assetLocationsList = getDropdownOptions('asset_locations', systemSettings);
  const allBranches = getDropdownOptions('system_branches', systemSettings) as Array<{ id: string; name: string; active?: boolean }>;
  const systemBranches = useMemo(() => {
    return allBranches.filter(b => b.active !== false);
  }, [allBranches]);

  // --- GENERAL ASSET STATES ---
  const [name, setName] = useState('');
  const [assetId, setAssetId] = useState(''); // Internal inventory code
  const [category, setCategory] = useState('');

  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [location, setLocation] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [image, setImage] = useState('');
  const [damageImage, setDamageImage] = useState('');

  // Synchronize dynamic defaults when settings load
  useEffect(() => {
    if (assetCategoriesList.length > 0 && !assetCategoriesList.includes(category)) {
      setCategory(assetCategoriesList[0]);
    }
    if (assetLocationsList.length > 0 && !assetLocationsList.includes(location)) {
      setLocation(assetLocationsList[0]);
    }
  }, [systemSettings, assetCategoriesList, assetLocationsList, category, location]);
  const [purchaseCost, setPurchaseCost] = useState<number | ''>('');
  const [description, setDescription] = useState('');
  const [unitOfMeasure, setUnitOfMeasure] = useState('Unidades');
  const [stockActual, setStockActual] = useState<number | ''>('');
  const [stockMinLimit, setStockMinLimit] = useState<number | ''>('');
  const [supplierId, setSupplierId] = useState('');
  const [status, setStatus] = useState('Operativo');

  const [sucursalId, setSucursalId] = useState('');
  const [supplierSearch, setSupplierSearch] = useState('');
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);

  const suppliers = useLiveQuery(() => db.suppliers.toArray()) || [];
  const filteredSuppliers = useMemo(() => {
    if (!supplierSearch) return suppliers;
    const q = supplierSearch.toLowerCase();
    return suppliers.filter(s =>
      (s.name || '').toLowerCase().includes(q) ||
      (s.id || '').toLowerCase().includes(q)
    );
  }, [suppliers, supplierSearch]);

  // --- CONDITIONAL CATEGORY STATES ---
  // Electrodomésticos / Maquinaria:
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [voltage, setVoltage] = useState('110V');

  // Menaje / Cristalería or Mobiliario:
  const [materialType, setMaterialType] = useState('');
  const [capacity, setCapacity] = useState('');
  const [breaksList, setBreaksList] = useState<AssetBreakAudit[]>([]);

  // Physical Audit Add Break State
  const [breakDate, setBreakDate] = useState(new Date().toISOString().split('T')[0]);
  const [breakQty, setBreakQty] = useState<number | ''>('');
  const [breakReason, setBreakReason] = useState('Rotura');

  // --- MAINTENANCE SCHEDULING STATES ---
  const [nextMaintenanceDate, setNextMaintenanceDate] = useState('');
  const [maintenanceType, setMaintenanceType] = useState('Preventivo');
  const [alertFrequency, setAlertFrequency] = useState('Trimestral');
  const [technicianRemarks, setTechnicianRemarks] = useState('');

  // --- DAMAGE REPORT STATES ---
  const allAssets = useLiveQuery(() => db.fixedAssets.toArray()) || [];
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [discoveryDate, setDiscoveryDate] = useState(new Date().toISOString().split('T')[0]);
  const [discoveryTime, setDiscoveryTime] = useState('14:30');
  const [severity, setSeverity] = useState<'BAJA' | 'MEDIA' | 'ALTA' | 'CRÍTICA'>('BAJA');
  const [damageDescription, setDamageDescription] = useState('');
  const [affectsOperation, setAffectsOperation] = useState(false);
  const [recommendedAction, setRecommendedAction] = useState('Reparar de inmediato');
  const [reportSentPopup, setReportSentPopup] = useState(false);

  // Initialize fields if editing or pre-selecting for damage
  useEffect(() => {
    if (isEdit && asset) {
      setName(asset.name || '');
      setAssetId(asset.id || '');
      setCategory(asset.category || 'Mobiliario');
      setLocation(asset.location || 'Salón');
      setPurchaseDate(asset.purchaseDate || '');
      setPurchaseCost(asset.purchaseCost || '');
      setDescription(asset.description || '');
      setUnitOfMeasure(asset.unitOfMeasure || 'Unidades');
      setStockActual(asset.stockActual || '');
      setStockMinLimit(asset.stockMinLimit || '');
      setSupplierId(asset.supplierId || '');
      setSucursalId(asset.sucursalId || '');
      setStatus(asset.status || 'Operativo');
      setImage(asset.image || '');

      setBrand(asset.brand || '');
      setModel(asset.model || '');
      setSerialNumber(asset.serialNumber || '');
      setVoltage(asset.voltage || '110V');

      setMaterialType(asset.materialType || '');
      setCapacity(asset.capacity || '');
      setBreaksList(asset.breaksAudit || []);

      setNextMaintenanceDate(asset.nextMaintenanceDate || '');
      setMaintenanceType(asset.maintenanceType || 'Preventivo');
      setAlertFrequency(asset.alertFrequency || 'Trimestral');
      setTechnicianRemarks(asset.technicianRemarks || '');
    } else if (isDamage) {
      if (asset) {
        setSelectedAssetId(asset.id);
      } else if (allAssets.length > 0) {
        setSelectedAssetId(allAssets[0].id);
      }
    }
  }, [view, asset, isEdit, isDamage, allAssets]);

  // Sync initial supplier search text if default
  useEffect(() => {
    if (supplierId && suppliers.length > 0) {
      const found = suppliers.find(s => s.id === supplierId);
      if (found) {
        setSupplierSearch(found.name);
      }
    } else if (!supplierId) {
      setSupplierSearch('');
    }
  }, [supplierId, suppliers]);

  // Sync default branch
  useEffect(() => {
    if (systemBranches.length > 0 && !sucursalId) {
      setSucursalId(systemBranches[0].id);
    }
  }, [systemBranches, sucursalId]);

  // Sync damage report pre-selection if assets list loads
  useEffect(() => {
    if (isDamage && !asset && allAssets.length > 0 && !selectedAssetId) {
      setSelectedAssetId(allAssets[0].id);
    }
  }, [allAssets, isDamage, asset, selectedAssetId]);

  const handleAddBreak = () => {
    const qty = Number(breakQty);
    if (!breakDate || qty <= 0 || !breakReason.trim()) {
      toast.error('Por favor completa la fecha, cantidad y motivo de la rotura.');
      return;
    }
    const newBreak: AssetBreakAudit = {
      date: breakDate,
      qtyDiscarded: qty,
      reason: breakReason.trim()
    };
    setBreaksList([...breaksList, newBreak]);
    // Subtract from current stock
    setStockActual(prev => Math.max(0, (Number(prev) || 0) - qty));
    setBreakQty('');
    setBreakReason('Rotura');
  };

  const handleRemoveBreak = (index: number) => {
    const breakItem = breaksList[index];
    // Restore stock
    setStockActual(prev => (Number(prev) || 0) + breakItem.qtyDiscarded);
    setBreaksList(breaksList.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isDamage) {
      // Submit Damage Report
      const targetAsset = allAssets.find(a => a.id === selectedAssetId);
      if (!targetAsset) {
        toast.error('Por favor selecciona un activo.');
        return;
      }

      const reportId = `rep-dmg-${Date.now().toString().slice(-4)}`;
      const newReport: DamageReport = {
        id: reportId,
        assetId: selectedAssetId,
        assetName: targetAsset.name,
        discoveryDate,
        discoveryTime,
        severity,
        description: damageDescription.trim(),
        affectsOperation,
        recommendedAction,
        image: damageImage,
        createdAt: new Date().toISOString()
      };

      try {
        await db.assetDamageReports.put(newReport);

        // Update the asset status based on report details
        let updatedStatus = targetAsset.status;
        if (recommendedAction === 'Retirar de servicio') {
          updatedStatus = 'Retirado de Servicio';
        } else if (severity === 'CRÍTICA' || severity === 'ALTA') {
          updatedStatus = 'Requiere Revisión Urgentemente';
        } else if (severity === 'MEDIA') {
          updatedStatus = 'En Mantenimiento';
        }

        await db.fixedAssets.update(selectedAssetId, {
          status: updatedStatus,
          updatedAt: new Date().toISOString()
        });

        // Trigger visual popup animation
        setReportSentPopup(true);
        setTimeout(() => {
          setReportSentPopup(false);
          onBack();
        }, 1500);

      } catch (err) {
        console.error('Error submitting damage report:', err);
        toast.error('Error al guardar el reporte de daño.');
      }
      return;
    }

    // Submit Asset Create / Edit
    if (!name.trim()) {
      toast.error('Nombre de Activo es obligatorio.');
      return;
    }
    const finalAssetId = isEdit ? assetId : (assetId.trim() || `ast-${Date.now().toString().slice(-4)}`);

    const finalAsset: FixedAsset = {
      id: finalAssetId,
      name: name.trim(),
      category,
      location,
      purchaseDate,
      purchaseCost: Number(purchaseCost) || 0,
      description: description.trim(),
      image,
      unitOfMeasure,
      stockActual: Number(stockActual) || 0,
      stockMinLimit: Number(stockMinLimit) || 0,
      supplierId: supplierId.trim() || 'prov-generic',
      sucursalId: sucursalId || undefined,
      status,
      updatedAt: new Date().toISOString(),

      // Electrodomésticos conditional fields
      brand: category === 'Electrodomésticos / Maquinaria' ? brand.trim() : undefined,
      model: category === 'Electrodomésticos / Maquinaria' ? model.trim() : undefined,
      serialNumber: category === 'Electrodomésticos / Maquinaria' ? serialNumber.trim() : undefined,
      voltage: category === 'Electrodomésticos / Maquinaria' ? voltage : undefined,

      // Menaje/Mobiliario conditional fields
      materialType: (category === 'Menaje / Cristalería' || category === 'Mobiliario') ? materialType.trim() : undefined,
      capacity: category === 'Menaje / Cristalería' ? capacity.trim() : undefined,
      breaksAudit: (category === 'Menaje / Cristalería' || category === 'Mobiliario') ? breaksList : undefined,

      // Maintenance Scheduling
      nextMaintenanceDate: category === 'Electrodomésticos / Maquinaria' && nextMaintenanceDate ? nextMaintenanceDate : undefined,
      maintenanceType: category === 'Electrodomésticos / Maquinaria' ? maintenanceType : undefined,
      alertFrequency: category === 'Electrodomésticos / Maquinaria' ? alertFrequency : undefined,
      technicianRemarks: category === 'Electrodomésticos / Maquinaria' ? technicianRemarks.trim() : undefined
    };

    try {
      await db.fixedAssets.put(finalAsset);
      toast.success(isEdit ? `Activo "${name}" actualizado exitosamente.` : `Activo "${name}" guardado exitosamente.`);
      onBack();
    } catch (err) {
      console.error('Error saving asset:', err);
      toast.error('Error al guardar el activo en IndexedDB.');
    }
  };

  const handleDelete = async () => {
    if (!asset || !asset.id) return;
    try {
      await db.fixedAssets.delete(asset.id);
      toast.success(`Activo "${name}" eliminado exitosamente.`);
      onBack();
    } catch (err) {
      console.error('Error deleting asset:', err);
      toast.error('Error al eliminar el activo.');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in text-left font-body text-[var(--text-secondary)]">
      
      {/* Header breadcrumbs */}
      <div className="flex items-center justify-between pb-4 border-b border-[var(--border-glow)]">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="text-[var(--text-muted)] hover:text-[var(--accent-purple)] text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 hover:underline cursor-pointer bg-transparent border-none"
          >
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            REGRESAR AL INVENTARIO
          </button>
          
          <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] mt-2">
            <span>Inventario</span>
            <span className="material-symbols-outlined text-[10px]">chevron_right</span>
            <span>Dotación y Mobiliario</span>
            <span className="material-symbols-outlined text-[10px]">chevron_right</span>
            <span className="text-[var(--accent-purple)]">{isDamage ? 'Reportar Daño' : isEdit ? 'Editar Elemento' : 'Nuevo Elemento'}</span>
          </div>

          <h2 className="text-3xl font-black text-[var(--text-primary)] mt-1">
            {isDamage ? 'Reportar Daño o Avería' : isEdit ? `Editar Elemento` : 'Nuevo Elemento de Dotación / Mobiliario'}
          </h2>
          <p className="text-[var(--text-muted)] font-semibold text-xs mt-0.5">
            {isDamage 
              ? 'Utilice este formulario para registrar cualquier incidencia técnica o rotura de activos. Su reporte notificará automáticamente al equipo de mantenimiento para programar la reparación o el reemplazo.'
              : 'Registre nuevos activos, herramientas de cocina o mobiliario del establecimiento para mantener el control de inventario y depreciación.'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        
        {/* Render Damage Report Form */}
        {isDamage ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 relative">
            
            {/* Left side cards (8 Cols) */}
            <div className="lg:col-span-8 space-y-6">
              
              {/* Identificación del Activo */}
              <div className="bg-[var(--bg-surface)] border border-[var(--border-glow)] p-6 rounded-3xl shadow-sm space-y-4">
                <div className="flex items-center gap-2 pb-3 border-b border-[var(--border-glow)]">
                  <span className="material-symbols-outlined text-[var(--text-muted)] text-lg">fact_check</span>
                  <h3 className="text-xs font-extrabold text-[var(--text-primary)] uppercase tracking-wider">
                    Identificación del Activo
                  </h3>
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-1.5">
                    Elemento Afectado
                  </label>
                  <CustomSelect
                    value={selectedAssetId}
                    onChange={setSelectedAssetId}
                    disabled={!!asset}
                    options={asset ? [{ value: asset.id, label: `${asset.name} (${asset.id})` }] : allAssets.map(a => ({ value: a.id, label: `${a.name} (${a.id})` }))}
                    className="w-full bg-[var(--bg-app)] border border-[var(--border-glow)] rounded-xl p-3.5 text-xs font-bold text-[var(--text-primary)] disabled:opacity-60"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-1.5">
                      Fecha del Hallazgo
                    </label>
                    <input
                      type="date"
                      required
                      value={discoveryDate}
                      onChange={(e) => setDiscoveryDate(e.target.value)}
                      className="w-full bg-[var(--bg-app)] border border-[var(--border-glow)] rounded-xl p-3.5 text-xs font-semibold focus:ring-1 focus:ring-[var(--accent-purple)] outline-none text-[var(--text-primary)]"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-1.5">
                      Hora
                    </label>
                    <input
                      type="time"
                      required
                      value={discoveryTime}
                      onChange={(e) => setDiscoveryTime(e.target.value)}
                      className="w-full bg-[var(--bg-app)] border border-[var(--border-glow)] rounded-xl p-3.5 text-xs font-semibold focus:ring-1 focus:ring-[var(--accent-purple)] outline-none text-[var(--text-primary)]"
                    />
                  </div>
                </div>
              </div>

              {/* Detalles del Incidente */}
              <div className="bg-[var(--bg-surface)] border border-[var(--border-glow)] p-6 rounded-3xl shadow-sm space-y-4">
                <div className="flex items-center gap-2 pb-3 border-b border-[var(--border-glow)]">
                  <span className="material-symbols-outlined text-[var(--text-muted)] text-lg">description</span>
                  <h3 className="text-xs font-extrabold text-[var(--text-primary)] uppercase tracking-wider">
                    Detalles del Incidente
                  </h3>
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-2.5">
                    Nivel de Severidad
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {(['BAJA', 'MEDIA', 'ALTA', 'CRÍTICA'] as const).map(sev => {
                      const isActive = severity === sev;
                      const activeColors = 
                        sev === 'BAJA' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' :
                        sev === 'MEDIA' ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20' :
                        sev === 'ALTA' ? 'bg-[var(--accent-pink)]/10 text-[var(--accent-pink)] border-[var(--accent-pink)]/20' :
                        'bg-rose-500/10 text-rose-600 dark:text-rose-450 border-rose-500/20';

                      return (
                        <button
                          key={sev}
                          type="button"
                          onClick={() => setSeverity(sev)}
                          className={`py-3 px-2 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all text-center cursor-pointer ${
                            isActive
                              ? `${activeColors} ring-2 ring-current font-extrabold shadow-inner`
                              : 'bg-[var(--bg-app)] border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                          }`}
                        >
                          {sev}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-1.5">
                    Descripción del Daño
                  </label>
                  <textarea
                    required
                    value={damageDescription}
                    onChange={(e) => setDamageDescription(e.target.value)}
                    className="w-full bg-[var(--bg-app)] border border-[var(--border-glow)] rounded-xl p-3.5 text-xs font-semibold focus:ring-1 focus:ring-[var(--accent-purple)] outline-none text-[var(--text-primary)] placeholder-slate-400"
                    placeholder="Describa detalladamente qué sucedió y el estado actual del objeto..."
                    rows={4}
                  />
                </div>
              </div>
            </div>

            {/* Right side cards (4 Cols) */}
            <div className="lg:col-span-4 space-y-6">
              
              {/* Evidencia Visual */}
              <ImageUploader
                value={damageImage}
                onChange={setDamageImage}
                label="Evidencia Visual (Avería / Rotura)"
                helperText="Soporta PNG, JPG, WEBP hasta 5MB"
              />

              {/* Impacto y Acción */}
              <div className="bg-[var(--bg-surface)] border border-[var(--border-glow)] p-6 rounded-3xl shadow-sm space-y-4">
                <div className="flex items-center gap-2 pb-3 border-b border-[var(--border-glow)]">
                  <span className="material-symbols-outlined text-[var(--text-muted)] text-lg">settings_suggest</span>
                  <h3 className="text-xs font-extrabold text-[var(--text-primary)] uppercase tracking-wider">
                    Impacto y Acción
                  </h3>
                </div>

                <div className="flex items-center justify-between bg-[var(--bg-app)] p-3 rounded-2xl border border-[var(--border-glow)]">
                  <div>
                    <span className="text-[10px] font-black uppercase text-[var(--text-secondary)] block">¿Afecta la operación?</span>
                    <span className="text-[8px] text-[var(--text-muted)] font-bold block mt-0.5">Marque si el servicio se verá retrasado</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAffectsOperation(!affectsOperation)}
                    className={`w-11 h-6 rounded-full p-1 transition-colors duration-300 focus:outline-none border-none cursor-pointer ${
                      affectsOperation ? 'bg-[var(--accent-purple)]' : 'bg-slate-200 dark:bg-slate-900'
                    }`}
                  >
                    <div
                      className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-300 ${
                        affectsOperation ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    ></div>
                  </button>
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-1.5">
                    Acción Recomendada
                  </label>
                  <CustomSelect
                    value={recommendedAction}
                    onChange={setRecommendedAction}
                    options={[
                      { value: 'Reparar de inmediato', label: 'Reparar de inmediato' },
                      { value: 'Programar revisión técnica', label: 'Programar revisión técnica' },
                      { value: 'Reemplazar elemento', label: 'Reemplazar elemento' },
                      { value: 'Retirar de servicio', label: 'Retirar de servicio' }
                    ]}
                    className="w-full bg-[var(--bg-app)] border border-[var(--border-glow)] rounded-xl p-3 text-xs font-bold text-[var(--text-primary)]"
                  />
                </div>
              </div>
            </div>

            {/* Popup alert when report submitted */}
            {reportSentPopup && (
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-slate-900 dark:bg-slate-955 text-white rounded-2xl p-5 border border-slate-700 shadow-2xl flex flex-col items-center justify-center gap-3 z-50 animate-fade-in w-72">
                <span className="material-symbols-outlined text-4xl text-emerald-450 animate-bounce">check_circle</span>
                <div className="text-center">
                  <h4 className="font-extrabold text-sm uppercase tracking-wider text-emerald-400">Reporte Enviado</h4>
                  <p className="text-[10px] text-slate-400 mt-1 font-semibold leading-relaxed">El equipo de mantenimiento ha sido notificado.</p>
                </div>
              </div>
            )}

          </div>
        ) : (
          
          // Render Asset Onboarding & Editing Form
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left Column (8 Cols): Forms */}
            <div className="lg:col-span-8 space-y-6">
              
              {/* Card 1: Información General */}
              <div className="bg-[var(--bg-surface)] border border-[var(--border-glow)] p-6 rounded-3xl shadow-sm space-y-4">
                <div className="flex items-center gap-2 pb-3 border-b border-[var(--border-glow)]">
                  <span className="material-symbols-outlined text-[var(--text-muted)] text-lg">info</span>
                  <h3 className="text-xs font-extrabold text-[var(--text-primary)] uppercase tracking-wider">
                    Información del Elemento
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-1.5">
                      Nombre del Elemento
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full bg-[var(--bg-app)] border border-[var(--border-glow)] rounded-xl p-3.5 text-xs font-semibold focus:ring-1 focus:ring-[var(--accent-purple)] outline-none text-[var(--text-primary)] placeholder-slate-400"
                      placeholder="Ej. Horno Microondas Industrial, Camiseta Staff L"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-1.5">
                      Código Interno (Inventario)
                    </label>
                    <input
                      type="text"
                      value={assetId}
                      onChange={(e) => setAssetId(e.target.value)}
                      disabled={isEdit}
                      className="w-full bg-[var(--bg-app)] border border-[var(--border-glow)] rounded-xl p-3.5 text-xs font-mono font-bold focus:ring-1 focus:ring-[var(--accent-purple)] outline-none text-[var(--text-primary)] placeholder-slate-400 disabled:opacity-60"
                      placeholder="Ej. ast-maq-001"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-1.5">
                      Categoría
                    </label>
                    <CustomSelect
                      value={category}
                      onChange={setCategory}
                      options={assetCategoriesList.map(cat => ({ value: cat, label: cat }))}
                      className="w-full bg-[var(--bg-app)] border border-[var(--border-glow)] rounded-xl p-3.5 text-xs font-bold text-[var(--text-primary)]"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-1.5">
                      Sucursal
                    </label>
                    <CustomSelect
                      value={sucursalId}
                      onChange={setSucursalId}
                      options={systemBranches.map(branch => ({ value: branch.id, label: branch.name }))}
                      className="w-full bg-[var(--bg-app)] border border-[var(--border-glow)] rounded-xl p-3.5 text-xs font-bold text-[var(--text-primary)]"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-1.5">
                      Ubicación (Sede/Zona)
                    </label>
                    <CustomSelect
                      value={location}
                      onChange={setLocation}
                      options={assetLocationsList.map(loc => ({ value: loc, label: loc }))}
                      className="w-full bg-[var(--bg-app)] border border-[var(--border-glow)] rounded-xl p-3.5 text-xs font-bold text-[var(--text-primary)]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-1.5">
                    Descripción Detallada
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full bg-[var(--bg-app)] border border-[var(--border-glow)] rounded-xl p-3.5 text-xs font-semibold focus:ring-1 focus:ring-[var(--accent-purple)] outline-none text-[var(--text-primary)] placeholder-slate-400"
                    placeholder="Especificaciones técnicas, tallas o detalles relevantes..."
                    rows={3}
                  />
                </div>
              </div>

              {/* Card 2: Logística y Costos */}
              <div className="bg-[var(--bg-surface)] border border-[var(--border-glow)] p-6 rounded-3xl shadow-sm space-y-4">
                <div className="flex items-center gap-2 pb-3 border-b border-[var(--border-glow)]">
                  <span className="material-symbols-outlined text-[var(--text-muted)] text-lg">local_shipping</span>
                  <h3 className="text-xs font-extrabold text-[var(--text-primary)] uppercase tracking-wider">
                    Logística y Costos
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-1.5">
                      Unidad de Medida
                    </label>
                    <input
                      type="text"
                      value={unitOfMeasure}
                      onChange={(e) => setUnitOfMeasure(e.target.value)}
                      className="w-full bg-[var(--bg-app)] border border-[var(--border-glow)] rounded-xl p-3 text-xs font-semibold focus:ring-1 focus:ring-[var(--accent-purple)] outline-none text-[var(--text-primary)]"
                      placeholder="Unidad, Set, Par..."
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-1.5">
                      Costo Unitario ($)
                    </label>
                    <input
                      type="number"
                      required
                      value={purchaseCost}
                      onChange={(e) => setPurchaseCost(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full bg-[var(--bg-app)] border border-[var(--border-glow)] rounded-xl p-3 text-xs font-mono font-bold focus:ring-1 focus:ring-[var(--accent-purple)] outline-none text-[var(--text-primary)] text-right"
                      placeholder="0.00"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-1.5">
                      Proveedor
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={supplierSearch}
                        onChange={(e) => {
                          setSupplierSearch(e.target.value);
                          setShowSupplierDropdown(true);
                        }}
                        onFocus={() => setShowSupplierDropdown(true)}
                        onBlur={() => setTimeout(() => setShowSupplierDropdown(false), 200)}
                        className="w-full bg-[var(--bg-app)] border border-[var(--border-glow)] rounded-xl p-3 text-xs font-semibold focus:ring-1 focus:ring-[var(--accent-purple)] outline-none text-[var(--text-primary)] placeholder-slate-400 pr-10"
                        placeholder="Buscar proveedor..."
                      />
                      <span className="material-symbols-outlined text-[var(--text-muted)] absolute right-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none">
                        keyboard_arrow_down
                      </span>

                      {showSupplierDropdown && (
                        <div className="absolute left-0 right-0 top-12 bg-[var(--bg-surface)] border border-[var(--border-glow)] rounded-xl shadow-xl z-55 max-h-48 overflow-y-auto divide-y divide-[var(--border-glow)] text-left">
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setShowSupplierModal(true);
                              setShowSupplierDropdown(false);
                            }}
                            className="w-full text-left p-3 text-xs hover:bg-[var(--bg-app)] font-black text-[var(--accent-purple)] transition-colors border-none flex items-center gap-1.5 cursor-pointer bg-transparent"
                          >
                            <span className="material-symbols-outlined text-sm">add</span>
                            Crear Proveedor
                          </button>
                          {filteredSuppliers.map(s => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => {
                                setSupplierId(s.id);
                                setSupplierSearch(s.name);
                                setShowSupplierDropdown(false);
                              }}
                              className="w-full text-left p-2.5 text-xs hover:bg-[var(--bg-app)] font-bold text-[var(--text-secondary)] transition-colors border-none bg-transparent"
                            >
                              <div>{s.name}</div>
                              <div className="text-[9px] text-[var(--text-muted)] font-semibold">{s.contact} | {s.email}</div>
                            </button>
                          ))}
                          {filteredSuppliers.length === 0 && (
                            <div className="p-3 text-xs text-[var(--text-muted)] italic">No se encontraron proveedores.</div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-1.5">
                      Fecha de Compra
                    </label>
                    <input
                      type="date"
                      value={purchaseDate}
                      onChange={(e) => setPurchaseDate(e.target.value)}
                      className="w-full bg-[var(--bg-app)] border border-[var(--border-glow)] rounded-xl p-3 text-xs font-semibold focus:ring-1 focus:ring-[var(--accent-purple)] outline-none text-[var(--text-primary)]"
                    />
                  </div>
                </div>
              </div>

              {/* Card 3: Existencias y Estado */}
              <div className="bg-[var(--bg-surface)] border border-[var(--border-glow)] p-6 rounded-3xl shadow-sm space-y-4">
                <div className="flex items-center gap-2 pb-3 border-b border-[var(--border-glow)]">
                  <span className="material-symbols-outlined text-[var(--accent-purple)] text-lg">inventory_2</span>
                  <h3 className="text-xs font-extrabold text-[var(--text-primary)] uppercase tracking-wider">
                    Existencias y Estado del Activo
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-1.5">
                      Stock Inicial / Actual
                    </label>
                    <input
                      type="number"
                      required
                      value={stockActual}
                      onChange={(e) => setStockActual(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full bg-[var(--bg-app)] border border-[var(--border-glow)] rounded-xl p-3 text-xs font-mono font-bold focus:ring-1 focus:ring-[var(--accent-purple)] outline-none text-[var(--text-primary)]"
                      placeholder="0"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-1.5">
                      Alerta Stock Mínimo
                    </label>
                    <input
                      type="number"
                      required
                      value={stockMinLimit}
                      onChange={(e) => setStockMinLimit(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full bg-[var(--bg-app)] border border-[var(--border-glow)] rounded-xl p-3 text-xs font-mono font-bold focus:ring-1 focus:ring-[var(--accent-purple)] outline-none text-[var(--text-primary)]"
                      placeholder="0"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-1.5">
                      Estado del Activo
                    </label>
                    <CustomSelect
                      value={status}
                      onChange={setStatus}
                      options={[
                        { value: 'Operativo', label: 'Nuevo (Operativo)' },
                        { value: 'Usado', label: 'Usado' },
                        { value: 'En Mantenimiento', label: 'En Mantenimiento' },
                        { value: 'Requiere Revisión Urgentemente', label: 'Requiere Revisión Urgentemente' },
                        { value: 'Retirado de Servicio', label: 'Retirado de Servicio' }
                      ]}
                      className="w-full bg-[var(--bg-app)] border border-[var(--border-glow)] rounded-xl p-3 text-xs font-bold text-[var(--text-primary)]"
                    />
                  </div>
                </div>
              </div>

              {/* Card 4 (Conditional) Option A: Electrodomésticos / Maquinaria */}
              {category === 'Electrodomésticos / Maquinaria' && (
                <div className="bg-[var(--bg-surface)] border border-[var(--border-glow)] p-6 rounded-3xl shadow-sm space-y-5">
                  <div className="flex items-center gap-2 pb-3 border-b border-[var(--border-glow)]">
                    <span className="material-symbols-outlined text-[var(--accent-purple)] text-lg">build_circle</span>
                    <h3 className="text-xs font-extrabold text-[var(--text-primary)] uppercase tracking-wider">
                      Atributos Condicionales - Electrodomésticos
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-1.5">
                        Marca
                      </label>
                      <input
                        type="text"
                        required
                        value={brand}
                        onChange={(e) => setBrand(e.target.value)}
                        className="w-full bg-[var(--bg-app)] border border-[var(--border-glow)] rounded-xl p-3 text-xs font-semibold focus:ring-1 focus:ring-[var(--accent-purple)] outline-none text-[var(--text-primary)] placeholder-slate-400"
                        placeholder="Ej. Panasonic, Rational"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-1.5">
                        Modelo
                      </label>
                      <input
                        type="text"
                        required
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        className="w-full bg-[var(--bg-app)] border border-[var(--border-glow)] rounded-xl p-3 text-xs font-semibold focus:ring-1 focus:ring-[var(--accent-purple)] outline-none text-[var(--text-primary)] placeholder-slate-400"
                        placeholder="Ej. Pro 1200W, SCC 101"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-1.5">
                        Serial
                      </label>
                      <input
                        type="text"
                        required
                        value={serialNumber}
                        onChange={(e) => setSerialNumber(e.target.value)}
                        className="w-full bg-[var(--bg-app)] border border-[var(--border-glow)] rounded-xl p-3 text-xs font-mono font-semibold focus:ring-1 focus:ring-[var(--accent-purple)] outline-none text-[var(--text-primary)] placeholder-slate-400"
                        placeholder="Ej. PN-98234-A"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-1.5">
                        Voltaje
                      </label>
                      <CustomSelect
                        value={voltage}
                        onChange={setVoltage}
                        options={[
                          { value: '110V', label: '110V' },
                          { value: '220V', label: '220V' },
                          { value: 'Trifásica', label: 'Trifásica' }
                        ]}
                        className="w-full bg-[var(--bg-app)] border border-[var(--border-glow)] rounded-xl p-3 text-xs font-bold text-[var(--text-primary)]"
                      />
                    </div>
                  </div>

                  {/* Programación de Mantenimiento Periódico */}
                  <div className="pt-4 border-t border-[var(--border-glow)] space-y-4">
                    <h4 className="text-[11px] font-extrabold uppercase text-[var(--accent-purple)] tracking-wider flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-base">calendar_today</span>
                      Programación de Mantenimiento Periódico
                    </h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-1.5">
                          Próxima Fecha de Revisión
                        </label>
                        <input
                          type="date"
                          value={nextMaintenanceDate}
                          onChange={(e) => setNextMaintenanceDate(e.target.value)}
                          className="w-full bg-[var(--bg-app)] border border-[var(--border-glow)] rounded-xl p-3 text-xs font-semibold focus:ring-1 focus:ring-[var(--accent-purple)] outline-none text-[var(--text-primary)]"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-1.5">
                          Tipo de Mantenimiento
                        </label>
                        <CustomSelect
                          value={maintenanceType}
                          onChange={setMaintenanceType}
                          options={[
                            { value: 'Preventivo', label: 'Preventivo' },
                            { value: 'Correctivo', label: 'Correctivo' }
                          ]}
                          className="w-full bg-[var(--bg-app)] border border-[var(--border-glow)] rounded-xl p-3 text-xs font-bold text-[var(--text-primary)]"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-1.5">
                          Frecuencia de Alerta
                        </label>
                        <CustomSelect
                          value={alertFrequency}
                          onChange={setAlertFrequency}
                          options={[
                            { value: 'Mensual', label: 'Mensual' },
                            { value: 'Trimestral', label: 'Trimestral' },
                            { value: 'Semestral', label: 'Semestral' }
                          ]}
                          className="w-full bg-[var(--bg-app)] border border-[var(--border-glow)] rounded-xl p-3 text-xs font-bold text-[var(--text-primary)]"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-1.5">
                        Observaciones del Técnico
                      </label>
                      <textarea
                        value={technicianRemarks}
                        onChange={(e) => setTechnicianRemarks(e.target.value)}
                        className="w-full bg-[var(--bg-app)] border border-[var(--border-glow)] rounded-xl p-3 text-xs font-semibold focus:ring-1 focus:ring-[var(--accent-purple)] outline-none text-[var(--text-primary)] placeholder-slate-400"
                        placeholder="Ej. Técnico contratado: Carlos Gomez S.A.S. - Requiere cambio de empaque de puerta..."
                        rows={2}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Card 4 (Conditional) Option B: Menaje / Cristalería or Mobiliario */}
              {(category === 'Menaje / Cristalería' || category === 'Mobiliario') && (
                <div className="bg-[var(--bg-surface)] border border-[var(--border-glow)] p-6 rounded-3xl shadow-sm space-y-4">
                  <div className="flex items-center gap-2 pb-3 border-b border-[var(--border-glow)]">
                    <span className="material-symbols-outlined text-[var(--accent-purple)] text-lg">broken_image</span>
                    <h3 className="text-xs font-extrabold text-[var(--text-primary)] uppercase tracking-wider">
                      Atributos Condicionales - Menaje / Mobiliario
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-1.5">
                        Tipo de Material
                      </label>
                      <input
                        type="text"
                        value={materialType}
                        onChange={(e) => setMaterialType(e.target.value)}
                        className="w-full bg-[var(--bg-app)] border border-[var(--border-glow)] rounded-xl p-3 text-xs font-semibold focus:ring-1 focus:ring-[var(--accent-purple)] outline-none text-[var(--text-primary)] placeholder-slate-400"
                        placeholder="Ej. Vidrio Templado, Madera de Roble..."
                      />
                    </div>

                    {category === 'Menaje / Cristalería' && (
                      <div>
                        <label className="block text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-1.5">
                          Capacidad
                        </label>
                        <input
                          type="text"
                          value={capacity}
                          onChange={(e) => setCapacity(e.target.value)}
                          className="w-full bg-[var(--bg-app)] border border-[var(--border-glow)] rounded-xl p-3 text-xs font-semibold focus:ring-1 focus:ring-[var(--accent-purple)] outline-none text-[var(--text-primary)] placeholder-slate-400"
                          placeholder="Ej. 600ml, 12oz"
                        />
                      </div>
                    )}
                  </div>

                  {/* Auditoría Física para bajas por rotura */}
                  <div className="pt-4 border-t border-[var(--border-glow)] space-y-3">
                    <h4 className="text-[11px] font-extrabold uppercase text-[var(--accent-purple)] tracking-wider flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-base">analytics</span>
                      Auditoría Física de Roturas / Descartes
                    </h4>

                    {/* Inline Form to add break log */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-[var(--bg-app)] p-4 rounded-2xl border border-[var(--border-glow)]">
                      <div>
                        <label className="block text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">Fecha</label>
                        <input
                          type="date"
                          value={breakDate}
                          onChange={(e) => setBreakDate(e.target.value)}
                          className="w-full bg-[var(--bg-surface)] border-none rounded-lg p-2 text-xs font-semibold text-[var(--text-primary)] focus:ring-1 focus:ring-[var(--accent-purple)]"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">Cant. Bajas</label>
                        <input
                          type="number"
                          value={breakQty}
                          onChange={(e) => setBreakQty(e.target.value === '' ? '' : Number(e.target.value))}
                          className="w-full bg-[var(--bg-surface)] border-none rounded-lg p-2 text-xs font-mono font-bold text-[var(--text-primary)] focus:ring-1 focus:ring-[var(--accent-purple)]"
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">Motivo / Notas</label>
                        <input
                          type="text"
                          value={breakReason}
                          onChange={(e) => setBreakReason(e.target.value)}
                          className="w-full bg-[var(--bg-surface)] border-none rounded-lg p-2 text-xs font-semibold text-[var(--text-primary)] focus:ring-1 focus:ring-[var(--accent-purple)]"
                          placeholder="Rotura en servicio..."
                        />
                      </div>
                      <div className="flex items-end">
                        <button
                          type="button"
                          onClick={handleAddBreak}
                          className="w-full bg-[var(--accent-purple)] hover:bg-[var(--accent-purple)]/90 text-white font-extrabold py-2 px-4 rounded-lg text-xs uppercase tracking-wider transition-colors cursor-pointer border-none"
                        >
                          Añadir Baja
                        </button>
                      </div>
                    </div>

                    {/* Table of Breaks */}
                    <div className="border border-[var(--border-glow)] rounded-2xl overflow-hidden mt-3">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-[var(--bg-app)] text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                          <tr>
                            <th className="py-2.5 px-4">Fecha</th>
                            <th className="py-2.5 px-4 text-center">Cant. Descartada</th>
                            <th className="py-2.5 px-4">Motivo / Observación</th>
                            <th className="py-2.5 px-4 text-center">Acción</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-glow)] text-xs">
                          {breaksList.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="py-4 px-4 text-center text-[var(--text-muted)] italic">
                                Sin registros de bajas por rotura.
                              </td>
                            </tr>
                          ) : (
                            breaksList.map((brk, idx) => (
                              <tr key={idx} className="hover:bg-[var(--bg-app)]/30">
                                <td className="py-3 px-4 font-mono">{brk.date}</td>
                                <td className="py-3 px-4 text-center font-mono font-bold text-rose-500">-{brk.qtyDiscarded}</td>
                                <td className="py-3 px-4 text-[var(--text-muted)] font-medium">{brk.reason}</td>
                                <td className="py-3 px-4 text-center">
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveBreak(idx)}
                                    className="text-rose-500 font-extrabold hover:underline text-[10px] uppercase cursor-pointer bg-transparent border-none"
                                  >
                                    Remover
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

            </div>

            {/* Right Column (4 Cols): Image, Help card */}
            <div className="lg:col-span-4 space-y-6">
              
              {/* Imagen del Elemento */}
              <ImageUploader
                value={image}
                onChange={setImage}
                label="Imagen del Activo / Elemento"
                helperText="PNG, JPG, WEBP hasta 5MB"
              />

              {/* Digital Maitre'd Advice Card */}
              <div className="p-5 bg-gradient-to-br from-[var(--accent-purple)]/5 to-teal-500/5 dark:from-[var(--accent-purple)]/10 dark:to-teal-950/10 rounded-3xl border border-[var(--border-glow)] space-y-2">
                <span className="text-xs font-extrabold text-[var(--accent-purple)] uppercase tracking-wider block">
                  Consejo del Digital Maitre'd
                </span>
                <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                  Asegúrese de registrar el "Alerta Stock Mínimo" para recibir notificaciones automáticas cuando sea necesario reponer menaje o dotación antes de que afecte el servicio.
                </p>
              </div>
            </div>

          </div>
        )}

        {/* Actions Footer */}
        <div className="pt-6 flex justify-between items-center border-t border-[var(--border-glow)]">
          <div>
            {isEdit && asset && (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="px-8 py-3.5 bg-rose-500 hover:bg-rose-600 text-white font-black rounded-xl text-xs uppercase tracking-wider shadow-md active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer border-none animate-fade-in"
              >
                <span className="material-symbols-outlined text-sm font-bold">delete</span>
                Eliminar
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onBack}
              className="px-8 py-3.5 bg-[var(--bg-app)] hover:bg-[var(--bg-app)]/80 text-[var(--text-secondary)] rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer border-none"
            >
              <span className="material-symbols-outlined text-sm font-bold">close</span>
              Cancelar
            </button>
            
            <button
              type="submit"
              className="px-10 py-3.5 bg-[var(--accent-purple)] hover:bg-[var(--accent-purple)]/90 text-white font-black rounded-xl text-xs uppercase tracking-wider shadow-md active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer border-none"
            >
              <span className="material-symbols-outlined text-sm font-bold">save</span>
              {isDamage ? 'Enviar Reporte de Daño' : 'Guardar Elemento'}
            </button>
          </div>
        </div>
      </form>

      {showSupplierModal && (
        <Modal title="Crear Proveedor" onClose={() => setShowSupplierModal(false)}>
          <SupplierForm 
            onCancel={() => setShowSupplierModal(false)} 
            onSaved={(newId) => {
              if (newId) {
                setSupplierId(newId);
                const found = suppliers.find(s => s.id === newId);
                if (found) {
                  setSupplierSearch(found.name);
                } else {
                  db.suppliers.get(newId).then(s => {
                    if (s) setSupplierSearch(s.name);
                  });
                }
              }
              setShowSupplierModal(false);
            }} 
          />
        </Modal>
      )}

      {showDeleteConfirm && (
        <ConfirmDialog
          isOpen={showDeleteConfirm}
          title="Eliminar Activo"
          message={`¿Estás seguro de que deseas eliminar "${name}" de los activos fijos? Esta acción no se puede deshacer.`}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
}
