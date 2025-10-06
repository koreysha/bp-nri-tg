import { Preset, filterItems } from './filters.js';
import { parseGames } from './parser.js';
import { applyPaletteFromSite } from './palette.js';
import { renderSkeleton, renderFilters, renderList } from './render.js';

const CONFIG = {
  SOURCE_URL: 'https://vm-aa013a8f.na4u.ru/games',
  CACHE_TTL_MS: 30 * 60 * 1000,
  TZ: 'Europe/Moscow',
  HIDE_FULL_DEFAULT: true,
};

const DEBUG = new URLSearchParams(location.search).get('debug') === '1';

const $list = document.getElementById('list');
const $filters = document.getElementById('filters');
const $notice = document.getElementById('notice');

const state = {
  items: [],
  preset: Preset.ALL,
  hideFull: CONFIG.HIDE_FULL_DEFAULT,
  cacheAt: null,
};

// Если приложение открыто вне Telegram — показываем все (удобно для GitHub Pages)
if (!window.Telegram || !Telegram.WebApp) {
  state.hideFull = false;
}

initTelegram();
main().catch(err=>{
  console.error(err);
  showNotice('Не удалось загрузить данные. Показаны последние сохранённые (если есть).');
  const cached = loadCache();
  if (cached) { state.items = cached.items; state.cacheAt = cached.timestamp; update(); }
});

async function main(){
  renderSkeleton($list);
  renderFilters($filters, state, onFiltersChange);

  const html = await fetchText(CONFIG.SOURCE_URL);
  if (DEBUG) console.log('RAW HTML length:', html.length);
  const doc = new DOMParser().parseFromString(html, 'text/html');
  if (DEBUG) { const sample = html.slice(0, 1500).replace(/\s+/g, ' ').trim(); console.log('HTML sample:', sample); }

  applyPaletteFromSite(doc).catch(()=>{});
  if (DEBUG) showDebugPanel('HTML bytes: '+html.length);

  const items = parseGames(doc);
  try { const { _getParseStats } = await import('./parser.js'); if (DEBUG) console.log('Parse stats:', _getParseStats && _getParseStats()); } catch {}
  if (!items.length) { if (DEBUG) { const $diag = document.createElement('div'); $diag.className='notice'; $diag.textContent='DEBUG: парсер не нашёл карточки. Проверьте Network→/games: статус, длину, содержимое. Возможно, страницу рендерит JS.'; document.getElementById('app').prepend($diag); } throw new Error('Парсер не нашёл карточки'); }

  state.items = items;
  state.cacheAt = Date.now();
  saveCache(items);
  update();
}

function update(){
  renderFilters($filters, state, onFiltersChange);
  const filtered = filterItems(state.items, { preset: state.preset, hideFull: state.hideFull });
  renderList($list, filtered);
  updateMainButton();
}

function onFiltersChange(patch){
  Object.assign(state, patch);
  if (patch.preset && window.Telegram && Telegram.WebApp) Telegram.WebApp.HapticFeedback.impactOccurred('light');
  update();
}

function updateMainButton(){
  const tg = window.Telegram && Telegram.WebApp;
  if (!tg) return;
  tg.BackButton.show();
  tg.onEvent('backButtonClicked', () => {
    state.preset = Preset.ALL;
    state.hideFull = CONFIG.HIDE_FULL_DEFAULT;
    update();
  });
  tg.MainButton.setText(`Скрыть без мест: ${state.hideFull ? 'ВКЛ' : 'ВЫКЛ'}`);
  tg.MainButton.show();
  tg.MainButton.onClick(() => { state.hideFull = !state.hideFull; update(); });
}

function initTelegram(){
  const tg = window.Telegram && Telegram.WebApp;
  if (!tg) return;
  tg.ready();
  tg.expand && tg.expand();
}

async function fetchText(url){
  const ctrl = new AbortController();
  const t = setTimeout(()=>ctrl.abort(), 15000);
  try {
    const res = await fetch(url, { mode: 'cors', signal: ctrl.signal, credentials: 'omit' });
    if (!res.ok) throw new Error('HTTP '+res.status);
    return await res.text();
  } finally { clearTimeout(t); }
}

function saveCache(items){
  const payload = { version:1, timestamp: Date.now(), items };
  localStorage.setItem('bp-cache', JSON.stringify(payload));
}
function loadCache(){
  try {
    const raw = localStorage.getItem('bp-cache');
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || !obj.timestamp) return null;
    if (Date.now() - obj.timestamp > CONFIG.CACHE_TTL_MS) return null;
    return obj;
  } catch { return null; }
}
function showNotice(msg){ $notice.textContent = msg; $notice.hidden = false; }
function showDebugPanel(text){
  const el = document.createElement('div');
  el.className = 'notice';
  el.textContent = 'DEBUG: ' + text;
  document.getElementById('app').prepend(el);
}
