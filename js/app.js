/* NeoDrop — editor de notas Markdown
   HTML + CSS + JS vanilla. Zero dependências, zero build, tudo no localStorage. */

/* ================= storage ================= */
const K = {
  notes: 'neodrop.notes',
  notebooks: 'neodrop.notebooks',
  prefs: 'neodrop.prefs'
};

const load = (k, fallback) => {
  try {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
};
const save = (k, v) => {
  try { localStorage.setItem(k, JSON.stringify(v)); return true; }
  catch { toast('Falha ao salvar no localStorage', 'warn'); return false; }
};

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const pad = n => String(n).padStart(2, '0');

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const isoStamp = ts => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fmtDateTime = ts => new Date(ts).toLocaleString('pt-BR', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
});

function fmtAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'agora';
  if (s < 3600) return `${Math.floor(s / 60)}min`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  const d = new Date(ts);
  const now = new Date();
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return 'hoje';
  if (d.toDateString() === y.toDateString()) return 'ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

const slugKey = s => String(s || '').trim().toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const safeFolder = s => String(s || '').replace(/[\\/:*?"<>|.]+/g, '-').trim() || 'Sem nome';

const stripQuotes = s => String(s || '').replace(/^["']|["']$/g, '').replace(/\\"/g, '"');

function toTagArray(v) {
  if (Array.isArray(v)) return v.map(x => stripQuotes(String(x).trim())).filter(Boolean);
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s) return [];
    if (/^\[.*\]$/.test(s)) return s.slice(1, -1).split(',').map(x => stripQuotes(x.trim())).filter(Boolean);
    return s.split(/[\s,]+/).map(x => stripQuotes(x.trim())).filter(Boolean);
  }
  return [];
}

const fsBrowser = typeof indexedDB !== 'undefined' && 'showDirectoryPicker' in window;

/* ================= estado ================= */
const defaultPrefs = {
  theme: 'midnight',
  accent: '#3b82f6',
  accentCustom: false,
  density: 'normal',
  motion: 'on',
  font: 'system',
  editorSize: 14,
  mode: 'split',
  autosync: true
};

let notes = load(K.notes, []);
let notebooks = load(K.notebooks, []);
let prefs = Object.assign({}, defaultPrefs, load(K.prefs, {}));

notes = (Array.isArray(notes) ? notes : []).map(n => ({
  id: n.id || uid(),
  title: String(n.title ?? ''),
  content: String(n.content ?? ''),
  notebookId: n.notebookId || '',
  tags: toTagArray(n.tags),
  pinned: !!n.pinned,
  trashed: n.trashed || 0,
  diskPath: n.diskPath || '',
  createdAt: n.createdAt || Date.now(),
  updatedAt: n.updatedAt || Date.now()
}));

notebooks = (Array.isArray(notebooks) ? notebooks : [])
  .filter(nb => nb && (nb.id || nb.name))
  .map(nb => ({
    id: nb.id || uid(),
    name: String(nb.name || 'Pasta'),
    parentId: nb.parentId || '',
    createdAt: nb.createdAt || Date.now()
  }))
  .filter((nb, i, arr) => arr.findIndex(x => x.id === nb.id) === i);

let ui = {
  view: 'notes',
  q: '',
  sort: 'updated',
  notebook: 'all',
  tag: '',
  activeId: notes.find(n => !n.trashed)?.id || null,
  collapsed: new Set(),
  contentLoadedFor: null,
  notebookSearch: '',
  confirmAction: null
};

const disk = {
  supported: fsBrowser,
  handle: null,
  ready: false,
  needsPermission: false,
  name: '',
  lastSync: 0,
  written: 0,
  pending: new Set()
};

const persistNotes = () => save(K.notes, notes);
const persistNotebooks = () => save(K.notebooks, notebooks);
const persistPrefs = () => save(K.prefs, prefs);
const persistAll = () => { persistNotes(); persistNotebooks(); persistPrefs(); };

let noteTimer = null;
const queueNotes = () => {
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => { noteTimer = null; persistNotes(); }, 350);
};

let syncTimer = null;
const queueDiskWrite = id => {
  if (!disk.ready || !prefs.autosync) return;
  disk.pending.add(id);
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => { syncTimer = null; syncDisk(); }, 1500);
};

/* ================= dom ================= */
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const el = id => document.getElementById(id);
const qa = sel => Array.from(document.querySelectorAll(sel));
const setText = (id, txt) => { const e = el(id); if (e && e.textContent !== txt) e.textContent = txt; };
const setVal = (id, v) => {
  const e = el(id);
  const s = v == null ? '' : String(v);
  if (e && e.value !== s) e.value = s;
};

/* ================= toast ================= */
const TOAST_ICONS = {
  ok: '<path d="M4 12l5 5L20 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  info: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 8h.01M11 12h1v5h1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  warn: '<path d="M12 4l9 16H3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 10v4M12 17h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
};

function toast(msg, kind = 'info') {
  const box = el('toasts');
  if (!box) return;
  const node = document.createElement('div');
  node.className = `toast ${kind}`;
  node.innerHTML = `<svg viewBox="0 0 24 24">${TOAST_ICONS[kind] || TOAST_ICONS.info}</svg><span></span>`;
  node.querySelector('span').textContent = msg;
  box.appendChild(node);
  while (box.children.length > 4) box.firstElementChild.remove();
  setTimeout(() => {
    node.style.transition = 'opacity .2s,transform .2s';
    node.style.opacity = '0';
    node.style.transform = 'translateX(20px)';
    setTimeout(() => node.remove(), 220);
  }, 2600);
}

function setStatus(msg) { setText('status-left', msg); }

/* ================= modal ================= */
const openModal = id => {
  el(id).classList.add('is-open');
  el('backdrop').classList.add('is-open');
};
const closeModals = () => {
  $$('.modal').forEach(m => m.classList.remove('is-open'));
  el('backdrop').classList.remove('is-open');
};

function confirmAction(title, text, cb) {
  setText('confirm-title', title);
  setText('confirm-text', text);
  ui.confirmAction = cb;
  openModal('confirm-modal');
}

/* ================= temas ================= */
const THEMES = [
  { id: 'midnight', name: 'Midnight', desc: 'azul escuro' },
  { id: 'zabbix', name: 'Zabbix Red', desc: 'preto e vermelho' },
  { id: 'matrix', name: 'Matrix', desc: 'verde terminal' },
  { id: 'amber', name: 'Amber', desc: 'âmbar' },
  { id: 'violet', name: 'Violet', desc: 'roxo' },
  { id: 'paper', name: 'Paper', desc: 'claro' }
];
const THEME_ACCENT = {
  midnight: '#3b82f6', zabbix: '#e02b2b', matrix: '#22c55e',
  amber: '#f59e0b', violet: '#8b5cf6', paper: '#d40d0d'
};

function hexToRgb(hex) {
  const h = String(hex).replace('#', '');
  const n = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
}
const shade = (hex, amt) => {
  const [r, g, b] = hexToRgb(hex);
  const f = c => Math.max(0, Math.min(255, Math.round(c + amt)));
  return `#${[f(r), f(g), f(b)].map(c => c.toString(16).padStart(2, '0')).join('')}`;
};
const relLum = rgb => {
  const f = c => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
};
const contrastWith = (rgb, ref) => {
  const a = relLum(rgb), b = relLum(ref);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};
