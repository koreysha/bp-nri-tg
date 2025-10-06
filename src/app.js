import { Preset, filterItems } from './filters.js';
import { extractCardsWithMeta, lastStats } from './embedParser.js';

const CONFIG = {
  SOURCE_URL: 'https://vm-aa013a8f.na4u.ru/games', // nginx-прокси
  CACHE_TTL_MS: 30 * 60 * 1000,
  HIDE_FULL_DEFAULT: true,
};

const DEBUG = new URLSearchParams(location.search).get('debug') === '1';

const $list = document.getElementById('list');
const $filters = document.getElementById('filters');
const $notice = document.getElementById('notice');

const state = { items: [], preset: Preset.ALL, hideFull: CONFIG.HIDE_FULL_DEFAULT, cacheAt: null };
if (!window.Telegram || !Telegram.WebApp) state.hideFull = false;

initTelegram();
main().catch(err=>{
  console.error(err);
  showNotice('Не удалось загрузить данные. Показаны последние сохранённые (если есть).');
  const cached = loadCache();
  if (cached) { state.items = cached.items; state.cacheAt = cached.timestamp; update(); }
});

async function main(){
  showSkeleton();
  renderFilters();

  const html = await fetchText(CONFIG.SOURCE_URL);
  if (DEBUG) console.log('RAW HTML length:', html.length);
  const doc = new DOMParser().parseFromString(html, 'text/html');

  // Подключаем внешние стили с исходной страницы (чтобы карточки выглядели как на сайте)
  adoptExternalStyles(doc);

  const items = extractCardsWithMeta(doc);
  if (DEBUG) console.log('Embed stats:', lastStats);
  if (!items.length) throw new Error('Не нашли карточки .t778__wrapper');

  state.items = items;
  state.cacheAt = Date.now();
  saveCache(items);
  update();
}

function update(){
  renderFilters();
  const filtered = filterItems(state.items, { preset: state.preset, hideFull: state.hideFull });
  renderEmbeddedCards(filtered);
  updateMainButton();
}

function renderEmbeddedCards(items){
  if (!items.length) { $list.innerHTML = `<div class="notice">Ничего не найдено по текущим фильтрам.</div>`; return; }
  $list.classList.add('tilda-hosted');
  $list.innerHTML = items.map(it => it.html).join('\n');
  $list.querySelectorAll('a[href]').forEach(a => { a.setAttribute('target','_blank'); a.setAttribute('rel','noopener'); });
}

function renderFilters(){
  const wrap = document.getElementById('filters');
  wrap.innerHTML = '';
  const chips = [
    [Preset.ALL, 'Все'],
    [Preset.TODAY, 'Сегодня'],
    [Preset.WEEK, 'Эта неделя'],
    [Preset.WEEKEND, 'Ближайшие выходные'],
  ];
  for (const [key,label] of chips){
    const btn = document.createElement('button');
    btn.className = 'chip' + (state.preset===key?' active':'');
    btn.textContent = label;
    btn.onclick = ()=> { state.preset = key; update(); };
    wrap.appendChild(btn);
  }
  const hideBtn = document.createElement('button');
  hideBtn.className = 'chip' + (state.hideFull ? ' active' : '');
  hideBtn.textContent = state.hideFull ? 'Скрыть без мест: ВКЛ' : 'Скрыть без мест: ВЫКЛ';
  hideBtn.onclick = () => { state.hideFull = !state.hideFull; update(); };
  wrap.appendChild(hideBtn);
}

function adoptExternalStyles(doc){
  const head = document.head;
  const links = Array.from(doc.querySelectorAll('link[rel="stylesheet"]'));
  links.forEach(link => {
    const href = link.getAttribute('href');
    if (!href) return;
    if ([...document.querySelectorAll('link[rel="stylesheet"]')].some(x=>x.href===href)) return;
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = href;
    head.appendChild(l);
  });
}

function showSkeleton(){
  $list.innerHTML = '<div class="notice">Загружаю расписание…</div>';
}

function initTelegram(){
  const tg = window.Telegram && Telegram.WebApp;
  if (!tg) return;
  tg.ready(); tg.expand && tg.expand();
}

function updateMainButton(){
  const tg = window.Telegram && Telegram.WebApp;
  if (!tg) return;
  tg.BackButton.show();
  tg.onEvent('backButtonClicked', () => { state.preset = Preset.ALL; state.hideFull = CONFIG.HIDE_FULL_DEFAULT; update(); });
  tg.MainButton.setText(`Скрыть без мест: ${state.hideFull ? 'ВКЛ' : 'ВЫКЛ'}`);
  tg.MainButton.show();
  tg.MainButton.onClick(() => { state.hideFull = !state.hideFull; update(); });
}

async function fetchText(url){
  const ctrl = new AbortController(); const t = setTimeout(()=>ctrl.abort(), 15000);
  try { const res = await fetch(url, { mode: 'cors', signal: ctrl.signal, credentials: 'omit' }); if (!res.ok) throw new Error('HTTP '+res.status); return await res.text(); }
  finally { clearTimeout(t); }
}

function saveCache(items){ localStorage.setItem('bp-cache-embed', JSON.stringify({ version:2, timestamp: Date.now(), items })); }
function loadCache(){ try { const obj = JSON.parse(localStorage.getItem('bp-cache-embed')||'null'); if (!obj || !obj.timestamp) return null; if (Date.now()-obj.timestamp > CONFIG.CACHE_TTL_MS) return null; return obj; } catch { return null; } }

function showNotice(msg){ $notice.textContent = msg; $notice.hidden = false; }
