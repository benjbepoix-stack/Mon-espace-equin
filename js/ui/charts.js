/* Graphiques légers sans dépendance : anneau (donut) et courbe SVG. */
import { esc } from '../core/utils.js';
import { formatKey } from '../core/dates.js';
import { isEntering, tween } from './motion.js';

// Couleurs par défaut ; le thème peut les redéfinir via --series-1 … --series-8.
const DEFAULT_SERIES = ['#2ee6a8', '#6c8cff', '#ffc24b', '#ff7a85', '#b48cff', '#4fd1d9', '#ff9ecf', '#9aa8bf'];
export const PALETTE = DEFAULT_SERIES.map((hex, i) => `var(--series-${i + 1}, ${hex})`);

/**
 * Anneau de répartition.
 * @param {{donut:HTMLElement, legend:HTMLElement, total:HTMLElement}} els
 * @param {Array<[string, number, string?]>} entries  [libellé, valeur, couleur facultative]
 * @param {string} emptyText
 * @param {{format?:(n:number)=>string}} options
 */
export function renderDonut({ donut, legend, total }, entries, emptyText, { format = n => String(n) } = {}) {
  const sum = entries.reduce((s, [, n]) => s + n, 0);
  total.textContent = format(sum);
  if (!sum) {
    donut.style.setProperty('--donut', 'conic-gradient(var(--surface-3) 0deg 360deg)');
    legend.innerHTML = `<p class="chart-empty">${esc(emptyText)}</p>`;
    return;
  }
  const colorOf = (entry, i) => entry[2] || PALETTE[i % PALETTE.length];
  // k de 0 à 1 : part de l'anneau déjà dessinée (remplissage animé à l'arrivée sur la vue).
  const paint = k => {
    let cursor = 0;
    const stops = entries.map((entry, i) => {
      const start = (cursor / sum) * 360 * k;
      cursor += entry[1];
      const end = (cursor / sum) * 360 * k;
      // léger espace entre segments pour un rendu plus raffiné
      const gap = entries.length > 1 ? 1.2 * k : 0;
      const color = colorOf(entry, i);
      return `${color} ${start}deg ${Math.max(start, end - gap)}deg, transparent ${Math.max(start, end - gap)}deg ${end}deg`;
    });
    donut.style.setProperty('--donut', `conic-gradient(${stops.join(',')}, var(--surface-3) ${360 * k}deg 360deg)`);
  };
  if (isEntering(donut)) tween(donut, 800, paint);
  else paint(1);
  legend.innerHTML = entries
    .map(
      (entry, i) =>
        `<div class="legend__item"><span class="legend__dot" style="--c:${colorOf(entry, i)}"></span><span class="legend__name">${esc(entry[0])}</span><span class="legend__count">${esc(format(entry[1]))}</span><span class="legend__pct">${Math.round((entry[1] / sum) * 100)}%</span></div>`
    )
    .join('');
}

/* ---------- Courbe d'évolution ---------- */