const toHex = rgb => '#' + rgb.map(c =>
  Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('');
function readableFill(hex) {
  let rgb = hexToRgb(hex);
  if (contrastWith(rgb, [255, 255, 255]) >= 4.5) return hex;
  for (let i = 0; i < 30 && rgb.some(c => c > 0); i++) rgb = rgb.map(c => c * 0.92);
  return toHex(rgb);
}

function applyPrefs() {
  const root = document.documentElement;
  root.dataset.theme = prefs.theme;
  root.dataset.density = prefs.density;
  root.dataset.motion = prefs.motion;
  root.dataset.font = prefs.font;
  root.style.setProperty('--accent', prefs.accent);
  root.style.setProperty('--accent-fill', readableFill(prefs.accent));
  root.style.setProperty('--accent-2', shade(prefs.accent, 45));
  root.style.setProperty('--editor-size', `${prefs.editorSize}px`);
  if (el('accent-picker-2')) el('accent-picker-2').value = prefs.accent;
  if (el('opt-compact')) el('opt-compact').checked = prefs.density === 'compact';
  if (el('opt-motion')) el('opt-motion').checked = prefs.motion === 'on';
  if (el('opt-font')) el('opt-font').value = prefs.font;
  if (el('opt-editor-size')) el('opt-editor-size').value = prefs.editorSize;
  setText('opt-editor-size-val', `${prefs.editorSize}px`);
  if (el('opt-autosync')) el('opt-autosync').checked = prefs.autosync;
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.setAttribute('content', prefs.theme === 'paper' ? '#f2f3f6' : '#080b14');
  setMode(prefs.mode, false);
  renderThemeGrid();
}

function setTheme(id) {
  if (!THEMES.some(t => t.id === id)) return;
  prefs.theme = id;
  if (!prefs.accentCustom) prefs.accent = THEME_ACCENT[id];
  applyPrefs();
  persistPrefs();
  renderAll();
  toast(`Tema "${THEMES.find(t => t.id === id).name}" aplicado`, 'ok');
}

function renderThemeGrid() {
  const accent = THEME_ACCENT;
  const bg = { midnight: '#080b14', zabbix: '#111114', matrix: '#070d0b', amber: '#18150e', violet: '#120e1c', paper: '#ffffff' };
  const box = el('theme-grid');
  if (!box) return;
  box.innerHTML = THEMES.map(t => `
    <button class="theme-card ${t.id === prefs.theme ? 'is-active' : ''}" data-theme-id="${t.id}">
      <div class="theme-prev" style="background:${bg[t.id]}">
        <div class="side" style="background:${bg[t.id]};box-shadow:inset 0 0 0 1px ${accent[t.id]}33"></div>
        <div class="main">
          <div class="bar" style="background:${accent[t.id]}"></div>
          <div class="bar" style="background:${accent[t.id]}55"></div>
          <div class="bar w60" style="background:${accent[t.id]}33"></div>
        </div>
      </div>
      <div class="meta">
        <strong>${t.name}</strong>
        <small>${t.desc}</small>
      </div>
    </button>`).join('');
}

/* ================= escape ================= */
const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const esc = escapeHtml;

/* ================= notas: consultas ================= */
const activeNote = () => notes.find(n => n.id === ui.activeId && !n.trashed) || null;
const noteByTitle = title => {
  const k = slugKey(title);
  return notes.find(n => !n.trashed && slugKey(n.title) === k) || null;
};

const tagCache = new Map();
function noteTags(n) {
  const own = toTagArray(n.tags).map(t => t.toLowerCase());
  const k = `${n.id}:${n.updatedAt}:${own.join(',')}`;
  let v = tagCache.get(k);
  if (v === undefined) {
    const set = new Set(own);
    const re = /(^|\s)#([\p{L}\p{N}][\p{L}\p{N}_-]{0,40})/gu;
    let m;
    while ((m = re.exec(n.content))) set.add(m[2].toLowerCase());
    v = Array.from(set).sort();
    if (tagCache.size > 500) tagCache.clear();
    tagCache.set(k, v);
  }
  return v;
}

function allTags() {
  const counts = new Map();
  notes.filter(n => !n.trashed).forEach(n => noteTags(n).forEach(t => {
    counts.set(t, (counts.get(t) || 0) + 1);
  }));
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

const kidsOf = id => notebooks.filter(nb => (nb.parentId || '') === (id || ''));
const nbName = id => (notebooks.find(nb => nb.id === id) || {}).name || '';

function nbChain(id) {
  const chain = [];
  let cur = notebooks.find(nb => nb.id === id);
  const guard = new Set();
  while (cur && !guard.has(cur.id)) {
    guard.add(cur.id);
    chain.unshift(cur);
    cur = notebooks.find(nb => nb.id === cur.parentId);
  }
  return chain;
}
const nbPath = id => nbChain(id).map(nb => nb.name).join(' / ');

function notesInSubtree(id) {
  const ids = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    notebooks.forEach(nb => {
      if (nb.parentId && ids.has(nb.parentId) && !ids.has(nb.id)) { ids.add(nb.id); grew = true; }
    });
  }
  return notes.filter(n => !n.trashed && ids.has(n.notebookId));
}

function isDescendant(candidateId, ancestorId) {
  return nbChain(candidateId).some(nb => nb.id === ancestorId);
}

function snippet(text, len = 110) {
  const flat = String(text || '')
    .replace(/^---[\s\S]*?---/, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a, b) => b || a)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^[>\s]*[-*+]\s+(?:\[[ xX]\]\s*)?/gm, '')
    .replace(/^[>\s]*#{1,6}\s+/gm, '')
    .replace(/^[>\s]*>\s?/gm, '')
    .replace(/[*_~=]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return flat.length > len ? `${flat.slice(0, len).trimEnd()}…` : flat;
}

function filteredNotes() {
  const q = ui.q.trim().toLowerCase();
  let list = notes.filter(n => !n.trashed);
  if (ui.notebook !== 'all') list = list.filter(n => (n.notebookId || '') === ui.notebook);
  if (ui.tag) list = list.filter(n => noteTags(n).includes(ui.tag));
  if (q) {
    list = list.filter(n =>
      `${n.title}\n${n.content}\n${noteTags(n).join(' ')}`.toLowerCase().includes(q));
  }
  const cmp = {
    updated: (a, b) => b.updatedAt - a.updatedAt,
    created: (a, b) => b.createdAt - a.createdAt,
    title: (a, b) => a.title.localeCompare(b.title, 'pt-BR')
  }[ui.sort] || ((a, b) => b.updatedAt - a.updatedAt);
  return list.sort((a, b) => (b.pinned - a.pinned) || cmp(a, b));
}

/* ================= markdown: inline ================= */
const safeUrl = u => /^(https?:\/\/|mailto:|#|\/|\.{1,2}\/)/i.test(String(u).trim()) ? String(u).trim() : '#';

const inlineStash = [];
const stashPut = html => { inlineStash.push(html); return `\u0000${inlineStash.length - 1}\u0000`; };

function mdInline(raw) {
  inlineStash.length = 0;
  let out = escapeHtml(raw);
  out = out.replace(/`+([^`]+?)`+/g, (_, code) => stashPut(`<code>${code}</code>`));
  out = out.replace(/!\[([^\]]*)\]\(\s*([^)\s]+)[^)]*\)/g, (_, alt, url) =>
    `<img src="${safeUrl(url)}" alt="${alt}" loading="lazy">`);
  out = out.replace(/\[([^\]]+)\]\(\s*([^)\s]+)[^)]*\)/g, (_, txt, url) =>
    `<a href="${safeUrl(url)}" target="_blank" rel="noopener noreferrer">${txt}</a>`);
  out = out.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, alias) => {
    const hit = noteByTitle(target);
    const label = alias || target;
    return hit
      ? `<button class="md-wiki" data-open-note="${escapeHtml(hit.title)}">${escapeHtml(label)}</button>`
      : `<span class="md-wiki is-missing" title="Nota não existe">${escapeHtml(`[[${target}]]`)}</span>`;
  });
  out = out.replace(/(\*\*\*|___)(.+?)\1/g, '<strong><em>$2</em></strong>');
  out = out.replace(/(\*\*|__)(.+?)\1/g, '<strong>$2</strong>');
  out = out.replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  out = out.replace(/(^|[^_\w])_([^_\n]+)_/g, '$1<em>$2</em>');
  out = out.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
  out = out.replace(/==([^=\n]+)==/g, '<mark>$1</mark>');
  out = out.replace(/(^|\s)#([\p{L}\p{N}][\p{L}\p{N}_-]{0,40})/gu, (_, sp, tag) =>
    `${sp}<button class="md-tag" data-tag="${escapeHtml(tag.toLowerCase())}">#${escapeHtml(tag)}</button>`);
  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => inlineStash[Number(i)]);
}

/* ================= markdown: blocos ================= */
const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])[ \t]+(.*)$/;
const ATX = /^\s{0,3}(#{1,6})[ \t]+(.*?)[ \t]*#*\s*$/;
const HR = /^\s{0,3}([-*_])[ \t]*(?:\1[ \t]*){2,}$/;
const FENCE = /^\s{0,3}(`{3,}|~{3,})[ \t]*([\w+#.-]*)/;

const startsBlock = l =>
  !l.trim() || FENCE.test(l) || ATX.test(l) || HR.test(l) ||
  /^\s{0,3}>/.test(l) || LIST_ITEM.test(l) || /^\s{0,3}\|/.test(l);

function stripFrontmatter(lines) {
  if (lines[0] !== undefined && /^---\s*$/.test(lines[0])) {
    let i = 1;
    while (i < lines.length && !/^(---|\.\.\.)\s*$/.test(lines[i])) i++;
    if (i < lines.length) return lines.slice(i + 1);
  }
  return lines;
}

function readListItem(lines, i) {
  const m = lines[i].match(LIST_ITEM);
  if (!m) return null;
  const indent = m[1].length;
  const body = [m[3]];
  let j = i + 1;
  while (j < lines.length) {
    const line = lines[j];
    if (!line.trim()) {
      let k = j;
      while (k < lines.length && !lines[k].trim()) k++;
      if (k < lines.length && lines[k].match(/^\s*/)[0].length > indent) {
        while (j < k) { body.push(''); j++; }
        continue;
      }
      break;
    }
    const ind = line.match(/^\s*/)[0].length;
    if (ind <= indent) break;
    body.push(line.slice(indent));
    j++;
  }
  return { indent, marker: m[2], body, next: j };
}

function renderList(lines, start, depth) {
  const first = lines[start].match(LIST_ITEM);
  const ordered = /\d/.test(first[2]);
  const startNum = ordered ? first[2].replace(/\D/g, '') : '';
  const items = [];
  let i = start;
  while (i < lines.length) {
    if (!lines[i].trim()) break;
    const m = lines[i].match(LIST_ITEM);
    if (!m || m[1].length !== first[1].length) break;
    const it = readListItem(lines, i);
    if (!it) break;
    const task = it.body[0].match(/^\[([ xX])\]\s+(.*)$/);
    if (task && !ordered) {
      const rest = it.body.slice(1).join('\n');
      const tail = rest.trim() ? mdToHtml(rest, depth + 1) : '';
      items.push(`<li class="md-task"><input type="checkbox" disabled${task[1] === ' ' ? '' : ' checked'}><span>${mdInline(task[2])}${tail}</span></li>`);
    } else {
      const loose = it.body.some(l => !l.trim());
      let inner = mdToHtml(it.body.join('\n'), depth + 1);
      if (!loose) inner = inner.replace(/<\/?p>/g, '');
      items.push(`<li>${inner}</li>`);
    }
    i = it.next;
  }
  const tag = ordered ? 'ol' : 'ul';
  const attr = ordered && startNum && startNum !== '1' ? ` start="${Number(startNum)}"` : '';
  return { html: `<${tag}${attr}>${items.join('')}</${tag}>`, next: i };
}

function renderTable(lines, start) {
  const cells = l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
  const head = cells(lines[start]);
  if (start + 1 >= lines.length) return null;
  const sep = lines[start + 1];
  if (!/^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(sep) || !sep.includes('-')) return null;
  const aligns = cells(sep).map(c => {
    const l = c.startsWith(':');
    const r = c.endsWith(':');
    return l && r ? 'center' : r ? 'right' : l ? 'left' : '';
  });
  let i = start + 2;
  const rows = [];
  while (i < lines.length && lines[i].trim() && /\|/.test(lines[i]) && !ATX.test(lines[i]) && !LIST_ITEM.test(lines[i])) {
    rows.push(cells(lines[i]));
    i++;
  }
  const th = head.map((c, k) => `<th${aligns[k] ? ` style="text-align:${aligns[k]}"` : ''}>${mdInline(c)}</th>`).join('');
  const body = rows.map(r =>
    `<tr>${head.map((_, k) => `<td${aligns[k] ? ` style="text-align:${aligns[k]}"` : ''}>${mdInline(r[k] || '')}</td>`).join('')}</tr>`).join('');
  return {
    html: `<div class="md-table-wrap"><table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table></div>`,
    next: i
  };
}

function mdToHtml(md, depth = 0) {
  if (depth > 8) return `<p>${escapeHtml(String(md ?? ''))}</p>`;
  const lines = stripFrontmatter(
    String(md ?? '').replace(/\r\n?/g, '\n').replace(/\u0000/g, '').replace(/\t/g, '    ').split('\n'));
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i++; continue; }

    const fence = line.match(FENCE);
    if (fence) {
      const marker = fence[1];
      const lang = fence[2] || '';
      const close = new RegExp(`^\\s{0,3}\\${marker[0]}{${marker.length},}\\s*$`);
      const buf = [];
      let j = i + 1;
      while (j < lines.length && !close.test(lines[j])) { buf.push(lines[j]); j++; }
      j = Math.min(j + 1, lines.length);
      out.push(`<pre data-lang="${escapeHtml(lang)}"><code>${escapeHtml(buf.join('\n'))}</code></pre>`);
      i = j;
      continue;
    }

    if (HR.test(line)) { out.push('<hr>'); i++; continue; }

    const atx = line.match(ATX);
    if (atx) {
      const lvl = atx[1].length;
      out.push(`<h${lvl} id="h-${slugKey(atx[2]) || lvl}">${mdInline(atx[2])}</h${lvl}>`);
      i++;
      continue;
    }

    if (i + 1 < lines.length && line.trim() && /^\s{0,3}(=+|-+)\s*$/.test(lines[i + 1])) {
      const lvl = lines[i + 1].trim()[0] === '=' ? 1 : 2;
      out.push(`<h${lvl} id="h-${slugKey(line) || lvl}">${mdInline(line.trim())}</h${lvl}>`);
      i += 2;
      continue;
    }

    if (/^\s{0,3}>/.test(line)) {
      const buf = [];
      while (i < lines.length && (/^\s{0,3}>/.test(lines[i]) || (lines[i].trim() && buf.length))) {
        buf.push(lines[i].replace(/^\s{0,3}> ?/, ''));
        i++;
      }
      out.push(`<blockquote>${mdToHtml(buf.join('\n'), depth + 1)}</blockquote>`);
      continue;
    }

    if (LIST_ITEM.test(line)) {
      const list = renderList(lines, i, depth);
      out.push(list.html);
      i = Math.max(list.next, i + 1);
      continue;
    }

    if (/^\s{0,3}\|/.test(line)) {
      const tbl = renderTable(lines, i);
      if (tbl) {
        out.push(tbl.html);
        i = Math.max(tbl.next, i + 1);
        continue;
      }
    }

    const para = [];
    while (i < lines.length && lines[i].trim() && !startsBlock(lines[i]) &&
           !(i + 1 < lines.length && /^\s{0,3}(=+|-+)\s*$/.test(lines[i + 1]))) {
      para.push(lines[i].trim());
      i++;
    }
    if (para.length) out.push(`<p>${mdInline(para.join('\n'))}</p>`);
  }

  return out.join('');
}

/* ================= realce de sintaxe ================= */
const HL_IN = new RegExp([
  '(`+)[\\s\\S]*?\\1',
  '(\\*\\*\\*|___)([\\s\\S]+?)\\2',
  '\\*\\*([^\\n]+?)\\*\\*',
  '__([^\\n]+?)__',
  '\\*([^*\\n]+)\\*',
  '_([^_\\n]+)_',
  '~~([^~\\n]+)~~',
  '==([^=\\n]+)==',
  '\\[\\[([^\\]\\n]+)\\]\\]',
  '(!?)\\[([^\\]\\n]*)\\]\\(([^)\\s]*)(?:\\s+"[^"]*")?\\)',
  '(^|\\s)(#[\\p{L}\\p{N}][\\p{L}\\p{N}_-]{0,40})'
].join('|'), 'gu');

