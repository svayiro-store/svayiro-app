import type { Product } from '../types';

export const PRODUCT_UNIT_OPTIONS = [
  { value: 'kg', label: 'kg' },
  { value: 'g', label: 'g' },
  { value: 'liter', label: 'liter' },
  { value: 'ml', label: 'ml' },
  { value: 'piece', label: 'piece' },
  { value: 'packet', label: 'packet' },
  { value: 'box', label: 'box' },
  { value: 'dozen', label: 'dozen' },
  { value: 'custom', label: 'custom' }
] as const;

export const PRODUCT_UNIT_VALUES = PRODUCT_UNIT_OPTIONS.map((option) => option.value);

export function normalizeProductUnit(unit?: string) {
  const normalized = String(unit || 'g').trim().toLowerCase();
  return PRODUCT_UNIT_VALUES.includes(normalized as any) ? normalized : 'g';
}

export function formatQuantityValue(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '';
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2))).replace(/\.0+$/, '');
}

export function unitLabel(unit: string, quantity = 1, customUnit = '') {
  if (unit === 'custom') return customUnit.trim() || 'unit';
  if (unit === 'piece') return quantity === 1 ? 'piece' : 'pieces';
  if (unit === 'packet') return quantity === 1 ? 'packet' : 'packets';
  if (unit === 'box') return quantity === 1 ? 'box' : 'boxes';
  return unit;
}

export function formatProductMeasure(product: Pick<Product, 'weight' | 'unit' | 'packageQuantity' | 'metadata'>) {
  const metadata = product.metadata || {};
  const quantity = Number(product.packageQuantity ?? metadata.packageQuantity ?? 0);
  const unit = normalizeProductUnit(product.unit || metadata.unit);
  const customUnit = String(metadata.customUnit || '');
  if (quantity > 0) return `${formatQuantityValue(quantity)} ${unitLabel(unit, quantity, customUnit)}`;
  if (Number(product.weight || 0) >= 1000) return `${formatQuantityValue(Number(product.weight) / 1000)} kg`;
  if (Number(product.weight || 0) > 0) return `${Number(product.weight)} g`;
  return '';
}

export function estimatePackingWeightGrams(quantity: number, unit: string) {
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  if (unit === 'kg') return Math.round(quantity * 1000);
  if (unit === 'g') return Math.round(quantity);
  if (unit === 'liter') return Math.round(quantity * 950);
  if (unit === 'ml') return Math.round(quantity * 0.95);
  return 0;
}
