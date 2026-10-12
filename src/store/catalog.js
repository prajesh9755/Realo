import data from '../data/products.json';

export const products = data.products;
export const track2Presets = data.track2_presets;

export function getProduct(id) {
  return products.find((p) => p.id === id) ?? null;
}

export function formatPrice(paise) {
  if (paise === null || paise === undefined) return null;
  return `₹${paise.toLocaleString('en-IN')}`;
}

export function dimsLabel(dimsCm) {
  return `${dimsCm.w} × ${dimsCm.h} × ${dimsCm.d} cm`;
}