function hlInline(text) {
  HL_IN.lastIndex = 0;
  let out = '';
  let last = 0;
  let m;
  while ((m = HL_IN.exec(text)) !== null) {
    out += esc(text.slice(last, m.index));
    if (m[0].length === 0) { HL_IN.lastIndex++; continue; }
    if (m[1] !== undefined) out += `<span class="tk-code">${esc(m[0])}</span>`;
    else if (m[3] !== undefined) out += `<span class="tk-strong"><em>${esc(m[3])}</em></span>`;
    else if (m[4] !== undefined) out += `<span class="tk-strong">${esc(m[4])}</span>`;
    else if (m[5] !== undefined) out += `<span class="tk-strong">${esc(m[5])}</span>`;
    else if (m[6] !== undefined) out += `<span class="tk-em">${esc(m[6])}</span>`;
    else if (m[7] !== undefined) out += `<span class="tk-em">${esc(m[7])}</span>`;
    else if (m[8] !== undefined) out += `<span class="tk-del">${esc(m[8])}</span>`;
    else if (m[9] !== undefined) out += `<span class="tk-mark">${esc(m[9])}</span>`;
    else if (m[10] !== undefined) out += `<span class="tk-wiki">[[${esc(m[10])}]]</span>`;
    else if (m[13] !== undefined) out += `${m[11] ? '!' : ''}<span class="tk-link">[${esc(m[12])}]</span><span class="tk-url">(${esc(m[13])})</span>`;
    else if (m[15] !== undefined) out += `${esc(m[14])}<span class="tk-tag">${esc(m[15])}</span>`;
    last = m.index + m[0].length;
  }
  return out + esc(text.slice(last));
}

function highlightMd(md) {
  const lines = String(md ?? '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
  const out = [];
  let fence = null;

  for (const line of lines) {
    if (fence) {
      out.push(`<span class="tk-code">${esc(line)}</span>`);
      if (new RegExp(`^\\s{0,3}\\${fence[0]}{${fence.length},}\\s*$`).test(line)) fence = null;
      continue;
    }
    const open = line.match(FENCE);
    if (open) {
      fence = open[1];
      out.push(`<span class="tk-code tk-fence">${esc(line)}</span>`);
      continue;
    }

    const atx = line.match(ATX);
    if (atx) {
      out.push(`<span class="tk-punct">${esc(atx[1])}</span><span class="tk-head">${hlInline(atx[2])}</span>`);
      continue;
    }
    if (HR.test(line)) { out.push(`<span class="tk-punct">${esc(line)}</span>`); continue; }

    const quote = line.match(/^(\s{0,3}>[ \t]?)(.*)$/);
    if (quote) {
      out.push(`<span class="tk-punct">${esc(quote[1])}</span><span class="tk-quote">${hlInline(quote[2])}</span>`);
      continue;
    }

    const li = line.match(/^(\s*)((?:[-*+]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?)(.*)$/);
    if (li) {
      out.push(`${esc(li[1])}<span class="tk-punct">${esc(li[2])}</span>${hlInline(li[3])}`);
      continue;
    }

    if (/^\s{0,3}\|/.test(line)) {
      const cells = line.split('|');
      out.push(cells.map((c, k) =>
        (k === 0 || k === cells.length - 1
          ? `<span class="tk-punct">${esc(c)}</span>`
          : hlInline(c))).join(''));
      continue;
    }

    out.push(hlInline(line));
  }

  return out.join('\n');
}

/* ================= pastas ================= */
const CHEVRON = '<svg viewBox="0 0 24 24" class="chev"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const FOLDER_SVG = '<svg viewBox="0 0 24 24"><path d="M3 7h6l2 2h10v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/></svg>';

function renderTree() {
  const box = el('notebook-tree');
  if (!box) return;

  const rows = [];
  const walk = (parentId, depth) => {
    kidsOf(parentId).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).forEach(nb => {
      const hasKids = kidsOf(nb.id).length > 0;
      const open = !ui.collapsed.has(nb.id);
      rows.push(`
        <div class="tree-row ${ui.notebook === nb.id ? 'is-active' : ''}" style="--depth:${depth}">
          <button class="tree-toggle ${hasKids ? '' : 'is-leaf'}" data-toggle-nb="${nb.id}" aria-label="Abrir ou fechar ${escapeHtml(nb.name)}">
            ${hasKids ? CHEVRON.replace('class="chev"', `class="chev ${open ? 'is-open' : ''}"`) : ''}
          </button>
          <button class="tree-label" data-notebook="${nb.id}" title="${escapeHtml(nbPath(nb.id))}">
            ${FOLDER_SVG}<span>${escapeHtml(nb.name)}</span>
            <em class="n">${notesInSubtree(nb.id).length}</em>
          </button>
          <span class="tree-actions">
            <button data-add-child="${nb.id}" title="Nova subpasta"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></button>
            <button data-edit-nb="${nb.id}" title="Renomear ou mover"><svg viewBox="0 0 24 24"><path d="M4 20h4L20 8l-4-4L4 16z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg></button>
            <button data-del-nb="${nb.id}" title="Excluir pasta"><svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
          </span>
        </div>`);
      if (open) walk(nb.id, depth + 1);
    });
  };
  walk('', 0);

  const total = notes.filter(n => !n.trashed).length;
  box.innerHTML = `
    <button class="tree-label is-root ${ui.notebook === 'all' ? 'is-active' : ''}" data-notebook="all">
      <svg viewBox="0 0 24 24"><path d="M4 6h16v3H4zM4 11h16v3H4zM4 16h10v3H4z"/></svg>
      <span>Todas as notas</span><em class="n">${total}</em>
    </button>
    <button class="tree-label is-root ${ui.notebook === '' ? 'is-active' : ''}" data-notebook="">
      <svg viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M14 3v4h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>
      <span>Sem pasta</span><em class="n">${notes.filter(n => !n.trashed && !n.notebookId).length}</em>
    </button>
    ${rows.join('')}
    ${notebooks.length ? '' : '<p class="tree-empty">Nenhuma pasta ainda — use o + acima para criar.</p>'}`;
}

function renderNotebookSelect() {
  const sel = el('note-notebook');
  if (!sel) return;
  const opts = ['<option value="">Sem pasta</option>'];
  const walk = (parentId, depth) => {
    kidsOf(parentId).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).forEach(nb => {
      opts.push(`<option value="${nb.id}">${'— '.repeat(depth)}${escapeHtml(nb.name)}</option>`);
      walk(nb.id, depth + 1);
    });
  };
  walk('', 0);
  sel.innerHTML = opts.join('');
  const n = activeNote();
  sel.value = n ? (n.notebookId || '') : '';
}

