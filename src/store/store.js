import { products, formatPrice, dimsLabel } from './catalog.js';
import { icon, stars } from '../ui/icons.js';

document.getElementById('arrow').innerHTML = icon('arrowRight');

const grid = document.getElementById('grid');

grid.innerHTML = products.map(card).join('');
grid.setAttribute('aria-busy', 'false');

function card(p) {
  const href = `/product.html?product=${encodeURIComponent(p.id)}`;
  const price = formatPrice(p.price);
  const was = p.price ? formatPrice(Math.round(p.price * 2)) : null;

  return `
    <a class="card" href="${href}">
      <div class="card-media">
        <div class="badges">
          ${p.calibration
            ? '<span class="badge badge-ref">REFERENCE</span>'
            : '<span class="badge badge-new">NEW</span><span class="badge badge-sale">-50%</span>'}
        </div>
        <button class="fav" type="button" aria-label="Save ${esc(p.name)}"
                onclick="event.preventDefault()">${icon('heart')}</button>
        <img src="${p.photo}" alt="${esc(p.name)}" loading="lazy" />
        <span class="card-action">View in real life</span>
      </div>
      ${stars(5)}
      <div class="card-name">${esc(p.name)}</div>
      <div class="card-dims">${dimsLabel(p.dims_cm)}</div>
      ${price ? `<div class="card-meta"><span>${price}</span><span class="was">${was}</span></div>` : ''}
    </a>`;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
