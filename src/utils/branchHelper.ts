// src/utils/branchHelper.ts
import { db } from '../db/localDb';

export const DEFAULT_BRANCH_ID = 'SEDE-SAN-AGUST-N-2044';
export const DEFAULT_BRANCH_NAME = 'San Agustín';

/**
 * Returns the currently active branch ID synchronously from localStorage
 * with graceful fallbacks.
 */
export function getActiveBranchId(): string {
  if (typeof window !== 'undefined') {
    const fromFoodiepos = localStorage.getItem('foodiepos_active_branch_id');
    if (fromFoodiepos && fromFoodiepos.trim()) {
      const normalized = normalizeBranchId(fromFoodiepos);
      if (normalized !== fromFoodiepos.trim()) {
        localStorage.setItem('foodiepos_active_branch_id', normalized);
      }
      return normalized;
    }

    const fromGeneric = localStorage.getItem('active_branch_id');
    if (fromGeneric && fromGeneric.trim()) {
      const normalized = normalizeBranchId(fromGeneric);
      localStorage.setItem('foodiepos_active_branch_id', normalized);
      return normalized;
    }

    const fromSelected = localStorage.getItem('selected_branch_id');
    if (fromSelected && fromSelected.trim()) {
      const normalized = normalizeBranchId(fromSelected);
      localStorage.setItem('foodiepos_active_branch_id', normalized);
      return normalized;
    }
  }

  return DEFAULT_BRANCH_ID;
}

/**
 * Sets the active branch ID in localStorage across both standard keys
 * to maintain strict synchronization across all app modules.
 */
export function setActiveBranchId(branchId: string): void {
  if (typeof window === 'undefined' || !branchId) return;
  const cleanId = normalizeBranchId(branchId);
  localStorage.setItem('foodiepos_active_branch_id', cleanId);
  localStorage.setItem('active_branch_id', cleanId);
  localStorage.setItem('selected_branch_id', cleanId);
}

/**
 * Resolves the active branch ID asynchronously by checking localStorage,
 * Dexie systemSettings ('active_branch_id'), and the first active branch in 'system_branches'.
 */
export async function getActiveBranchIdAsync(): Promise<string> {
  const syncId = getActiveBranchId();
  if (syncId && syncId !== DEFAULT_BRANCH_ID) {
    return syncId;
  }

  try {
    const activeSetting = await db.systemSettings.get('active_branch_id');
    if (activeSetting?.value && String(activeSetting.value).trim()) {
      const dbBranchId = String(activeSetting.value).trim();
      setActiveBranchId(dbBranchId);
      return dbBranchId;
    }

    const branchesSetting = await db.systemSettings.get('system_branches');
    if (Array.isArray(branchesSetting?.value) && branchesSetting.value.length > 0) {
      const activeBranch = branchesSetting.value.find((b: any) => b.active !== false) || branchesSetting.value[0];
      if (activeBranch?.id) {
        setActiveBranchId(activeBranch.id);
        return activeBranch.id;
      }
    }
  } catch (err) {
    console.warn('[branchHelper] Error reading active branch setting from Dexie:', err);
  }

  return syncId || DEFAULT_BRANCH_ID;
}

/**
 * Formats a clean quantity display avoiding long floating point tails
 * (e.g. 972.9166666666666 -> "972,92").
 */
export function formatQuantityDecimals(qty: number, maxDecimals: number = 2): string {
  if (typeof qty !== 'number' || isNaN(qty)) return '0';
  const rounded = Math.round((qty + Number.EPSILON) * Math.pow(10, maxDecimals)) / Math.pow(10, maxDecimals);
  return rounded.toLocaleString('es-CO', {
    maximumFractionDigits: maxDecimals
  });
}

/**
 * Normalizes a branch ID to a clean, canonical string.
 * Purges ghost IDs like 'main' and trims whitespace.
 */
export function normalizeBranchId(id?: string | null): string {
  if (!id) return DEFAULT_BRANCH_ID;
  const trimmed = id.trim();
  if (trimmed.toUpperCase() === 'MAIN') return DEFAULT_BRANCH_ID;
  return trimmed;
}

/**
 * Compares two branch IDs case-insensitively and ignoring whitespace.
 */
export function areBranchIdsEqual(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  return normalizeBranchId(a).toLowerCase() === normalizeBranchId(b).toLowerCase();
}

/**
 * Consolidates an array of SucursalStock items so that no two entries
 * share the same normalized branch ID. Legacy 'main' ghost entries are
 * discarded whenever explicit branch entries exist, preventing stock doubling.
 */