function renderNotebookManager() {
  const box = el('notebook-manager');
  if (!box) return;
  const q = ui.notebookSearch.trim().toLowerCase();
  const rows = notebooks.filter(nb => !q || nb.name.toLowerCase().includes(q));

  box.innerHTML = rows.map(nb => {
    const parents = ['<option value="">— na raiz —</option>'].concat(
      notebooks
        .filter(o => o.id !== nb.id && !isDescendant(o.id, nb.id))
        .map(o => `<option value="${o.id}"${o.id === nb.parentId ? ' selected' : ''}>${escapeHtml(nbPath(o.id))}</option>`));
    const own = notes.filter(n => !n.trashed && n.notebookId === nb.id).length;
    return `
      <li class="nb-row" data-nb="${nb.id}">
        ${FOLDER_SVG}
        <input type="text" class="nb-name" value="${escapeHtml(nb.name)}" maxlength="60" aria-label="Nome da pasta">
        <span class="nb-count">${own}</span>
        <select class="nb-parent" aria-label="Pasta acima">${parents.join('')}</select>
        <button class="nb-del" data-del-nb="${nb.id}" title="Excluir pasta">
          <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </li>`;
  }).join('') || '<li class="empty">Nenhuma pasta encontrada.</li>';

  setText('notebook-count', String(notebooks.length));
}

function addNotebook(name, parentId = '') {
  const clean = String(name || '').trim().slice(0, 60);
  if (!clean) { toast('Dê um nome para a pasta', 'warn'); return null; }
  const nb = { id: uid(), name: clean, parentId, createdAt: Date.now() };
  notebooks.push(nb);
  persistNotebooks();
  renderTree();
  renderNotebookSelect();
  renderNotebookManager();
  renderNoteList();
  return nb;
}

function deleteNotebook(nb) {
  const doomed = new Set([nb.id]);
  let grew = true;
  while (grew) {
    grew = false;
    notebooks.forEach(x => {
      if (x.parentId && doomed.has(x.parentId) && !doomed.has(x.id)) { doomed.add(x.id); grew = true; }
    });
  }
  const total = notes.filter(n => !n.trashed && doomed.has(n.notebookId)).length;
  confirmAction('Excluir pasta',
    `"${nb.name}" será removida e ${total} nota${total === 1 ? '' : 's'} sobem para a pasta acima. Continuar?`, () => {
      notes.forEach(n => { if (doomed.has(n.notebookId)) n.notebookId = nb.parentId || ''; });
      notebooks = notebooks.filter(x => !doomed.has(x.id));
      if (ui.notebook && doomed.has(ui.notebook)) ui.notebook = 'all';
      persistAll();
      renderAll();
      renderNotebookManager();
      toast(`Pasta "${nb.name}" excluída`, 'warn');
    });
}

