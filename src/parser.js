let _dbg = {strict:0, fallback:0};
export function _getParseStats(){ return _dbg; }

function textOf(root){
  // Собираем видимый текст, игнорируя STYLE/SCRIPT/NOSCRIPT
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  let out = '';
  while (walker.nextNode()) {
    const n = walker.currentNode;
    const p = n.parentElement;
    if (!p) continue;
    const tag = p.tagName;
    if (tag === 'STYLE' || tag === 'SCRIPT' || tag === 'NOSCRIPT') continue;
    out += n.nodeValue;
  }
  return (out || '').replace(/\s+/g,' ').trim();
}

function stripCssNoise(s){
  if (!s) return s;
  s = s.replace(/#[a-z0-9_-]+\s*\.[^{]+\{[^}]+\}/gi, ' ');
  s = s.replace(/\.[a-z0-9_-]+\s*\{[^}]+\}/gi, ' ');
  s = s.replace(/\{[^}]*\}/g, ' ');
  s = s.replace(/(background|color|border|font|transition|box-shadow)\s*:[^;]+;?/gi, ' ');
  s = s.replace(/#rec\d+\b/gi, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

function isValidGameCard(root, text){
  // заголовок-объявление/баннеры отсеиваем
  const t = (text || '').toLowerCase();
  if (/^расписание\s+игр/.test(t)) return false; // explicit schedule heading
  if (/итоги|анонс|заголовок|недели\s+с\s+\d{1,2}\s+/.test(t)) return false;

  // Наличие явных маркеров игровой карточки
  const hasSeats = /за\s+столом|стол\s+набран|нет\s+мест/.test(t);
  const hasSignup = Array.from(root.querySelectorAll('a,button')).some(x => {
    const s = (x.textContent||'').toLowerCase();
    const href = (x.getAttribute && x.getAttribute('href')) || '';
    return /запис/.test(s) || /t\.me/.test(href||'') || /join|signup|record/.test(href||'');
  });
  return hasSeats || hasSignup;
}

export function parseGames(doc) {
  _dbg = {strict:0, fallback:0};
  const out = [];
  let cards = doc.querySelectorAll('.t778__wrapper, .game-card, .games-card, .card, [class*="game"], [id^="rec"]');
  if (!cards || cards.length === 0) cards = doc.querySelectorAll('article, li, section');
  for (const el of cards) {
    const item = extractFromCard(el);
    if (item) { out.push(item); _dbg.strict++; }
  }
  if (out.length === 0) {
    const texts = Array.from(doc.querySelectorAll('body *')).slice(0, 2000);
    for (const el of texts) {
      const t = (el.textContent||'').trim();
      if (/(DnD|ПФ2|PF2|Ктулху|CoC|ос\.?талось|мест|Стол набран|За столом)/i.test(t)) {
        const item = roughExtract(el);
        if (item) { out.push(item); _dbg.fallback++; }
      }
    }
  }
  return dedup(sortByDate(out));
}

function extractFromCard(el) {
  const text = stripCssNoise(textOf(el));
  if (!isValidGameCard(el, text)) return null;

  // дата
  const dateStr = pickDateFromTitle(el) || pickDate(el) || pickDateText(text);
  if (!dateStr) return null;
  const date = toISO(dateStr);

  // чистый заголовок — только из .t778__title
  const title = pickGameTitle(el);
  if (!title) return null;

  // описание из мета («Система», «Мастер»)
  const metaParts = [];
  const mSys = (text.match(/Система:\s*([^\n#]+)/i) || [])[1];
  const mMaster = (text.match(/Мастер:\s*([^\n#]+)/i) || [])[1];
  if (mSys) metaParts.push('Система: ' + mSys.trim());
  if (mMaster) metaParts.push('Мастер: ' + mMaster.trim());
  const short = metaParts.length ? metaParts.join(' · ') : (pickShort(el) || shortFromText(text));

  const system = pickSystem(el) || guessSystem(text);
  const spots  = pickSpots(el);
  const signupUrl = pickSignup(el) || pickFirstLink(el, /запис/i);

  return { id: hash([date, title, signupUrl||''].join('|')), date, title, system, short,
           spotsTotal: spots.total, spotsFree: spots.free, signupUrl };
}

function roughExtract(el){
  const text = stripCssNoise(textOf(el));
  if (!isValidGameCard(el, text)) return null;
  const dateStr = pickDateText(text);
  if (!dateStr) return null;

  const title = pickGameTitle(el) || firstLine(text);
  const system = guessSystem(text);
  const signupUrl = pickFirstLink(el, /http/);

  const metaParts = [];
  const mSys = (text.match(/Система:\s*([^\n#]+)/i) || [])[1];
  const mMaster = (text.match(/Мастер:\s*([^\n#]+)/i) || [])[1];
  if (mSys) metaParts.push('Система: ' + mSys.trim());
  if (mMaster) metaParts.push('Мастер: ' + mMaster.trim());
  const short = metaParts.length ? metaParts.join(' · ') : shortFromText(text);

  const spots = pickSpots(el);

  return { id: hash([dateStr, title||'', signupUrl||''].join('|')),
           date: toISO(dateStr), title, system, short,
           spotsTotal: spots.total, spotsFree: spots.free, signupUrl };
}

function pickDateFromTitle(root){
  const titleEl = root.querySelector('.t778__title');
  if (!titleEl) return null;
  const t = (titleEl.textContent || '').trim();
  const re = /(Понедельник|Вторник|Среда|Четверг|Пятница|Суббота|Воскресенье)\s+(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+(\d{1,2}:\d{2})/i;
  const m = t.match(re);
  if (!m) return null;
  const months = {января:1,февраля:2,марта:3,апреля:4,мая:5,июня:6,июля:7,августа:8,сентября:9,октября:10,ноября:11,декабря:12};
  const day = parseInt(m[2],10);
  const mo = months[m[3].toLowerCase()];
  const time = m[4]; const year = new Date().getFullYear();
  const dd = String(day).padStart(2,'0'); const mm = String(mo).padStart(2,'0');
  return `${dd}.${mm}.${year} ${time}`;
}

function pickGameTitle(root){
  // Берём только .t778__title, жёстко отрезаем дату и мета-хвосты
  const titleEl = root.querySelector('.t778__title');
  if (!titleEl) return null;

  let t = stripCssNoise(textOf(titleEl));

  const reDatePrefix = /(Понедельник|Вторник|Среда|Четверг|Пятница|Суббота|Воскресенье)\s+\d{1,2}\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+\d{1,2}:\d{2}\s*/i;
  t = t.replace(reDatePrefix, '').trim();

  const markers = [/Система:/i, /Мастер:/i, /За столом/i, /Подробнее/i, /Записаться/i, /СЕЗОН\b/i];
  let cut = t.length;
  for (const re of markers){
    const i = t.search(re);
    if (i !== -1 && i < cut) cut = i;
  }
  t = t.slice(0, cut).trim();
  t = t.replace(/^СТРИМ\s+/i, '').trim();
  return t || null;
}

function pickDate(root){
  const el = root.querySelector('[datetime], time, .date, .game-date');
  if (el) return el.getAttribute('datetime') || el.textContent;
  return null;
}
function pickTitle(root){
  const el = root.querySelector('h1, h2, h3, .title, .game-title');
  return el && textOf(el);
}
function pickDateText(t){
  const MONTHS = { 'янв':1,'января':1,'фев':2,'февраля':2,'мар':3,'марта':3,'апр':4,'апреля':4,'мая':5,'май':5,'июн':6,'июня':6,'июл':7,'июля':7,'авг':8,'августа':8,'сен':9,'сентября':9,'окт':10,'октября':10,'ноя':11,'ноября':11,'дек':12,'декабря':12 };
  let mru = t.match(/\b(\d{1,2})\s+(янв(?:аря)?|фев(?:раля)?|мар(?:та)?|апр(?:еля)?|ма[йя]|июн[ья]|июл[ья]|авг(?:уста)?|сен(?:тября)?|окт(?:ября)?|ноя(?:бря)?|дек(?:абря)?)[,\s]+(?:(\d{4})\s*)?(\d{1,2}:\d{2})?/i);
  if (mru) {
    const d = parseInt(mru[1],10);
    const mo = MONTHS[mru[2].toLowerCase()] || (new Date().getMonth()+1);
    const year = mru[3] ? parseInt(mru[3],10) : new Date().getFullYear();
    const time = mru[4] || '18:00';
    return `${String(d).padStart(2,'0')}.${String(mo).padStart(2,'0')}.${year} ${time}`;
  }
  const m = t.match(/(\b\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?)[^\d]{0,6}(\d{1,2}[:]\d{2})/);
  if (m) return `${m[1]} ${m[2]}`;
  const m2 = t.match(/\b\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?/);
  if (m2) return `${m2[0]} 18:00`;
  return null;
}
function toISO(s){
  const m = s.match(/(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\s+(\d{1,2}):(\d{2})/);
  if (!m) return new Date().toISOString();
  const [_, d, mo, yRaw, hh, mm] = m;
  const year = yRaw ? (+yRaw < 100 ? 2000 + +yRaw : +yRaw) : new Date().getFullYear();
  const iso = new Date(Date.UTC(year, +mo-1, +d, +hh-3, +mm)); // MSK=UTC+3
  return iso.toISOString();
}
function pickSystem(root){
  const el = root.querySelector('.tag, .badge, .system, [class*="system"]');
  if (el) return textOf(el);
  return null;
}
function guessSystem(t){
  if (/dnd|5e|5\s*e/i.test(t)) return 'DnD 5e';
  if (/coc|ктулху|call of cthulhu/i.test(t)) return 'CoC';
  if (/pf2|pathfinder/i.test(t)) return 'PF2e';
  return 'Настольная RPG';
}
function pickShort(root){
  const el = root.querySelector('.desc, .excerpt, .summary, p');
  return el ? textOf(el) : null;
}
function shortFromText(t){
  const s = t.replace(/\s+/g,' ').trim();
  return s.length>220 ? s.slice(0,200)+'…' : s;
}
function pickSpots(root){
  const el = root.querySelector('.seats, .spots, [class*="мест"], [class*="seat"]');
  const t = textOf(el || root);
  if (/стол\s+набран!?/i.test(t)) return { total: null, free: 0 };
  let m = t.match(/за\s+столом\s+(\d{1,2})\s+мест/iu);
  if (m) { const total = parseInt(m[1],10); return { total: (total||null), free: 1 }; }
  if (/нет\s+мест/i.test(t)) return { total: null, free: 0 };
  m = t.match(/(?:остал(?:ось|ось)|свободно)\s*[:\s]*?(\d{1,2})/i);
  if (m) { const free = parseInt(m[1],10); return { total: null, free: (Number.isFinite(free)?free:1) }; }
  m = t.match(/(\d{1,2})\s*(?:из|\/)\s*(\d{1,2})/);
  if (m) { const a=parseInt(m[1],10), b=parseInt(m[2],10); if (Number.isFinite(a)&&Number.isFinite(b)) return { total:b, free: Math.max(b-a,0) }; }
  return { total: null, free: 1 };
}
function pickSignup(root){
  let a = root.querySelector('a[href*="t.me"], a[href*="/join"], a[href*="/signup"], a[href*="/record"]');
  if (!a) a = Array.from(root.querySelectorAll("a[href]")).find(x => /запис/i.test(x.textContent||""));
  return a ? a.href : null;
}
function pickFirstLink(root, re){
  const a = Array.from(root.querySelectorAll('a[href]')).find(x=> re.test(x.href) || re.test(x.textContent||''));
  return a && a.href;
}
function firstLine(s){ return (s||'').split(/\n|\. /)[0]; }
function hash(s){ let h=0; for (let i=0;i<s.length;i++){ h=(h<<5)-h+s.charCodeAt(i); h|=0; } return String(h>>>0); }
function sortByDate(arr){ return arr.sort((a,b)=> new Date(a.date)-new Date(b.date)); }
function dedup(arr){ const seen=new Set(); return arr.filter(x=>{ if(seen.has(x.id)) return false; seen.add(x.id); return true; }); }
