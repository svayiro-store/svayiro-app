import React, { useMemo, useState } from 'react';
import { Download, Printer, Scale, Search } from 'lucide-react';
import { api } from '../../api';
import { Product } from '../../types';

const PAGE_SIZE = 100;
const CODE128_PATTERNS = [
  '212222','222122','222221','121223','121322','131222','122213','122312','132212','221213','221312','231212','112232','122132','122231','113222','123122','123221','223211','221132','221231','213212','223112','312131','311222','321122','321221','312212','322112','322211','212123','212321','232121','111323','131123','131321','112313','132113','132311','211313','231113','231311','112133','112331','132131','113123','113321','133121','313121','211331','231131','213113','213311','213131','311123','311321','331121','312113','312311','332111','314111','221411','431111','111224','111422','121124','121421','141122','141221','112214','112412','122114','122411','142112','142211','241211','221114','413111','241112','134111','111242','121142','121241','114212','124112','124211','411212','421112','421211','212141','214121','412121','111143','111341','131141','114113','114311','411113','411311','113141','114131','311141','411131','211412','211214','211232','2331112'
];

interface Props {
  isDarkMode: boolean;
}

function code128SvgDataUri(value: string) {
  const safeValue = value.replace(/[^\x20-\x7E]/g, '').slice(0, 80) || 'SVAYIRO';
  const codes = [104, ...safeValue.split('').map((char) => char.charCodeAt(0) - 32)];
  const checksum = codes.reduce((sum, code, index) => sum + (index === 0 ? code : code * index), 0) % 103;
  const sequence = [...codes, checksum, 106];
  let x = 10;
  const height = 52;
  const moduleWidth = 2;
  const bars = sequence.map((code) => {
    const pattern = CODE128_PATTERNS[code];
    let local = '';
    [...pattern].forEach((widthChar, index) => {
      const width = Number(widthChar) * moduleWidth;
      if (index % 2 === 0) local += `<rect x="${x}" y="8" width="${width}" height="${height}" fill="#020617"/>`;
      x += width;
    });
    return local;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${x + 10}" height="76" viewBox="0 0 ${x + 10} 76"><rect width="100%" height="100%" fill="#fff"/>${bars}<text x="${(x + 10) / 2}" y="72" text-anchor="middle" font-family="monospace" font-size="10" fill="#020617">${safeValue}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char] || char));
}

function todayYmd() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

function stockUnit(product: Product) {
  return String(product.stockUnit || product.metadata?.stockUnit || 'g');
}

function sellingUnit(product: Product) {
  return String(product.sellingUnit || product.metadata?.sellingUnit || product.unit || 'kg');
}

function quantityLabel(quantity: number, unit: string) {
  if (unit === 'g' && quantity >= 1000) return `${Number((quantity / 1000).toFixed(3))} kg`;
  if (unit === 'ml' && quantity >= 1000) return `${Number((quantity / 1000).toFixed(3))} liter`;
  const label = unit === 'piece' && quantity !== 1 ? 'pieces' : unit;
  return `${Number(quantity.toFixed(2)).toString().replace(/\.0+$/, '')} ${label}`;
}

function priceFactor(product: Product, baseQuantity: number) {
  const baseUnit = stockUnit(product);
  const saleUnit = sellingUnit(product);
  const packageQuantity = Math.max(0.001, Number(product.packageQuantity || product.metadata?.packageQuantity || 1));
  let saleQuantity = baseQuantity;
  if (baseUnit === 'g' && saleUnit === 'kg') saleQuantity = baseQuantity / 1000;
  if (baseUnit === 'ml' && saleUnit === 'liter') saleQuantity = baseQuantity / 1000;
  return saleQuantity / packageQuantity;
}

function buildLooseBarcode(product: Product, quantity: number, amount: number) {
  const plu = String(product.pluCode || product.metadata?.pluCode || '').trim();
  return `SVL|${plu}|${Math.max(0, Math.round(quantity))}|${Math.max(0, Math.round(amount * 100))}|${todayYmd()}`;
}

export default function LooseLabelsView({ isDarkMode }: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [quantity, setQuantity] = useState('');

  const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100';
  const panelClass = `rounded-xl border p-4 shadow-sm ${isDarkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'}`;

  const loadProducts = async (reset = false) => {
    if (loading) return;
    setLoading(true);
    try {
      const nextOffset = reset ? 0 : offset;
      const rows = await api.getProducts({ limit: PAGE_SIZE, offset: nextOffset, includeDisabled: true });
      setProducts((current) => {
        if (reset) return rows;
        const known = new Set(current.map((product) => product.id));
        return [...current, ...rows.filter((product) => !known.has(product.id))];
      });
      setOffset(nextOffset + rows.length);
      setHasMore(rows.length === PAGE_SIZE);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    loadProducts(true).catch(() => {});
  }, []);

  const looseProducts = useMemo(() => products.filter((product) => product.isLooseItem || product.metadata?.isLooseItem), [products]);
  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return looseProducts;
    return looseProducts.filter((product) => [
      product.name,
      product.sku,
      product.pluCode,
      product.metadata?.pluCode,
      product.looseSection,
      product.metadata?.looseSection
    ].filter(Boolean).join(' ').toLowerCase().includes(query));
  }, [looseProducts, search]);

  const selectedProduct = filteredProducts.find((product) => product.id === selectedId) || looseProducts.find((product) => product.id === selectedId) || filteredProducts[0];
  const baseQuantity = Math.max(0, Number(quantity || 0));
  const activePrice = selectedProduct ? Number(selectedProduct.offerPrice > 0 ? selectedProduct.offerPrice : selectedProduct.basePrice) : 0;
  const amount = selectedProduct ? Math.round(activePrice * priceFactor(selectedProduct, baseQuantity) * 100) / 100 : 0;
  const barcodeValue = selectedProduct && baseQuantity > 0 ? buildLooseBarcode(selectedProduct, baseQuantity, amount) : '';
  const labelQuantity = selectedProduct ? quantityLabel(baseQuantity, stockUnit(selectedProduct)) : '';

  const labelHtml = () => {
    if (!selectedProduct || !barcodeValue) return '';
    return `
      <section class="label">
        <div class="brand">SVAYIRO</div>
        <div class="name">${escapeHtml(selectedProduct.name)}</div>
        <div class="line"><span>${escapeHtml(labelQuantity)}</span><strong>Rs ${amount.toFixed(2)}</strong></div>
        <div class="price"><span>MRP Rs ${Number(selectedProduct.basePrice || 0).toFixed(0)}</span>${selectedProduct.offerPrice > 0 ? `<span>OFF Rs ${Number(selectedProduct.offerPrice || 0).toFixed(0)}</span>` : ''}</div>
        <img class="barcode" src="${code128SvgDataUri(barcodeValue)}" alt="${escapeHtml(barcodeValue)}" />
      </section>
    `;
  };

  const labelDocument = (print = false) => `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>SVAYIRO Loose Item Label</title>
        <style>
          *{box-sizing:border-box}html,body{margin:0;padding:0;width:50mm;background:#fff;font-family:Arial,sans-serif;color:#000}
          .label{width:50mm;height:25mm;padding:1.2mm 1.9mm;overflow:hidden}
          .brand{border-bottom:.25mm solid #000;padding-bottom:.3mm;font-size:7px;font-weight:900;letter-spacing:.035em;line-height:1}
          .name{margin-top:.45mm;font-size:7.2px;line-height:1.05;max-height:4mm;overflow:hidden}
          .line{display:flex;justify-content:space-between;gap:1mm;margin-top:.45mm;font-size:7.2px;line-height:1}
          .line strong{font-size:8px;font-weight:900}.price{display:flex;justify-content:space-between;gap:1mm;margin-top:.3mm;font-size:5.8px;line-height:1;font-weight:400}
          .barcode{display:block;width:100%;height:7.4mm;object-fit:contain;margin-top:.25mm}
          @page{size:50mm 25mm;margin:0}
        </style>
      </head>
      <body>${labelHtml()}${print ? '<script>window.onload=()=>{window.focus();window.print();};</script>' : ''}</body>
    </html>
  `;

  const printLabel = () => {
    if (!barcodeValue) return;
    const popup = window.open('', '_blank', 'width=700,height=500');
    if (!popup) {
      alert('Popup blocked. Allow popups to print labels.');
      return;
    }
    popup.document.write(labelDocument(true));
    popup.document.close();
  };

  const downloadLabel = () => {
    if (!barcodeValue) return;
    const blob = new Blob([labelDocument(false)], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `svayiro-loose-label-${selectedProduct?.pluCode || selectedProduct?.metadata?.pluCode || 'plu'}.html`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-serif text-2xl font-semibold">Loose Weighing Labels</h2>
        <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
          Weigh loose items here, print a PLU barcode label, then scan that label in Walk-In POS billing.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(260px,0.9fr)_minmax(300px,1fr)]">
        <section className={panelClass}>
          <div className="mb-3 flex items-center gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
            <Scale className="h-4 w-4 text-emerald-700" />
            <h3 className="text-xs font-semibold uppercase text-indigo-800 dark:text-indigo-300">Select Loose Product</h3>
          </div>
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase text-slate-500">Search PLU / item name</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input className={`${inputClass} pl-9`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="e.g. tomato, rice, 101" />
            </div>
          </label>

          <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {filteredProducts.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs font-semibold text-slate-500">
                No loose products found. Mark products as loose/weighed in Product Catalogue first.
              </div>
            ) : filteredProducts.map((product) => {
              const active = selectedProduct?.id === product.id;
              return (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => setSelectedId(product.id)}
                  className={`grid w-full grid-cols-[1fr_auto] items-center gap-3 rounded-lg border p-3 text-left text-xs transition ${
                    active
                      ? 'border-indigo-700 bg-indigo-50 text-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-100'
                      : 'border-slate-200 bg-white hover:border-indigo-200 dark:border-slate-800 dark:bg-slate-950'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{product.name}</span>
                    <span className="block text-[10px] font-semibold text-slate-500">
                      Price per {product.packageQuantity || product.metadata?.packageQuantity || 1} {sellingUnit(product)} - Stock {product.stockCount} {stockUnit(product)}
                    </span>
                  </span>
                  <span className="rounded bg-emerald-50 px-2 py-1 font-mono text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                    PLU {product.pluCode || product.metadata?.pluCode}
                  </span>
                </button>
              );
            })}
          </div>
          {hasMore && (
            <button
              type="button"
              onClick={() => loadProducts(false)}
              disabled={loading}
              className="mt-3 w-full rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-800 disabled:opacity-50 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-200"
            >
              {loading ? 'Loading...' : 'Load More Products'}
            </button>
          )}
        </section>

        <section className={panelClass}>
          <div className="mb-3 border-b border-slate-200 pb-3 dark:border-slate-800">
            <h3 className="text-xs font-semibold uppercase text-indigo-800 dark:text-indigo-300">Generate Barcode Label</h3>
            <p className="mt-1 text-[10px] font-semibold text-slate-500">Label size: 50mm x 25mm. Enter exact weighed quantity in the stock unit.</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className="mb-1 block text-[10px] font-semibold uppercase text-slate-500">Weighed Quantity ({selectedProduct ? stockUnit(selectedProduct) : 'unit'})</span>
              <input className={inputClass} type="number" min="0" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value.replace(/[^\d.]/g, ''))} placeholder="e.g. 750" />
            </label>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-950">
              <p className="text-[10px] font-semibold uppercase text-slate-500">Calculated Amount</p>
              <p className="mt-1 text-xl font-bold text-emerald-700">Rs. {amount.toFixed(2)}</p>
              <p className="text-[10px] font-semibold text-slate-500">{baseQuantity > 0 ? labelQuantity : 'Enter quantity'}</p>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
            {barcodeValue ? (
              <div className="mx-auto w-[50mm] rounded border border-slate-300 bg-white p-1 text-black shadow-sm">
                <div dangerouslySetInnerHTML={{ __html: labelHtml() }} />
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-xs font-semibold text-slate-500">
                Select product and enter quantity to preview label.
              </div>
            )}
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={printLabel}
              disabled={!barcodeValue}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-700 px-4 py-3 text-xs font-semibold uppercase text-white shadow disabled:opacity-50"
            >
              <Printer className="h-4 w-4" />
              Print Label
            </button>
            <button
              type="button"
              onClick={downloadLabel}
              disabled={!barcodeValue}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-3 text-xs font-semibold uppercase text-slate-800 shadow-sm disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              <Download className="h-4 w-4" />
              Download Template
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
