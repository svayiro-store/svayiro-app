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

export function unitLabel(unit: string, quantity = 1, customUnit = '', compact = false) {
  if (unit === 'custom') return customUnit.trim().toLowerCase() || 'unit';
  if (compact) {
    if (unit === 'piece') return 'pcs';
    if (unit === 'packet') return 'pkt';
    if (unit === 'box') return 'box';
    if (unit === 'dozen') return 'doz';
    if (unit === 'liter') return 'l';
  }
  if (unit === 'piece') return quantity === 1 ? 'piece' : 'pieces';
  if (unit === 'packet') return quantity === 1 ? 'packet' : 'packets';
  if (unit === 'box') return quantity === 1 ? 'box' : 'boxes';
  return unit;
}

export function formatProductMeasure(product: Pick<Product, 'weight' | 'unit' | 'packageQuantity' | 'metadata'>, options?: { compact?: boolean }) {
  const metadata = product.metadata || {};
  const quantity = Number(product.packageQuantity ?? metadata.packageQuantity ?? 0);
  const unit = normalizeProductUnit(product.unit || metadata.unit);
  const customUnit = String(metadata.customUnit || '');
  if (quantity > 0) return `${formatQuantityValue(quantity)} ${unitLabel(unit, quantity, customUnit, Boolean(options?.compact))}`;
  if (Number(product.weight || 0) >= 1000) return `${formatQuantityValue(Number(product.weight) / 1000)} kg`;
  if (Number(product.weight || 0) > 0) return `${Number(product.weight)} g`;
  return '';
}

export function isLooseProduct(product: Pick<Product, 'isLooseItem' | 'metadata'>) {
  return Boolean(product.isLooseItem || product.metadata?.isLooseItem);
}

export function looseStockUnit(product: Pick<Product, 'stockUnit' | 'metadata'>) {
  const unit = String(product.stockUnit || product.metadata?.stockUnit || 'g').toLowerCase();
  return unit === 'ml' || unit === 'piece' ? unit : 'g';
}

export function looseSellingUnit(product: Pick<Product, 'sellingUnit' | 'unit' | 'metadata'>) {
  const unit = String(product.sellingUnit || product.metadata?.sellingUnit || product.unit || product.metadata?.unit || 'kg').toLowerCase();
  return ['kg', 'g', 'liter', 'ml', 'piece'].includes(unit) ? unit : 'kg';
}

export function formatLooseQuantity(product: Pick<Product, 'stockUnit' | 'metadata'>, baseQuantity: number) {
  const unit = looseStockUnit(product);
  const value = Number(baseQuantity || 0);
  if (unit === 'g' && value >= 1000) return `${formatQuantityValue(value / 1000)} kg`;
  if (unit === 'ml' && value >= 1000) return `${formatQuantityValue(value / 1000)} liter`;
  if (unit === 'piece') return `${formatQuantityValue(value)} ${unitLabel('piece', value)}`;
  return `${formatQuantityValue(value)} ${unit}`;
}

export function loosePriceFactor(product: Pick<Product, 'stockUnit' | 'sellingUnit' | 'unit' | 'packageQuantity' | 'metadata'>, baseQuantity: number) {
  const metadata = product.metadata || {};
  const stock = looseStockUnit(product);
  const selling = looseSellingUnit(product);
  const packageQuantity = Math.max(0.001, Number(product.packageQuantity ?? metadata.packageQuantity ?? 1));
  let sellingQuantity = Number(baseQuantity || 0);
  if (stock === 'g' && selling === 'kg') sellingQuantity = sellingQuantity / 1000;
  if (stock === 'ml' && selling === 'liter') sellingQuantity = sellingQuantity / 1000;
  return sellingQuantity / packageQuantity;
}

export function looseQuantityOptions(product: Pick<Product, 'stockUnit' | 'metadata'>) {
  const unit = looseStockUnit(product);
  if (unit === 'ml') return [250, 500, 1000, 2000].map((value) => ({ value, label: formatLooseQuantity(product, value) }));
  if (unit === 'piece') return [1, 2, 5].map((value) => ({ value, label: formatLooseQuantity(product, value) }));
  return [250, 500, 1000, 2000].map((value) => ({ value, label: formatLooseQuantity(product, value) }));
}

export function cartQuantityLabel(product: Pick<Product, 'isLooseItem' | 'stockUnit' | 'metadata'>, quantity: number) {
  return isLooseProduct(product) ? formatLooseQuantity(product, quantity) : formatQuantityValue(quantity);
}

export function estimatePackingWeightGrams(quantity: number, unit: string) {
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  if (unit === 'kg') return Math.round(quantity * 1000);
  if (unit === 'g') return Math.round(quantity);
  if (unit === 'liter') return Math.round(quantity * 950);
  if (unit === 'ml') return Math.round(quantity * 0.95);
  return 0;
}
