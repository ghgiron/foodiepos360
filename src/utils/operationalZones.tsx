import React from 'react';
import { 
  UtensilsCrossed, 
  Wine, 
  Blend, 
  ConciergeBell, 
  PackageCheck 
} from 'lucide-react';
import type { CustomSelectOption } from '../components/ui/CustomSelect';

export type OperationalZone = 
  | 'cocina' 
  | 'bar' 
  | 'licuadoras' 
  | 'salon_servicio' 
  | 'general_operaciones';

export interface OperationalZoneConfig {
  value: OperationalZone;
  label: string;
  legacyName: string;
  icon: React.ReactNode;
}

export const STANDARDIZED_OPERATIONAL_ZONES: OperationalZoneConfig[] = [
  {
    value: 'cocina',
    label: 'Cocina',
    legacyName: 'Cocina',
    icon: <UtensilsCrossed className="w-4 h-4 text-orange-500 shrink-0" />
  },
  {
    value: 'bar',
    label: 'Bar',
    legacyName: 'Bar',
    icon: <Wine className="w-4 h-4 text-purple-500 shrink-0" />
  },
  {
    value: 'licuadoras',
    label: 'Licuadoras / Batidos',
    legacyName: 'Licuadoras',
    icon: <Blend className="w-4 h-4 text-emerald-500 shrink-0" />
  },
  {
    value: 'salon_servicio',
    label: 'Salón y Servicio',
    legacyName: 'Salón y Servicio',
    icon: <ConciergeBell className="w-4 h-4 text-amber-500 shrink-0" />
  },
  {
    value: 'general_operaciones',
    label: 'General / Almacén / Suministros',
    legacyName: 'General',
    icon: <PackageCheck className="w-4 h-4 text-blue-500 shrink-0" />
  }
];

export const OPERATIONAL_ZONE_OPTIONS: CustomSelectOption[] = STANDARDIZED_OPERATIONAL_ZONES.map(z => ({
  value: z.value,
  label: z.label,
  icon: z.icon
}));

/**
 * Normalizes any freeform zone name (from Excel, legacy settings, or inputs)
 * into a strict standardized OperationalZone union.
 */
export function normalizeOperationalZone(input?: string | null): OperationalZone {
  if (!input) return 'general_operaciones';
  const clean = input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  if (clean === 'cocina' || clean.includes('cocina')) {
    return 'cocina';
  }
  
  if (
    clean.includes('batido') || 
    clean.includes('licuadora') || 
    clean.includes('jugo') ||
    clean.includes('smoothie') ||
    clean.includes('frappe') ||
    clean === 'bar - batidos'
  ) {
    return 'licuadoras';
  }

  if (
    clean === 'bar' || 
    clean === 'barra' || 
    clean.startsWith('bar ') ||
    clean.includes('coctel') ||
    clean.includes('licor')
  ) {
    return 'bar';
  }

  if (
    clean.includes('salon') || 
    clean.includes('servicio') || 
    clean.includes('mesa')
  ) {
    return 'salon_servicio';
  }

  if (
    clean.includes('suministro') || 
    clean.includes('domicilio') || 
    clean.includes('empaque') || 
    clean.includes('almacen') || 
    clean.includes('general') || 
    clean.includes('otro')
  ) {
    return 'general_operaciones';
  }

  return 'general_operaciones';
}

/**
 * Resolves human-readable display label for an operational zone.
 */
export function getOperationalZoneLabel(zone?: string | null): string {
  const norm = normalizeOperationalZone(zone);
  const matched = STANDARDIZED_OPERATIONAL_ZONES.find(z => z.value === norm);
  return matched ? matched.label : 'General / Almacén / Suministros';
}

/**
 * Resolves icon ReactNode for an operational zone.
 */
export function getOperationalZoneIcon(zone?: string | null): React.ReactNode {
  const norm = normalizeOperationalZone(zone);
  const matched = STANDARDIZED_OPERATIONAL_ZONES.find(z => z.value === norm);
  return matched ? matched.icon : <PackageCheck className="w-4 h-4 text-blue-500 shrink-0" />;
}