export function consolidateSucursalStock<T extends { sucursalId?: string; stockActual: number; batchObservations?: string; lote?: string; fechaVencimiento?: string }>(
  list?: T[] | null
): T[] {
  if (!Array.isArray(list) || list.length === 0) return [];
  const hasRealBranch = list.some(
    entry => entry?.sucursalId && entry.sucursalId.trim().toUpperCase() !== 'MAIN'
  );
  const map = new Map<string, T>();

  for (const entry of list) {
    if (!entry || !entry.sucursalId) continue;
    const rawTrimmed = entry.sucursalId.trim();
    if (hasRealBranch && rawTrimmed.toUpperCase() === 'MAIN') {
      continue;
    }
    const cleanId = normalizeBranchId(rawTrimmed);
    const key = cleanId.toLowerCase();
    const entryStock = Number(entry.stockActual) || 0;

    const existing = map.get(key);
    if (existing) {
      const existingStock = Number(existing.stockActual) || 0;
      // Avoid doubling if both entries hold the exact same mirrored stock value
      if (Math.abs(existingStock - entryStock) < 0.001) {
        existing.stockActual = entryStock;
      } else {
        existing.stockActual = Math.max(existingStock, entryStock);
      }
      if (entry.lote && !existing.lote) existing.lote = entry.lote;
      if (entry.fechaVencimiento && !existing.fechaVencimiento) existing.fechaVencimiento = entry.fechaVencimiento;
      if (entry.batchObservations && entry.batchObservations !== existing.batchObservations) {
        existing.batchObservations = existing.batchObservations 
          ? `${existing.batchObservations}; ${entry.batchObservations}` 
          : entry.batchObservations;
      }
    } else {
      map.set(key, {
        ...entry,
        sucursalId: cleanId,
        stockActual: entryStock
      });
    }
  }

  return Array.from(map.values());
}

/**
 * Consolidates a stockByBranch map so keys representing the same branch
 * (case differences or ghost 'main') are merged into canonical keys without
 * artificially doubling stock when 'main' and the real branch coexist.
 */
export function consolidateStockByBranch(map?: Record<string, number> | null): Record<string, number> {
  if (!map || typeof map !== 'object') return {};
  const entries = Object.entries(map).filter(([k]) => Boolean(k && k.trim()));
  const hasRealBranch = entries.some(([k]) => k.trim().toUpperCase() !== 'MAIN');
  const consolidated: Record<string, number> = {};

  for (const [rawKey, rawVal] of entries) {
    const rawTrimmed = rawKey.trim();
    if (hasRealBranch && rawTrimmed.toUpperCase() === 'MAIN') {
      continue;
    }
    const cleanId = normalizeBranchId(rawTrimmed);
    const keyLower = cleanId.toLowerCase();

    const existingKey = Object.keys(consolidated).find(k => k.toLowerCase() === keyLower);
    const qty = Number(rawVal) || 0;

    if (existingKey) {
      const prev = consolidated[existingKey];
      // If one key was uppercase canonical and one lowercase duplicate, keep canonical value without doubling
      consolidated[existingKey] = Math.abs(prev - qty) < 0.001 ? qty : Math.max(prev, qty);
    } else {
      consolidated[cleanId] = qty;
    }
  }

  return consolidated;
}

/**
 * Safely updates a branch stock map for a target branch ID:
 * - Normalizes the target branch ID (converting 'main' -> DEFAULT_BRANCH_ID).
 * - Removes any existing keys matching targetBranchId case-insensitively so no duplicate keys exist.
 * - Optionally filters out invalid/ghost branch IDs when validBranchIds is supplied.
 */
export function setBranchStockValue(
  map: Record<string, number> | null | undefined,
  branchId: string,
  value: number,
  validBranchIds?: Set<string>
): Record<string, number> {
  const cleanBranchId = normalizeBranchId(branchId);
  const base = consolidateStockByBranch(map);
  const result: Record<string, number> = {};

  for (const [k, v] of Object.entries(base)) {
    if (k.toUpperCase() === 'MAIN') continue;
    if (areBranchIdsEqual(k, cleanBranchId)) continue;
    if (validBranchIds && validBranchIds.size > 0 && !validBranchIds.has(k.toLowerCase().trim())) {
      continue;
    }
    result[k] = Math.round(Math.max(0, Number(v) || 0) * 1000) / 1000;
  }

  result[cleanBranchId] = Math.round(Math.max(0, Number(value) || 0) * 1000) / 1000;
  return result;
}

/**
 * Safely updates a SucursalStock array for a target branch ID:
 * - Normalizes the target branch ID and guarantees a single canonical entry for that branch.
 * - Optionally filters out invalid/ghost branch IDs when validBranchIds is supplied.
 */
export function setSucursalStockValue<
  T extends { sucursalId?: string; stockActual: number; batchObservations?: string; lote?: string; fechaVencimiento?: string }
>(
  list: T[] | null | undefined,
  branchId: string,
  stockActual: number,
  extra?: Partial<Pick<T, 'lote' | 'fechaVencimiento' | 'batchObservations'>>,
  validBranchIds?: Set<string>
): T[] {
  const cleanBranchId = normalizeBranchId(branchId);
  const consolidated = consolidateSucursalStock(list);
  const cleanVal = Math.round(Math.max(0, Number(stockActual) || 0) * 1000) / 1000;
  const result: T[] = [];
  let matchedExisting: T | undefined;

  for (const entry of consolidated) {
    if (!entry?.sucursalId || entry.sucursalId.toUpperCase() === 'MAIN') continue;
    if (areBranchIdsEqual(entry.sucursalId, cleanBranchId)) {
      matchedExisting = entry;
      continue;
    }
    if (validBranchIds && validBranchIds.size > 0 && !validBranchIds.has(entry.sucursalId.toLowerCase().trim())) {
      continue;
    }
    result.push(entry);
  }

  result.push({
    ...(matchedExisting || ({} as T)),
    sucursalId: cleanBranchId,
    stockActual: cleanVal,
    ...(extra?.lote !== undefined ? { lote: extra.lote } : {}),
    ...(extra?.fechaVencimiento !== undefined ? { fechaVencimiento: extra.fechaVencimiento } : {}),
    ...(extra?.batchObservations !== undefined ? { batchObservations: extra.batchObservations } : {})
  });

  return result;
}
