import { getProduct, formatPrice, dimsLabel } from './catalog.js';
import { checkArSupport } from '../ar/session.js';
import { icon, stars } from '../ui/icons.js';

const el = document.getElementById('pdp');
const crumb = document.getElementById('crumb');
const id = new URLSearchParams(location.search).get('product');
const product = id ? getProduct(id) : null;

if (!product) {
  el.innerHTML = '<p class="status is-error">Product not found. <a href="/" style="text-decoration:underline">Back to the store</a>.</p>';
  el.setAttribute('aria-busy', 'false');
} else {
  render();
}

function render() {
  const price = formatPrice(product.price);
  const was = product.price ? formatPrice(Math.round(product.price * 2)) : null;

  crumb.innerHTML = `
    <a href="/">Shop</a>
    <span class="sep">${icon('chevronRight')}</span>
    <span class="here">${esc(product.name)}</span>`;

  el.innerHTML = `
    <div class="pdp-media">
      <div class="badges">
        ${product.calibration
          ? '<span class="badge badge-ref">REFERENCE</span>'
          : '<span class="badge badge-new">NEW</span><span class="badge badge-sale">-50%</span>'}
      </div>
      <img src="${product.photo}" alt="${esc(product.name)}" />
    </div>

    <div>
      ${stars(5)}
      <h1>${esc(product.name)}</h1>
      ${price ? `<p class="price">${price} <span class="was" style="font-size:16px">${was}</span></p>` : ''}
      <p class="blurb">${esc(product.blurb)}</p>

      <table class="spec">
        <tr><th>Width</th><td>${product.dims_cm.w} cm</td></tr>
        <tr><th>Height</th><td>${product.dims_cm.h} cm</td></tr>
        <tr><th>Depth</th><td>${product.dims_cm.d} cm</td></tr>
      </table>

      <a class="btn btn-sm" id="view-ar" href="/ar.html?product=${encodeURIComponent(product.id)}">
        ${icon('cube')} View in real life
      </a>
      <p class="note" id="ar-note">Checking device support</p>
    </div>`;

  el.setAttribute('aria-busy', 'false');
  document.title = `${product.name} — Realo`;
  annotateSupport();
}

async function annotateSupport() {
  const note = document.getElementById('ar-note');
  const support = await checkArSupport();
  note.innerHTML = support.ok
    ? `<strong>Ready.</strong> It will appear at ${dimsLabel(product.dims_cm)}, measured against your floor.`
    : `<strong>No live camera preview on this device.</strong> ${esc(support.message)} You will get a 3D preview instead.`;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
