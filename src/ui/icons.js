/**
 * One stroke-based icon set, uniform 1.5 stroke and round caps.
 * Matches UI SCREENS/05-icons.png. No emoji anywhere.
 */
const S = 'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';

export const icons = {
  arrowRight: `<svg viewBox="0 0 24 24" ${S}><path d="M4 12h16M14 6l6 6-6 6"/></svg>`,

  heart: `<svg viewBox="0 0 24 24" ${S}><path d="M12 20s-7-4.35-7-9.5A3.5 3.5 0 0 1 12 8a3.5 3.5 0 0 1 7 2.5c0 5.15-7 9.5-7 9.5z"/></svg>`,

  star: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5l2.9 5.9 6.6.9-4.8 4.6 1.2 6.5-5.9-3.1-5.9 3.1 1.2-6.5L2.5 9.3l6.6-.9z"/></svg>`,

  cube: `<svg viewBox="0 0 24 24" ${S}><path d="M12 2.8l8 4.6v9.2l-8 4.6-8-4.6V7.4z"/><path d="M4 7.4l8 4.6 8-4.6M12 12v9.2"/></svg>`,

  camera: `<svg viewBox="0 0 24 24" ${S}><path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.2l1.2-2h8.2l1.2 2h2.2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z"/><circle cx="12" cy="12.5" r="3.4"/></svg>`,

  ruler: `<svg viewBox="0 0 24 24" ${S}><path d="M3.8 14.6L14.6 3.8a1.2 1.2 0 0 1 1.7 0l3.9 3.9a1.2 1.2 0 0 1 0 1.7L9.4 20.2a1.2 1.2 0 0 1-1.7 0l-3.9-3.9a1.2 1.2 0 0 1 0-1.7z"/><path d="M7.5 11l1.8 1.8M10.3 8.2l1.8 1.8M13.1 5.4l1.8 1.8"/></svg>`,

  close: `<svg viewBox="0 0 24 24" ${S}><path d="M6 6l12 12M18 6L6 18"/></svg>`,

  refresh: `<svg viewBox="0 0 24 24" ${S}><path d="M20 11a8 8 0 1 0-.7 4.3"/><path d="M20 5v6h-6"/></svg>`,

  chevronRight: `<svg viewBox="0 0 24 24" ${S}><path d="M9 5l7 7-7 7"/></svg>`,

  image: `<svg viewBox="0 0 24 24" ${S}><rect x="3" y="4.5" width="18" height="15" rx="1.5"/><circle cx="8.5" cy="10" r="1.6"/><path d="M3.5 17l5-4.5 4 3.5 3-2.5 5 4"/></svg>`
};

export function icon(name, cls = '') {
  const svg = icons[name];
  if (!svg) return '';
  return cls ? svg.replace('<svg ', `<svg class="${cls}" `) : svg;
}

export function stars(n = 5) {
  return `<span class="stars">${icons.star.repeat(n)}</span>`;
}