/** Tracé cubique monotone (Fritsch–Carlson) : lisse sans jamais dépasser les valeurs réelles. */
function monotonePath(pts) {
  if (pts.length === 1) return `M${pts[0][0]},${pts[0][1]}`;
  const n = pts.length;
  const dx = [];
  const m = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1][0] - pts[i][0];
    m[i] = (pts[i + 1][1] - pts[i][1]) / dx[i];
  }
  const t = [m[0]];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i]);
  t[n - 1] = m[n - 2];
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${pts[i][0] + h},${pts[i][1] + h * t[i]} ${pts[i + 1][0] - h},${pts[i + 1][1] - h * t[i + 1]} ${pts[i + 1][0]},${pts[i + 1][1]}`;
  }
  return d;
}

/** Graduations « rondes » couvrant [min, max]. */
function niceTicks(min, max, count = 3) {
  const raw = (max - min) / (count - 1) || 1;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(f => f * pow).find(s => s >= raw) || raw;
  const start = Math.floor(min / step) * step;
  const ticks = [];
  for (let v = start; v <= max + step * 0.001; v += step) ticks.push(Number(v.toFixed(6)));
  if (ticks[ticks.length - 1] < max) ticks.push(Number((ticks[ticks.length - 1] + step).toFixed(6)));
  return ticks;
}

/**
 * Courbe d'évolution (6 points max affichés).
 * Étiquettes sélectives (dernière valeur, min, max) + info-bulle au toucher / survol.
 * @param {HTMLElement} host
 * @param {Array<{date:string,value:number}>} rows  triés par date croissante
 */
export function renderLineChart(host, rows, { unit, decimals = 0, minPad = 1 }) {
  if (!rows.length) {
    host.innerHTML = '<p class="chart-empty">Aucune mesure enregistrée pour le moment.</p>';
    return;
  }
  const fmt = v => `${Number(v).toFixed(decimals).replace('.', ',')}${unit}`;
  // Largeur réelle en pixels : le texte SVG garde sa taille sur mobile.
  const W = Math.max(300, Math.round(host.clientWidth || 600));
  const H = 210;
  const L = 44;
  const R = 18;
  const T = 30;
  const B = 36;
  const plotW = W - L - R;
  const plotH = H - T - B;

  const values = rows.map(r => r.value);
  const pad = Math.max((Math.max(...values) - Math.min(...values)) * 0.08, minPad * 0.5);
  const ticks = niceTicks(Math.min(...values) - pad, Math.max(...values) + pad, 4);
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const x = i => L + (rows.length === 1 ? plotW / 2 : (i / (rows.length - 1)) * plotW);
  const y = v => T + ((hi - v) / (hi - lo || 1)) * plotH;
  const pts = rows.map((r, i) => [x(i), y(r.value)]);
  const last = rows.length - 1;

  const line = monotonePath(pts);
  const area = rows.length > 1 ? `${line} L${pts[last][0]},${T + plotH} L${pts[0][0]},${T + plotH} Z` : '';
  const tickDecimals = ticks.some(t => !Number.isInteger(t)) ? 1 : 0;
  const grid = ticks
    .map(t => `<line class="chart-grid" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text class="chart-axis" x="${L - 10}" y="${y(t) + 4}" text-anchor="end">${t.toFixed(tickDecimals).replace('.', ',')}</text>`)
    .join('');

  // Axe des dates : étiquettes centrées et contenues dans le graphique ; on en
  // saute une sur deux si elles sont trop serrées. L'année n'apparaît qu'au
  // premier point affiché et quand elle change.
  const spacing = rows.length > 1 ? plotW / (rows.length - 1) : plotW;
  const every = spacing < 58 ? 2 : 1;
  let lastYear = null;
  const dates = rows
    .map((r, i) => {
      if (i % every !== 0 && i !== last) return '';
      if (every === 2 && i === last - 1) return '';
      const text = formatKey(r.date, { day: 'numeric', month: 'short' });
      const half = (text.length * 6.2) / 2;
      const lx = Math.min(Math.max(x(i), half + 2), W - half - 2);
      const year = r.date.slice(0, 4);
      const showYear = year !== lastYear;
      lastYear = year;
      return `<text class="chart-date" x="${lx}" y="${H - 16}" text-anchor="middle">${text}</text>${showYear ? `<text class="chart-year" x="${lx}" y="${H - 2}" text-anchor="middle">${year}</text>` : ''}`;
    })
    .join('');

  // Étiquettes sélectives : min, max et dernière valeur (mise en avant).
  // Chaque étiquette se place du côté opposé à la courbe voisine.
  let minI = 0;
  let maxI = 0;
  values.forEach((v, i) => {
    if (v < values[minI]) minI = i;
    if (v > values[maxI]) maxI = i;
  });
  const labelled = new Set([last]);
  if (rows.length >= 3 && values[minI] !== values[maxI]) [minI, maxI].forEach(i => labelled.add(i));
  const labels = [...labelled]
    .map(i => {
      const [px, py] = pts[i];
      const neighbours = [values[i - 1], values[i + 1]].filter(v => v !== undefined);
      const isLow = i === minI || (i !== maxI && neighbours.some(v => v > values[i]));
      const ly = isLow ? py + 21 : py - 13;
      const anchor = rows.length > 1 && i === 0 ? 'start' : rows.length > 1 && i === last ? 'end' : 'middle';
      const lx = anchor === 'start' ? px - 4 : anchor === 'end' ? px + 4 : px;
      return `<text class="chart-value ${i === last ? 'chart-value--last' : ''}" x="${lx}" y="${Math.max(ly, 12)}" text-anchor="${anchor}">${fmt(values[i])}</text>`;
    })
    .join('');

  const dots = pts.map(([px, py], i) => (i === last ? '' : `<circle class="chart-dot" cx="${px}" cy="${py}" r="4"/>`)).join('');
  const lastDot = `<circle class="chart-halo" cx="${pts[last][0]}" cy="${pts[last][1]}" r="11"/><circle class="chart-dot chart-dot--last" cx="${pts[last][0]}" cy="${pts[last][1]}" r="5.5"/>`;

  const gid = `g${Math.random().toString(36).slice(2, 8)}`;
  const summary = rows.length > 1 ? `de ${fmt(values[0])} le ${formatKey(rows[0].date)} à ${fmt(values[last])} le ${formatKey(rows[last].date)}` : `${fmt(values[0])} le ${formatKey(rows[0].date)}`;
  host.innerHTML = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Évolution ${summary}">
    <defs><linearGradient id="${gid}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".22"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
    ${grid}${area ? `<path d="${area}" fill="url(#${gid})"/>` : ''}<path class="chart-line" d="${line}"/>
    ${dots}${lastDot}${labels}${dates}
    <line class="chart-cursor" x1="0" x2="0" y1="${T - 6}" y2="${T + plotH}" visibility="hidden"/>
    <circle class="chart-dot chart-dot--active" r="6" visibility="hidden"/>
    <rect class="chart-hit" x="${L - 12}" y="0" width="${plotW + 24}" height="${T + plotH + 8}"/>
  </svg><div class="chart-tip" hidden></div>`;

  /* Info-bulle : point le plus proche du doigt / de la souris. */
  const svg = host.querySelector('svg');
  const tip = host.querySelector('.chart-tip');
  const cursor = svg.querySelector('.chart-cursor');
  const active = svg.querySelector('.chart-dot--active');
  let hideTimer = null;
  const show = e => {
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let i = 0;
    pts.forEach((p, k) => {
      if (Math.abs(p[0] - px) < Math.abs(pts[i][0] - px)) i = k;
    });
    const [cx, cy] = pts[i];
    cursor.setAttribute('x1', cx);
    cursor.setAttribute('x2', cx);
    cursor.setAttribute('visibility', 'visible');
    active.setAttribute('cx', cx);
    active.setAttribute('cy', cy);
    active.setAttribute('visibility', 'visible');
    const prev = i > 0 ? values[i] - values[i - 1] : null;
    const deltaCls = prev === null || Math.abs(prev) < 1e-9 ? 'neutral' : prev > 0 ? 'up' : 'down';
    const deltaText = prev === null ? '' : Math.abs(prev) < 1e-9 ? 'Stable' : `${prev > 0 ? '+' : '−'}${fmt(Math.abs(prev))}`;
    tip.innerHTML = `<strong>${esc(fmt(values[i]))}</strong><span>${esc(formatKey(rows[i].date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }))}</span>${deltaText ? `<em class="delta delta--${deltaCls}">${esc(deltaText)}</em>` : ''}`;
    tip.hidden = false;
    const scale = rect.width / W;
    const left = Math.min(Math.max(cx * scale - tip.offsetWidth / 2, 0), rect.width - tip.offsetWidth);
    tip.style.transform = `translate(${left}px, ${Math.max(cy * scale - tip.offsetHeight - 16, -8)}px)`;
  };
  const hide = () => {
    tip.hidden = true;
    cursor.setAttribute('visibility', 'hidden');
    active.setAttribute('visibility', 'hidden');
  };
  svg.addEventListener('pointermove', e => {
    clearTimeout(hideTimer);
    show(e);
  });
  svg.addEventListener('pointerdown', e => {
    clearTimeout(hideTimer);
    show(e);
  });
  svg.addEventListener('pointerleave', e => {
    // Au doigt, l'info-bulle reste lisible un instant après le toucher.
    hideTimer = setTimeout(hide, e.pointerType === 'mouse' ? 0 : 2500);
  });
}