/* ================= lista de notas ================= */
function renderNoteList() {
  const box = el('note-list');
  if (!box) return;
  const list = filteredNotes();

  if (!list.length) {
    box.innerHTML = `<li class="empty">${ui.q || ui.tag || ui.notebook !== 'all'
      ? 'Nada encontrado com esses filtros.'
      : 'Nenhuma nota ainda — use <b>Nova nota</b> para começar.'}</li>`;
  } else {
    box.innerHTML = list.map(n => {
      const tags = noteTags(n).slice(0, 3);
      const where = n.notebookId ? nbPath(n.notebookId) : 'Sem pasta';
      return `
      <li class="note-row ${n.id === ui.activeId ? 'is-active' : ''}" data-note="${n.id}">
        <div class="note-row-top">
          <strong>${n.pinned ? '<span class="pin" title="Fixada">📌</span>' : ''}${escapeHtml(n.title || 'Sem título')}</strong>
          <time>${fmtAgo(n.updatedAt)}</time>
        </div>
        <p class="note-snip">${escapeHtml(snippet(n.content) || 'Nota vazia')}</p>
        <div class="note-row-foot">
          <span class="nb-path">${escapeHtml(where)}</span>
          ${tags.map(t => `<em class="tag-chip">#${escapeHtml(t)}</em>`).join('')}
        </div>
      </li>`;
    }).join('');
  }

  const filtered = ui.notebook !== 'all' || ui.tag || ui.q;
  setText('list-count', `${list.length} nota${list.length === 1 ? '' : 's'}${filtered ? ' filtradas' : ''}`);
  setText('list-title', ui.notebook === 'all' ? 'Notas'
    : ui.notebook === '' ? 'Sem pasta' : (nbName(ui.notebook) || 'Notas'));

  const chips = [];
  if (ui.q) chips.push(`<span class="fchip">busca: ${escapeHtml(ui.q)}<button data-clear-filter="q" aria-label="Limpar busca">×</button></span>`);
  if (ui.notebook !== 'all') {
    chips.push(`<span class="fchip">pasta: ${escapeHtml(ui.notebook ? nbPath(ui.notebook) : 'sem pasta')}<button data-clear-filter="notebook" aria-label="Limpar pasta">×</button></span>`);
  }
  if (ui.tag) chips.push(`<span class="fchip">#${escapeHtml(ui.tag)}<button data-clear-filter="tag" aria-label="Limpar tag">×</button></span>`);
  const fbox = el('filter-note');
  if (fbox) fbox.innerHTML = chips.join('');

  setText('nav-count-notes', String(notes.filter(n => !n.trashed).length));
  setText('nav-count-trash', String(notes.filter(n => n.trashed).length));
}

function renderTagList() {
  const box = el('tag-list');
  if (!box) return;
  const tags = allTags();
  if (!tags.length) {
    box.innerHTML = '<p class="tree-empty">Escreva #assim no corpo de uma nota para criar uma tag.</p>';
    return;
  }
  box.innerHTML = tags.slice(0, 40).map(([tag, n]) => `
    <button class="tag-row ${ui.tag === tag ? 'is-active' : ''}" data-tag="${escapeHtml(tag)}">
      <span class="hash">#</span>${escapeHtml(tag)}<em class="n">${n}</em>
    </button>`).join('');
}

/* ================= editor ================= */
function renderEditor() {
  const n = activeNote();
  const has = !!n;
  ['note-title', 'note-content', 'note-notebook'].forEach(id => {
    const e = el(id);
    if (e) { e.disabled = !has; e.style.opacity = has ? '' : '.5'; }
  });
  const bar = el('editor-toolbar');
  if (bar) bar.style.opacity = has ? '' : '.5';
  if (el('btn-pin')) el('btn-pin').classList.toggle('is-active', has && n.pinned);

  if (!has) {
    ui.contentLoadedFor = null;
    setVal('note-title', '');
    setVal('note-content', '');
    setVal('note-notebook', '');
    setText('note-meta', '0 palavras • 0 caracteres');
    setText('note-tags-row', '');
    setText('note-saved', 'nenhuma nota aberta');
    if (el('backlinks')) el('backlinks').innerHTML = '';
    paintHighlight();
    renderPreview();
    return;
  }

  if (ui.contentLoadedFor !== n.id) {
    setVal('note-content', n.content || '');
    ui.contentLoadedFor = n.id;
  }
  setVal('note-title', n.title || '');
  if (el('note-notebook')) el('note-notebook').value = n.notebookId || '';
  renderNoteTagsRow(n);
  updateNoteMeta();
  paintHighlight();
  renderPreview();
  renderBacklinks();
}

function renderNoteTagsRow(n) {
  const box = el('note-tags-row');
  if (!box) return;
  const tags = noteTags(n);
  box.innerHTML = tags.map(t =>
    `<button class="tag-chip is-live" data-tag="${escapeHtml(t)}">#${escapeHtml(t)}</button>`).join('') +
    (tags.length ? '' : '<span class="tags-hint">nenhuma tag — escreva #tag no texto</span>');
}

function updateNoteMeta() {
  const ta = el('note-content');
  if (!ta) return;
  const v = ta.value;
  const words = v.trim() ? v.trim().split(/\s+/).length : 0;
  const n = activeNote();
  setText('note-meta', `${words} palavra${words !== 1 ? 's' : ''} • ${v.length} caracteres${n ? ` • ${fmtAgo(n.updatedAt)}` : ''}`);
}

function paintHighlight() {
  const ta = el('note-content');
  const hl = el('editor-hl');
  if (!ta || !hl) return;
  const code = hl.querySelector('code');
  const md = ta.value;
  code.innerHTML = highlightMd(md) + (md === '' || md.endsWith('\n') ? ' ' : '');
  syncHighlightScroll();
}

function syncHighlightScroll() {
  const ta = el('note-content');
  const hl = el('editor-hl');
  if (!ta || !hl) return;
  hl.scrollTop = ta.scrollTop;
  hl.scrollLeft = ta.scrollLeft;
}

function renderPreview() {
  const ta = el('note-content');
  const box = el('note-preview');
  if (!ta || !box) return;
  const html = mdToHtml(ta.value);
  box.innerHTML = html ||
    '<p class="md-empty">Nada para visualizar ainda — comece a escrever em Markdown.</p>';
}

function backlinksFor(note) {
  const key = slugKey(note.title);
  if (!key) return [];
  const hits = [];
  notes.forEach(other => {
    if (other.trashed || other.id === note.id) return;
    for (const line of other.content.split('\n')) {
      const m = line.match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
      if (m && slugKey(m[1]) === key) {
        hits.push({ note: other, where: line.trim().replace(/\[\[[^\]]+\]\]/g, m[2] || m[1]) });
        break;
      }
    }
  });
  return hits;
}

function renderBacklinks() {
  const box = el('backlinks');
  const n = activeNote();
  if (!box) return;
  if (!n) { box.innerHTML = ''; return; }

  const hits = backlinksFor(n);
  const tags = noteTags(n);
  const related = notes
    .filter(o => !o.trashed && o.id !== n.id && noteTags(o).some(t => tags.includes(t)))
    .slice(0, 4);

  const section = (title, count, items, renderItem) => `
    <header class="bl-head"><h3>${title}</h3><span class="chip">${count}</span></header>
    <ul class="bl-list">${items.map(renderItem).join('')}</ul>`;

  box.innerHTML = `
    ${hits.length ? section('Links de volta', hits.length, hits, h => `
      <li><button data-open-note="${escapeHtml(h.note.title)}">
        <strong>${escapeHtml(h.note.title || 'Sem título')}</strong>
        <span>${escapeHtml(h.where)}</span>
      </button></li>`) : ''}
    ${related.length ? section('Mesmas tags', related.length, related, o => `
      <li><button data-open-note="${escapeHtml(o.title)}">
        <strong>${escapeHtml(o.title || 'Sem título')}</strong>
        <span>${escapeHtml(noteTags(o).map(t => `#${t}`).join(' '))}</span>
      </button></li>`) : ''}
    ${!hits.length && !related.length
      ? '<p class="bl-empty">Nenhuma nota aponta para esta. Use <code>[[Nome da nota]]</code> para criar um link de volta.</p>'
      : ''}`;
}

function setMode(mode, persist = true) {
  prefs.mode = ['edit', 'split', 'preview'].includes(mode) ? mode : 'split';
  if (el('editor-body')) el('editor-body').dataset.mode = prefs.mode;
  qa('.mode-btn').forEach(b => b.classList.toggle('is-active', b.dataset.mode === prefs.mode));
  const wrap = el('editor-input');
  if (wrap) wrap.style.display = prefs.mode === 'preview' ? 'none' : '';
  if (persist) persistPrefs();
  syncHighlightScroll();
}

function setSavedState() {
  const n = activeNote();
  if (!n) { setText('note-saved', 'nenhuma nota aberta'); return; }
  if (disk.pending.has(n.id)) setText('note-saved', 'alteração ainda não gravada no disco');
  else if (disk.ready) setText('note-saved', `gravado no disco ${fmtAgo(disk.lastSync)}`);
  else setText('note-saved', 'salvo no navegador');
}

function updateNote(patch) {
  const n = activeNote();
  if (!n) return;
  Object.assign(n, patch, { updatedAt: Date.now() });
  queueNotes();

  if (patch.content !== undefined) {
    updateNoteMeta();
    paintHighlight();
    renderPreview();
    renderNoteTagsRow(n);
    renderBacklinks();
  }
  if (patch.title !== undefined) {
    if (el('backlinks')) renderBacklinks();
    setSavedState();
  }
  if (patch.pinned !== undefined) {
    renderNoteList();
    if (el('btn-pin')) el('btn-pin').classList.toggle('is-active', !!n.pinned);
  }
  if (patch.notebookId !== undefined) {
    renderTree();
    renderNoteList();
  }
  queueDiskWrite(n.id);
  setSavedState();
  renderNoteList();
  renderTagList();
}

function openNote(id) {
  const n = notes.find(x => x.id === id && !x.trashed);
  if (!n) {
    const gone = notes.find(x => x.id === id);
    if (gone) toast(`"${gone.title || 'Sem título'}" está na lixeira`, 'warn');
    return;
  }
  ui.activeId = n.id;
  renderNoteList();
  renderEditor();
  setStatus(`Nota aberta: ${n.title || 'sem título'}`);
}

function createNote(folderId) {
  const n = {
    id: uid(),
    title: '',
    content: '',
    notebookId: folderId !== undefined ? folderId : (ui.notebook === 'all' ? '' : ui.notebook),
    pinned: false,
    trashed: 0,
    diskPath: '',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  notes.unshift(n);
  ui.activeId = n.id;
  ui.contentLoadedFor = null;
  persistNotes();
  if (ui.view !== 'notes') setView('notes');
  renderAll();
  el('note-title').focus();
  setStatus('Nota criada');
  toast('Nota criada — escreva em Markdown', 'ok');
}

/* ================= lixeira ================= */
function trashNote(n) {
  confirmAction('Mover para a lixeira',
    `"${n.title || 'Sem título'}" vai para a lixeira. O arquivo .md continua na pasta.`, () => {
      n.trashed = Date.now();
      if (ui.activeId === n.id) ui.activeId = notes.find(x => !x.trashed)?.id || null;
      persistNotes();
      renderAll();
      toast('Nota movida para a lixeira', 'warn');
    });
}

function restoreNote(n) {
  n.trashed = 0;
  n.updatedAt = Date.now();
  persistNotes();
  renderAll();
  toast('Nota restaurada', 'ok');
}

function purgeNote(n) {
  confirmAction('Excluir de vez',
    `"${n.title || 'Sem título'}" será apagada do navegador e o arquivo .md removido da pasta.`, () => {
      removeFileFromDisk(n);
      notes = notes.filter(x => x.id !== n.id);
      if (ui.activeId === n.id) ui.activeId = notes.find(x => !x.trashed)?.id || null;
      persistNotes();
      renderAll();
      toast('Nota excluída', 'warn');
    });
}

function renderTrash() {
  const box = el('trash-list');
  if (!box) return;
  const list = notes.filter(n => n.trashed).sort((a, b) => b.trashed - a.trashed);
  if (!list.length) {
    box.innerHTML = '<li class="empty">A lixeira está vazia.</li>';
    return;
  }
  box.innerHTML = list.map(n => `
    <li class="note-row wide" data-note="${n.id}">
      <div class="note-row-top">
        <strong>${escapeHtml(n.title || 'Sem título')}</strong>
        <time>excluída ${fmtAgo(n.trashed)}</time>
      </div>
      <p class="note-snip">${escapeHtml(snippet(n.content, 160) || 'Nota vazia')}</p>
      <div class="note-row-foot">
        <span class="nb-path">${escapeHtml(n.notebookId ? nbPath(n.notebookId) : 'Sem pasta')}</span>
        <span class="trash-actions">
          <button class="btn btn-ghost btn-sm" data-restore="${n.id}">Restaurar</button>
          <button class="btn btn-danger btn-sm" data-purge="${n.id}">Excluir de vez</button>
        </span>
      </div>
    </li>`).join('');
}

function emptyTrash() {
  const list = notes.filter(n => n.trashed);
  if (!list.length) { toast('A lixeira já está vazia', 'info'); return; }
  confirmAction('Esvaziar lixeira',
    `${list.length} nota${list.length === 1 ? '' : 's'} será apagada do navegador e os arquivos .md removidos da pasta.`, () => {
      list.forEach(removeFileFromDisk);
      notes = notes.filter(n => !n.trashed);
      if (ui.activeId && !notes.some(n => n.id === ui.activeId)) ui.activeId = notes.find(n => !n.trashed)?.id || null;
      persistNotes();
      renderAll();
      toast('Lixeira esvaziada', 'warn');
    });
}

/* ================= nota -> .md ================= */
function noteToMd(n, frontmatter = true) {
  const title = n.title || 'Sem título';
  if (!frontmatter) return `# ${title}\n\n${n.content.trim()}\n`;
  const head = [
    '---',
    `id: ${n.id}`,
    `title: "${title.replace(/"/g, '\\"')}"`,
    `tags: [${noteTags(n).join(', ')}]`,
    `notebook: "${n.notebookId ? nbPath(n.notebookId).replace(/"/g, '\\"') : ''}"`,
    `pinned: ${!!n.pinned}`,
    `created: ${isoStamp(n.createdAt)}`,
    `updated: ${isoStamp(n.updatedAt)}`,
    '---',
    ''
  ];
  return `${head.join('\n')}\n${n.content.trim()}\n`;
}

function parseFrontmatter(text) {
  const src = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (!/^---\n/.test(src)) return { data: {}, body: src.replace(/^\n+/, '') };
  const end = src.indexOf('\n---', 3);
  if (end === -1) return { data: {}, body: src.replace(/^\n+/, '') };
  const head = src.slice(4, end).split('\n');
  const after = src.slice(end).replace(/^\n---[^\n]*\n?/, '').replace(/^\n+/, '');
  const data = {};
  let key = null;
  head.forEach(raw => {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim() || line.trim().startsWith('#')) return;
    const item = line.match(/^\s*-\s+(.*)$/);
    if (item && key) {
      if (!Array.isArray(data[key])) data[key] = [];
      data[key].push(stripQuotes(item[1].trim()));
      return;
    }
    const kv = line.match(/^([\w-]+):\s*(.*)$/);
    if (!kv) return;
    key = kv[1];
    const val = kv[2].trim();
    if (!val) { data[key] = []; return; }
    if (/^\[.*\]$/.test(val)) {
      data[key] = val.slice(1, -1).split(',').map(s => stripQuotes(s.trim())).filter(Boolean);
    } else if (/^(true|false)$/i.test(val)) data[key] = val.toLowerCase() === 'true';
    else data[key] = stripQuotes(val);
  });
  return { data, body: after };
}

/* ================= disco: File System Access ================= */
const idb = (() => {
  const DB = 'neodrop';
  const STORE = 'kv';
  let dbp = null;
  const open = () => {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const rq = indexedDB.open(DB, 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore(STORE);
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    });
    dbp.catch(() => { dbp = null; });
    return dbp;
  };
  const run = async (mode, fn) => {
    try {
      const db = await open();
      return await new Promise((res, rej) => {
        const t = db.transaction(STORE, mode);
        const rq = fn(t.objectStore(STORE));
        t.oncomplete = () => res(rq && 'result' in rq ? rq.result : undefined);
        t.onerror = () => rej(t.error);
        t.onabort = () => rej(t.error);
      });
    } catch { return undefined; }
  };
  return {
    get: k => run('readonly', s => s.get(k)),
    set: (k, v) => run('readwrite', s => { s.put(v, k); return { result: true }; }),
    del: k => run('readwrite', s => { s.delete(k); return { result: true }; })
  };
})();

function updateDiskUI() {
  setText('disk-name', disk.ready ? disk.name : (disk.needsPermission ? `${disk.name} — reconectar` : 'Sem pasta'));
  setText('disk-sub', disk.ready
    ? `${disk.written} nota${disk.written === 1 ? '' : 's'} gravada${disk.written === 1 ? '' : 's'}` +
      (disk.pending.size ? ` • ${disk.pending.size} pendente${disk.pending.size === 1 ? '' : 's'}` : '')
    : disk.needsPermission ? 'o navegador pediu permissão de novo'
      : 'arquivos .md no disco');

  const btn = el('disk-sync');
  if (btn) {
    btn.disabled = !disk.ready && !disk.needsPermission;
    btn.textContent = disk.needsPermission ? 'Reconectar' : 'Sincronizar';
  }
  setText('fs-support', disk.supported
    ? 'Cada pasta do NeoDrop vira uma subpasta real. Ao gravar, o arquivo recebe um cabeçalho com id, título, tags e data — nada é sobrescrito sem querer.'
    : 'Este navegador não expõe a File System Access API, então gravar em pastas fica indisponível. Use Chrome, Edge ou Opera; o resto do app continua funcionando com as notas só no navegador.');
  setSavedState();
}

const folderSegments = notebookId => nbChain(notebookId).map(nb => safeFolder(nb.name));

async function dirForSegments(segs, create = true) {
  let dir = disk.handle;
  for (const s of segs) dir = await dir.getDirectoryHandle(s, { create });
  return dir;
}

function fileNameFor(note) {
  const base = slugKey(note.title) || 'nota';
  const taken = new Set(
    notes.filter(n => n.id !== note.id && n.diskPath).map(n => n.diskPath.split('/').pop()));
  let name = `${base}.md`;
  let k = 2;
  while (taken.has(name)) { name = `${base}-${k}.md`; k++; }
  return name;
}

async function writeNoteToDisk(note) {
  if (!disk.ready || !disk.handle) return false;
  const dir = await dirForSegments(folderSegments(note.notebookId));
  const fileName = fileNameFor(note);
  const path = [...folderSegments(note.notebookId), fileName].join('/');
  const fh = await dir.getFileHandle(fileName, { create: true });
  const w = await fh.createWritable();
  await w.write(noteToMd(note));
  await w.close();
  if (note.diskPath && note.diskPath !== path) await removePath(note.diskPath);
  note.diskPath = path;
  return true;
}

async function removePath(path) {
  if (!disk.ready || !disk.handle || !path) return;
  const parts = path.split('/').filter(Boolean);
  const fileName = parts.pop();
  if (!fileName) return;
  try {
    const dir = await dirForSegments(parts, false);
    await dir.removeEntry(fileName);
  } catch { /* já não existe na pasta */ }
}

async function removeFileFromDisk(note) {
  if (!note.diskPath) return;
  if (disk.ready) await removePath(note.diskPath);
  note.diskPath = '';
}

async function syncDisk(silent = false) {
  if (!disk.ready || !disk.handle) {
    if (!silent) toast('Escolha uma pasta primeiro', 'warn');
    return;
  }
  const ids = Array.from(disk.pending);
  const batch = ids.length
    ? ids
    : notes.filter(n => !n.trashed).map(n => n.id);
  if (!batch.length) {
    if (!silent) toast('Nada para gravar', 'info');
    return;
  }

  let ok = 0;
  const failed = [];
  for (const id of batch) {
    const n = notes.find(x => x.id === id);
    if (!n || n.trashed) continue;
    try {
      await writeNoteToDisk(n);
      disk.pending.delete(id);
      disk.written++;
      ok++;
    } catch {
      failed.push(n.title || 'sem título');
    }
  }
  disk.lastSync = Date.now();
  persistNotes();
  updateDiskUI();
  if (failed.length) {
    if (!silent) toast(`${ok} gravadas, ${failed.length} falharam (ex.: ${failed[0]})`, 'warn');
    setStatus('Falha ao gravar uma nota no disco');
  } else {
    if (!silent) toast(`${ok} nota${ok === 1 ? '' : 's'} gravada${ok === 1 ? '' : 's'} em "${disk.name}"`, 'ok');
    setStatus(`Sincronizado com ${disk.name}`);
  }
}

function notebookForPath(segs) {
  let parent = '';
  let id = '';
  segs.forEach(name => {
    const found = notebooks.find(nb => (nb.parentId || '') === parent &&
      nb.name.toLowerCase() === name.toLowerCase());
    if (found) {
      id = found.id;
    } else {
      const nb = { id: uid(), name, parentId: parent, createdAt: Date.now() };
      notebooks.push(nb);
      id = nb.id;
    }
    parent = id;
  });
  return id;
}

async function walkDir(dir, prefix, out, depth = 0) {
  if (depth > 6 || out.length > 2000) return;
  for await (const entry of dir.values()) {
    if (entry.name.startsWith('.')) continue;
    if (entry.kind === 'directory') {
      await walkDir(entry, [...prefix, entry.name], out, depth + 1);
    } else if (/\.md$/i.test(entry.name)) {
      const file = await entry.getFile();
      out.push({ path: [...prefix, entry.name], text: await file.text() });
    }
  }
}

async function importFromDisk() {
  if (!disk.ready || !disk.handle) { toast('Escolha uma pasta primeiro', 'warn'); return; }
  const found = [];
  try {
    await walkDir(disk.handle, [], found);
  } catch {
    toast('Não consegui ler a pasta', 'warn');
    return;
  }
  if (!found.length) { toast('Nenhum arquivo .md na pasta', 'info'); return; }

  let created = 0;
  let updated = 0;
  found.forEach(f => {
    const { data, body } = parseFrontmatter(f.text);
    const path = f.path.join('/');
    const heading = body.match(/^#\s+(.+)$/m);
    const title = String(
      data.title || (heading && heading[1]) || f.path[f.path.length - 1].replace(/\.md$/i, '')
    ).trim() || 'Sem título';
    const notebookId = notebookForPath(f.path.slice(0, -1).map(safeFolder));
    const stamp = Date.parse(data.updated || '') || Date.now();
    const existing = notes.find(n =>
      (data.id && n.id === String(data.id)) ||
      (n.diskPath && n.diskPath === path) ||
      (!n.content && slugKey(n.title) === slugKey(title)));

    if (existing) {
      existing.title = title;
      existing.content = body.trim();
      existing.notebookId = notebookId;
      existing.tags = Array.from(new Set([...toTagArray(existing.tags), ...toTagArray(data.tags)]));
      existing.pinned = existing.pinned || !!data.pinned;
      existing.diskPath = path;
      existing.updatedAt = stamp;
      updated++;
    } else {
      notes.push({
        id: String(data.id || uid()),
        title,
        content: body.trim(),
        notebookId,
        tags: toTagArray(data.tags),
        pinned: !!data.pinned,
        trashed: 0,
        diskPath: path,
        createdAt: Date.parse(data.created || '') || stamp,
        updatedAt: stamp
      });
      created++;
    }
  });

  persistAll();
  ui.contentLoadedFor = null;
  renderAll();
  toast(`${created} criada${created === 1 ? '' : 's'}, ${updated} atualizada${updated === 1 ? '' : 's'}`, 'ok');
  setStatus(`Importadas ${found.length} notas de "${disk.name}"`);
}

async function pickFolder() {
  if (!disk.supported) {
    toast('Este navegador não grava pastas — use Chrome, Edge ou Opera', 'warn');
    return;
  }
  let handle;
  try {
    handle = await window.showDirectoryPicker({ mode: 'readwrite', id: 'neodrop-notes' });
  } catch (err) {
    if (err && err.name === 'AbortError') return;
    toast('Não foi possível abrir a pasta', 'warn');
    return;
  }
  disk.handle = handle;
  disk.name = handle.name;
  disk.ready = true;
  disk.needsPermission = false;
  disk.written = 0;
  await idb.set('rootDir', handle);
  updateDiskUI();
  toast(`Pasta "${handle.name}" conectada`, 'ok');
  setStatus(`Gravando .md em ${handle.name}`);

  const files = [];
  try { await walkDir(handle, [], files); } catch { /* sem permissão de leitura */ }
  if (files.length) {
    confirmAction('Importar notas da pasta',
      `A pasta tem ${files.length} arquivo${files.length === 1 ? '' : 's'} .md. Quer importar como notas? As notas atuais continuam como estão.`,
      () => importFromDisk());
  }
}

async function reconnectFolder() {
  if (!disk.handle) return;
  try {
    const st = await disk.handle.requestPermission({ mode: 'readwrite' });
    if (st === 'granted') {
      disk.ready = true;
      disk.needsPermission = false;
      updateDiskUI();
      toast(`Pasta "${disk.name}" reconectada`, 'ok');
    } else {
      toast('Permissão negada pelo navegador', 'warn');
    }
  } catch {
    toast('Não foi possível reconectar a pasta', 'warn');
  }
}

async function restoreFolder() {
  if (!disk.supported) { updateDiskUI(); return; }
  const handle = await idb.get('rootDir');
  if (!handle) return;
  disk.handle = handle;
  disk.name = handle.name || 'pasta';
  let st = 'prompt';
  try { st = await handle.queryPermission({ mode: 'readwrite' }); } catch { st = 'denied'; }
  disk.ready = st === 'granted';
  disk.needsPermission = !disk.ready;
  disk.written = notes.filter(n => n.diskPath).length;
  updateDiskUI();
  if (disk.ready) setStatus(`Pasta "${disk.name}" reconectada`);
}

async function forgetFolder() {
  await idb.del('rootDir');
  disk.handle = null;
  disk.ready = false;
  disk.needsPermission = false;
  disk.name = '';
  disk.written = 0;
  disk.pending.clear();
  updateDiskUI();
  toast('Pasta desconectada — as notas seguem no navegador', 'info');
}

/* ================= exportar / importar ================= */
function downloadNoteAsMd() {
  const n = activeNote();
  if (!n) { toast('Abra uma nota antes de exportar', 'warn'); return; }
  const name = slugKey(n.title) || 'nota';
  const url = URL.createObjectURL(new Blob([noteToMd(n)], { type: 'text/markdown;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}.md`;
  a.click();
  URL.revokeObjectURL(url);
  toast(`"${name}.md" baixado`, 'ok');
  setStatus('Nota exportada como Markdown');
}

function exportPayload() {
  return { version: 1, app: 'neodrop', exportedAt: new Date().toISOString(), notebooks, notes, prefs };
}

function exportData() {
  const blob = new Blob(
    [JSON.stringify(exportPayload(), null, 2)],
    { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `neodrop-${todayISO()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('Arquivo exportado', 'ok');
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (Array.isArray(data.notebooks)) {
        notebooks = data.notebooks
          .filter(nb => nb && (nb.id || nb.name))
          .map(nb => ({
            id: nb.id || uid(),
            name: String(nb.name || 'Pasta'),
            parentId: nb.parentId || '',
            createdAt: nb.createdAt || Date.now()
          }))
          .filter((nb, i, arr) => arr.findIndex(x => x.id === nb.id) === i);
      }
      if (Array.isArray(data.notes)) {
        notes = data.notes.map(n => ({
          id: n.id || uid(),
          title: String(n.title ?? ''),
          content: String(n.content ?? ''),
          notebookId: n.notebookId || '',
          pinned: !!n.pinned,
          trashed: n.trashed || 0,
          diskPath: '',
          createdAt: n.createdAt || Date.now(),
          updatedAt: n.updatedAt || Date.now()
        }));
      }
      if (data.prefs) prefs = Object.assign({}, defaultPrefs, data.prefs);
      ui.activeId = notes.find(n => !n.trashed)?.id || null;
      ui.contentLoadedFor = null;
      ui.notebook = 'all';
      ui.tag = '';
      ui.q = '';
      setVal('global-search', '');
      persistAll();
      applyPrefs();
      renderAll();
      toast('Dados importados', 'ok');
    } catch {
      toast('Arquivo inválido', 'warn');
    }
  };
  reader.readAsText(file);
}

function resetAll() {
  confirmAction('Apagar tudo',
    'Pastas, notas, lixeira e preferências serão removidas do navegador. Os arquivos .md na pasta não são tocados. Continuar?', () => {
      notes = [];
      notebooks = [];
      prefs = Object.assign({}, defaultPrefs);
      ui.activeId = null;
      ui.contentLoadedFor = null;
      ui.notebook = 'all';
      ui.tag = '';
      ui.q = '';
      ui.collapsed = new Set();
      setVal('global-search', '');
      persistAll();
      applyPrefs();
      renderAll();
      renderNotebookManager();
      toast('Dados apagados', 'warn');
    });
}

/* ================= exemplo ================= */
function seedData() {
  const mkNb = (name, parentId = '') => ({ id: uid(), name, parentId, createdAt: Date.now() });
  const js = mkNb('JavaScript');
  const asyncNb = mkNb('Async & Promises', js.id);
  const ink = mkNb('Projeto Inkdrop');
  const rec = mkNb('Receitas');
  notebooks = [js, asyncNb, ink, rec];

  const mk = (title, content, notebookId, extra = {}) => ({
    id: uid(),
    title,
    content,
    notebookId: notebookId || '',
    pinned: !!extra.pinned,
    trashed: 0,
    diskPath: '',
    createdAt: Date.now() - (extra.age || 0) * 3600000,
    updatedAt: Date.now() - (extra.age || 0) * 60000
  });

  notes = [
    mk('Bem-vindo ao NeoDrop', [
      '# Bem-vindo',
      '',
      'Editor de notas Markdown em **um arquivo só**, sem servidor e sem dependências.',
      'Funciona offline: tudo fica no `localStorage` e, se você quiser, cada nota',
      'vira um `.md` de verdade dentro de uma pasta do seu disco.',
      '',
      '## O que dá para fazer',
      '',
      '- Pastas hierárquicas, como em [[Async/Await sem drama]]',
      '- Tags com #markdown e #neodrop escritas direto no corpo do texto',
      '- Links de volta: use `[[Bem-vindo ao NeoDrop]]` em outra nota para ela aparecer aqui',
      '- Blocos de código, tabelas e checklists renderizados no preview',
      '',
      '## Atalhos',
      '',
      '| Tecla | O que faz |',
      '| :-- | :-- |',
      '| `/` | focar a busca |',
      '| `Ctrl`+`N` | nova nota |',
      '| `Ctrl`+`S` | gravar no disco |',
      '',
      '> Comece pelas notas de exemplo em **Receitas**.',
      '',
      '```js',
      'const notas = JSON.parse(localStorage.getItem("neodrop.notes"));',
      'console.log(notas.length);',
      '```'
    ].join('\n'), '', { pinned: true, age: 1 }),

    mk('Async/Await sem drama', [
      '# Async/Await',
      '',
      'Regra de ouro: **await sempre espera uma Promise**. Se não for Promise, resolve na hora.',
      '',
      '## Os três saboros',
      '',
      '```js',
      'const a = await fetch("/api");              // Promise',
      'const b = await 42;                        // number — funciona',
      'const { total } = await Promise.all([a, b]);',
      '```',
      '',
      '## Checklist',
      '',
      '- [x] Envolver a chamada em `try/catch`',
      '- [x] Usar `Promise.all` para tarefas paralelas',
      '- [ ] Ler o trecho de [[Padrões de Promise]]',
      '',
      '> `await` dentro de um `for` sequencial é o erro de performance mais comum. #javascript #async',
      '',
      'Veja também: [[Bem-vindo ao NeoDrop]] e [[Roadmap do Inkdrop]].'
    ].join('\n'), js.id, { age: 3 }),

    mk('Padrões de Promise', [
      '# Padrões de Promise',
      '',
      '| Padrão | Quando usar |',
      '| :-- | :-- |',
      '| `Promise.all` | tudo precisa dar certo |',
      '| `Promise.allSettled` | parte pode falhar |',
      '| `Promise.race` | o primeiro resultado vence |',
      '| `AbortController` | cancelar requisição |',
      '',
      '- [x] Anotar o motivo de cada escolha #javascript #referencia',
      '- [ ] Testar `allSettled` no projeto do Inkdrop'
    ].join('\n'), asyncNb.id, { age: 26 }),

    mk('Roadmap do Inkdrop', [
      '# Roadmap',
      '',
      'Ordem que eu pretendo atacar, do editor para a sincronização:',
      '',
      '1. Editor com realce de sintaxe — feito',
      '2. Pastas hierárquicas — feito',
      '3. Tags e backlinks — feito',
      '4. Gravar `.md` no disco — feito',
      '5. _Futuro_: arrastar e soltar para reordenar',
      '6. _Futuro_: histórico por nota',
      '',
      'Leitura de apoio: [[Async/Await sem drama]] e [[Padrões de Promise]]. #projeto'
    ].join('\n'), ink.id, { age: 50 }),

    mk('Receita: git bisect', [
      '# git bisect',
      '',
      '```bash',
      'git bisect start',
      'git bisect bad              # versão atual quebrada',
      'git bisect good v1.2.0      # última versão boa',
      '# o git faz checkout do meio e você testa:',
      'npm test                    # ok? "git bisect good" / falha? "git bisect bad"',
      'git bisect reset',
      '```',
      '',
      'Automatizado: `git bisect run npm test`. #git #receita'
    ].join('\n'), rec.id, { age: 72 })
  ];

  ui.activeId = notes[0].id;
  ui.contentLoadedFor = null;
  ui.notebook = 'all';
  ui.tag = '';
  ui.q = '';
  ui.collapsed = new Set();
  persistAll();
  renderAll();
  toast('Notas de exemplo carregadas', 'ok');
}

/* ================= views ================= */
const VIEW_META = {
  notes: ['Notas', 'Suas notas em Markdown'],
  trash: ['Lixeira', 'Notas excluídas'],
  settings: ['Ajustes', 'Temas, pasta no disco e dados']
};

function setView(view) {
  if (!VIEW_META[view]) return;
  ui.view = view;
  qa('.view').forEach(v => v.classList.toggle('is-hidden', v.id !== `view-${view}`));
  qa('.nav-item').forEach(b => b.classList.toggle('is-active', b.dataset.view === view));
  setText('view-title', VIEW_META[view][0]);
  setText('view-sub', VIEW_META[view][1]);
  el('sidebar').classList.remove('is-open');
  if (view === 'notes') renderNoteList();
  if (view === 'trash') renderTrash();
  if (view === 'settings') { renderThemeGrid(); renderNotebookManager(); updateDiskUI(); }
  setStatus(VIEW_META[view][0]);
}

function renderAll() {
  renderTree();
  renderTagList();
  renderNotebookSelect();
  renderNoteList();
  renderEditor();
  renderTrash();
  updateDiskUI();
  setVal('note-sort', ui.sort);
}

/* ================= eventos ================= */
function bindEditorToolbar() {
  const bar = el('editor-toolbar');
  if (!bar) return;
  bar.addEventListener('click', e => {
    const modeBtn = e.target.closest('.mode-btn');
    if (modeBtn) { setMode(modeBtn.dataset.mode); return; }

    const act = e.target.closest('[data-action]');
    if (act) {
      if (act.dataset.action === 'note-download') downloadNoteAsMd();
      if (act.dataset.action === 'note-trash') {
        const n = activeNote();
        if (n) trashNote(n);
      }
      return;
    }

    const tool = e.target.closest('.tool');
    if (!tool || (!tool.dataset.wrap && !tool.dataset.prefix)) return;
    const ta = el('note-content');
    if (!ta || ta.disabled) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const sel = ta.value.slice(start, end);
    let ins;

    if (tool.dataset.wrap) {
      const w = tool.dataset.wrap;
      const w2 = tool.dataset.wrap2 || w;
      ins = sel ? `${w}${sel}${w2}` : (w === '`' ? '``' : `${w}${w2}`);
    } else {
      const pfx = tool.dataset.prefix;
      if (!pfx.endsWith(' ')) {
        ins = sel ? `${pfx}\n${sel}\n${pfx}` : `${pfx}\n`;
      } else {
        const lineStart = ta.value.lastIndexOf('\n', start - 1) + 1;
        const nl = ta.value.indexOf('\n', end);
        const lineEnd = nl === -1 ? ta.value.length : nl;
        const src = ta.value.slice(lineStart, lineEnd).split('\n');
        const want = pfx.trimEnd().replace(/\s+/g, ' ');
        const out = src.map(line => {
          const m = line.match(/^\s{0,3}(?:#{1,6}\s+|>\s?|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)/);
          const body = m ? line.slice(m[0].length) : line;
          if (m && m[0].trim().replace(/\s+/g, ' ') === want) return body;
          return `${pfx}${want === '- [ ]' ? body.replace(/^[-*+]\s+/, '') : body}`;
        });
        ta.value = ta.value.slice(0, lineStart) + out.join('\n') + ta.value.slice(lineEnd);
        const caret = lineStart + out[0].length + (start - lineStart);
        ta.focus();
        ta.setSelectionRange(caret, caret);
        updateNote({ content: ta.value });
        return;
      }
    }
    ta.value = ta.value.slice(0, start) + ins + ta.value.slice(end);
    ta.focus();
    ta.setSelectionRange(start + ins.length, start + ins.length);
    updateNote({ content: ta.value });
  });
}

function focusNotebookRow(id) {
  const row = qa('.nb-row').find(r => r.dataset.nb === id);
  const input = row && row.querySelector('.nb-name');
  if (!input) return;
  input.focus();
  input.select();
}

function bindEvents() {
  qa('.nav-item').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
  el('btn-menu').addEventListener('click', () => el('sidebar').classList.toggle('is-open'));
  el('backdrop').addEventListener('click', closeModals);
  qa('[data-close]').forEach(b => b.addEventListener('click', closeModals));

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => syncHighlightScroll(), 80);
  });

  document.addEventListener('click', e => {
    const act = e.target.closest('[data-action]');
    if (act) {
      const a = act.dataset.action;
      if (a === 'new-note') createNote();
      if (a === 'toggle-pin') {
        const n = activeNote();
        if (!n) return;
        const next = !n.pinned;
        updateNote({ pinned: next });
        toast(next ? 'Nota fixada no topo' : 'Nota desafixada', 'ok');
      }
      if (a === 'new-notebook') {
        const nb = addNotebook('Nova pasta');
        if (nb) {
          openModal('notebook-modal');
          focusNotebookRow(nb.id);
          setStatus(`Pasta "${nb.name}" criada`);
        }
      }
      if (a === 'open-notebooks') {
        renderNotebookManager();
        openModal('notebook-modal');
        setStatus('Gerenciando pastas');
      }
      if (a === 'clear-tag-filter') { ui.tag = ''; renderAll(); setStatus('Filtro de tag removido'); }
      if (a === 'pick-folder') pickFolder();
      if (a === 'sync-disk') { if (disk.needsPermission) reconnectFolder(); else syncDisk(); }
      if (a === 'import-disk') importFromDisk();
      if (a === 'forget-folder') forgetFolder();
      if (a === 'empty-trash') emptyTrash();
      if (a === 'export') exportData();
      if (a === 'import') el('import-file').click();
      if (a === 'seed') seedData();
      if (a === 'reset') resetAll();
      if (a === 'reset-accent') {
        prefs.accent = THEME_ACCENT[prefs.theme] || THEME_ACCENT.midnight;
        prefs.accentCustom = false;
        applyPrefs();
        persistPrefs();
        toast('Cor de destaque restaurada', 'ok');
      }
      return;
    }

    const themeCard = e.target.closest('[data-theme-id]');
    if (themeCard) { setTheme(themeCard.dataset.themeId); return; }

    const toggle = e.target.closest('[data-toggle-nb]');
    if (toggle) {
      const id = toggle.dataset.toggleNb;
      if (ui.collapsed.has(id)) ui.collapsed.delete(id);
      else ui.collapsed.add(id);
      renderTree();
      return;
    }

    const addChild = e.target.closest('[data-add-child]');
    if (addChild) {
      const nb = addNotebook('Nova subpasta', addChild.dataset.addChild);
      if (nb) {
        ui.collapsed.delete(nb.parentId);
        renderTree();
        openModal('notebook-modal');
        focusNotebookRow(nb.id);
      }
      return;
    }

    const editNb = e.target.closest('[data-edit-nb]');
    if (editNb) {
      openModal('notebook-modal');
      focusNotebookRow(editNb.dataset.editNb);
      return;
    }

    const delNb = e.target.closest('[data-del-nb]');
    if (delNb) {
      const nb = notebooks.find(x => x.id === delNb.dataset.delNb);
      if (nb) deleteNotebook(nb);
      return;
    }

    const nbLabel = e.target.closest('[data-notebook]');
    if (nbLabel) {
      ui.notebook = nbLabel.dataset.notebook;
      renderAll();
      setStatus(ui.notebook === 'all' ? 'Todas as notas'
        : ui.notebook === '' ? 'Pasta: sem pasta' : `Pasta: ${nbPath(ui.notebook)}`);
      return;
    }

    const tagBtn = e.target.closest('[data-tag]');
    if (tagBtn) {
      ui.tag = ui.tag === tagBtn.dataset.tag ? '' : tagBtn.dataset.tag;
      renderAll();
      setStatus(ui.tag ? `Filtro: #${ui.tag}` : 'Filtro de tag removido');
      return;
    }

    const clearFilter = e.target.closest('[data-clear-filter]');
    if (clearFilter) {
      const k = clearFilter.dataset.clearFilter;
      if (k === 'q') { ui.q = ''; setVal('global-search', ''); }
      if (k === 'notebook') ui.notebook = 'all';
      if (k === 'tag') ui.tag = '';
      renderAll();
      return;
    }

    const restore = e.target.closest('[data-restore]');
    if (restore) {
      const n = notes.find(x => x.id === restore.dataset.restore);
      if (n) restoreNote(n);
      return;
    }

    const purge = e.target.closest('[data-purge]');
    if (purge) {
      const n = notes.find(x => x.id === purge.dataset.purge);
      if (n) purgeNote(n);
      return;
    }

    const row = e.target.closest('[data-note]');
    if (row) { openNote(row.dataset.note); return; }

    const wiki = e.target.closest('[data-open-note]');
    if (wiki) {
      const target = noteByTitle(wiki.dataset.openNote);
      if (target) openNote(target.id);
      else toast(`Nota "${wiki.dataset.openNote}" não existe`, 'warn');
      return;
    }
  });

  el('global-search').addEventListener('input', e => {
    ui.q = e.target.value;
    if (ui.view !== 'notes') setView('notes');
    renderNoteList();
  });

  el('note-sort').addEventListener('change', e => {
    ui.sort = e.target.value;
    renderNoteList();
  });

  el('note-title').addEventListener('input', e => updateNote({ title: e.target.value }));
  el('note-notebook').addEventListener('change', e => updateNote({ notebookId: e.target.value }));

  const ta = el('note-content');
  ta.addEventListener('input', e => updateNote({ content: e.target.value }));
  ta.addEventListener('scroll', syncHighlightScroll);
  ta.addEventListener('keydown', e => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      if (e.shiftKey) {
        const lineStart = ta.value.lastIndexOf('\n', start - 1) + 1;
        const strip = ta.value.slice(lineStart, lineStart + 2) === '  ' ? 2 : 1;
        ta.value = ta.value.slice(0, lineStart) + ta.value.slice(lineStart + strip);
        ta.setSelectionRange(Math.max(lineStart, start - strip), Math.max(lineStart, end - strip));
      } else {
        ta.value = `${ta.value.slice(0, start)}  ${ta.value.slice(end)}`;
        ta.setSelectionRange(start + 2, start + 2);
      }
      updateNote({ content: ta.value });
    }
  });

  bindEditorToolbar();

  el('notebook-add-form').addEventListener('submit', e => {
    e.preventDefault();
    const input = el('notebook-new');
    const nb = addNotebook(input.value);
    input.value = '';
    if (nb) focusNotebookRow(nb.id);
  });

  el('notebook-manager').addEventListener('change', e => {
    const row = e.target.closest('.nb-row');
    if (!row) return;
    const nb = notebooks.find(x => x.id === row.dataset.nb);
    if (!nb) return;
    if (e.target.classList.contains('nb-name')) nb.name = e.target.value.trim() || 'Pasta';
    if (e.target.classList.contains('nb-parent')) nb.parentId = e.target.value;
    persistNotebooks();
    renderTree();
    renderNotebookSelect();
    renderNoteList();
    const diskNote = activeNote();
    if (diskNote) queueDiskWrite(diskNote.id);
  });

  el('confirm-ok').addEventListener('click', () => {
    const cb = ui.confirmAction;
    ui.confirmAction = null;
    closeModals();
    if (cb) cb();
  });

  if (el('accent-picker-2')) el('accent-picker-2').addEventListener('input', e => {
    prefs.accent = e.target.value;
    prefs.accentCustom = true;
    applyPrefs();
    persistPrefs();
  });

  el('opt-compact').addEventListener('change', e => {
    prefs.density = e.target.checked ? 'compact' : 'normal';
    applyPrefs();
    persistPrefs();
  });
  el('opt-motion').addEventListener('change', e => {
    prefs.motion = e.target.checked ? 'on' : 'off';
    applyPrefs();
    persistPrefs();
  });
  el('opt-font').addEventListener('change', e => {
    prefs.font = e.target.value;
    applyPrefs();
    persistPrefs();
  });
  el('opt-editor-size').addEventListener('input', e => {
    prefs.editorSize = Number(e.target.value) || 14;
    applyPrefs();
    persistPrefs();
  });
  el('opt-autosync').addEventListener('change', e => {
    prefs.autosync = e.target.checked;
    persistPrefs();
    if (!prefs.autosync) disk.pending.clear();
    updateDiskUI();
    toast(prefs.autosync ? 'Sincronização automática ligada' : 'Sincronização automática desligada', 'info');
  });

  el('import-file').addEventListener('change', e => {
    if (e.target.files[0]) importData(e.target.files[0]);
    e.target.value = '';
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeModals();
      el('sidebar').classList.remove('is-open');
      return;
    }
    const typing = /input|textarea|select/i.test(document.activeElement.tagName);
    const mod = e.ctrlKey || e.metaKey;

    if (mod && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (disk.ready) syncDisk();
      else toast('Escolha uma pasta para gravar no disco', 'warn');
      return;
    }
    if (mod && e.key.toLowerCase() === 'n') { e.preventDefault(); createNote(); return; }
    const inEditor = document.activeElement === el('note-content');
    if (mod && inEditor && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      wrapSelection('**');
      return;
    }
    if (mod && inEditor && e.key.toLowerCase() === 'i') {
      e.preventDefault();
      wrapSelection('*');
      return;
    }
    if (mod && inEditor && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      wrapSelection('`');
      return;
    }
    if (typing) return;
    if (e.key === '/') { e.preventDefault(); el('global-search').focus(); }
  });

  function tick() {
    setText('clock-time', new Date().toLocaleTimeString('pt-BR'));
    setText('clock-date', new Date().toLocaleDateString('pt-BR', {
      weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
    }));
  }
  tick();
  setInterval(tick, 1000);
}

function wrapSelection(wrap) {
  const ta = el('note-content');
  if (!ta || ta.disabled) return;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const sel = ta.value.slice(start, end);
  const ins = sel ? `${wrap}${sel}${wrap}` : (wrap === '`' ? '``' : `${wrap}${wrap}`);
  ta.value = ta.value.slice(0, start) + ins + ta.value.slice(end);
  ta.focus();
  ta.setSelectionRange(start + ins.length, start + ins.length);
  updateNote({ content: ta.value });
}

/* ================= init ================= */
function init() {
  applyPrefs();
  if (!notes.length && !notebooks.length) seedData();
  bindEvents();
  setView('notes');
  renderAll();
  restoreFolder();
  setInterval(() => {
    if (disk.ready && disk.pending.size) syncDisk(true);
  }, 20000);
}

init();