/* ---------- Barres groupées (évolution mensuelle) ---------- */

/** Barre à sommet arrondi, ancrée sur la ligne de base. */
function barPath(x, y, w, base, r = 4) {
  const h = base - y;
  if (h <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${x},${base} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${base} Z`;
}

/**
 * Barres groupées par mois + courbe optionnelle, info-bulle au toucher.
 * @param {HTMLElement} host
 * @param {Array<{key:string,label:string,values:Record<string,number>}>} groups
 * @param {{bars:Array<{key,label,color}>, line?:{key,label,color}, fmt:Function, axisFmt:Function, highlight?:string, extra?:Function}} options
 */
export function renderBarChart(host, groups, { bars, line, fmt, axisFmt, highlight, extra }) {
  const all = groups.flatMap(g => [...bars.map(b => g.values[b.key] || 0), line ? g.values[line.key] || 0 : 0]);
  const max = Math.max(...all, 0);
  const legend = `<div class="chart-legend">${[...bars, ...(line ? [line] : [])]
    .map(s => `<span class="chart-legend__item"><span class="chart-legend__swatch ${s === line ? 'is-line' : ''}" style="--c:${s.color}"></span>${esc(s.label)}</span>`)
    .join('')}</div>`;
  if (!max) {
    host.innerHTML = `${legend}<p class="chart-empty">Pas encore de données sur cette période.</p>`;
    return;
  }
  const W = Math.max(300, Math.round(host.clientWidth || 600));
  const H = 220;
  const L = 46;
  const R = 8;
  const T = 14;
  const B = 28;
  const plotW = W - L - R;
  const plotH = H - T - B;
  const ticks = niceTicks(0, max, 4);
  const hi = ticks[ticks.length - 1];
  const y = v => T + plotH - (v / hi) * plotH;
  const base = T + plotH;
  const groupW = plotW / groups.length;
  const gap = 2;
  const barW = Math.max(3, Math.min(14, (groupW * 0.72 - gap * (bars.length - 1)) / bars.length));
  const cx = i => L + groupW * i + groupW / 2;

  const grid = ticks.map(t => `<line class="chart-grid" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text class="chart-axis" x="${L - 8}" y="${y(t) + 4}" text-anchor="end">${esc(axisFmt(t))}</text>`).join('');
  const rects = groups
    .map((g, i) => {
      const start = cx(i) - (barW * bars.length + gap * (bars.length - 1)) / 2;
      return bars.map((b, k) => `<path class="chart-bar" style="--i:${i}" d="${barPath(start + k * (barW + gap), y(g.values[b.key] || 0), barW, base)}" fill="${b.color}"/>`).join('');
    })
    .join('');
  let lineSvg = '';
  if (line) {
    // La courbe commence au premier mois qui contient des données.
    const first = groups.findIndex(g => g.hasData !== false);
    const shown = first === -1 ? [] : groups.map((g, i) => [g, i]).slice(first);
    const pts = shown.map(([g, i]) => `${cx(i)},${y(g.values[line.key] || 0)}`).join(' ');
    lineSvg = shown.length ? `<polyline class="chart-series-line" points="${pts}" style="stroke:${line.color}"/>${shown.map(([g, i]) => `<circle class="chart-series-dot" cx="${cx(i)}" cy="${y(g.values[line.key] || 0)}" r="3.5" style="stroke:${line.color}"/>`).join('')}` : '';
  }
  const every = groupW < 26 ? 2 : 1;
  const labels = groups
    .map((g, i) => ((groups.length - 1 - i) % every === 0 ? `<text class="chart-date ${g.key === highlight ? 'is-current' : ''}" x="${cx(i)}" y="${H - 10}" text-anchor="middle">${esc(g.label)}</text>` : ''))
    .join('');

  host.innerHTML = `${legend}<div class="chart-host"><svg class="chart chart--bars" viewBox="0 0 ${W} ${H}" role="img" aria-label="Évolution mensuelle">
    ${grid}<rect class="chart-band" x="0" y="${T}" width="${groupW}" height="${plotH}" visibility="hidden"/>${rects}${lineSvg}${labels}
    <rect class="chart-hit" x="${L}" y="0" width="${plotW}" height="${base}"/>
  </svg><div class="chart-tip" hidden></div></div>`;

  const svg = host.querySelector('svg');
  const tip = host.querySelector('.chart-tip');
  const band = svg.querySelector('.chart-band');
  let hideTimer = null;
  const show = e => {
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.min(groups.length - 1, Math.max(0, Math.floor((px - L) / groupW)));
    const g = groups[i];
    band.setAttribute('x', L + groupW * i);
    band.setAttribute('width', groupW);
    band.setAttribute('visibility', 'visible');
    const rows = [...bars, ...(line ? [line] : [])]
      .map(s => `<span class="chart-tip__row"><i style="--c:${s.color}"></i>${esc(s.label)}<b>${esc(fmt(g.values[s.key] || 0))}</b></span>`)
      .join('');
    tip.innerHTML = `<strong>${esc(g.title || g.label)}</strong>${rows}${extra ? extra(g) : ''}`;
    tip.hidden = false;
    const scale = rect.width / W;
    const left = Math.min(Math.max(cx(i) * scale - tip.offsetWidth / 2, 0), rect.width - tip.offsetWidth);
    tip.style.transform = `translate(${left}px, ${-tip.offsetHeight + 8}px)`;
  };
  const hide = () => {
    tip.hidden = true;
    band.setAttribute('visibility', 'hidden');
  };
  svg.addEventListener('pointermove', e => {
    clearTimeout(hideTimer);
    show(e);
  });
  svg.addEventListener('pointerdown', e => {
    clearTimeout(hideTimer);
    show(e);
  });
  svg.addEventListener('pointerleave', e => {
    hideTimer = setTimeout(hide, e.pointerType === 'mouse' ? 0 : 2500);
  });
}
