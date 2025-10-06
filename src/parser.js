// Устойчивый парсинг карточек игр из HTML-документа

export function parseGames(doc) {
  const out = [];
  // 1) Пытаемся найти явные карточки
  let cards = doc.querySelectorAll('.game-card, .games-card, .card, [class*="game"]');
  if (!cards || cards.length === 0) cards = doc.querySelectorAll('article, li, section');

  for (const el of cards) {
    const item = extractFromCard(el);
    if (item) out.push(item);
  }

  // 2) Если ничего не нашли — пытаемся собрать из крупных блоков
  if (out.length === 0) {
    const texts = Array.from(doc.querySelectorAll('body *')).slice(0, 2000);
    for (const el of texts) {
      const t = (el.textContent||'').trim();
      if (/(DnD|ПФ2|PF2|Ктулху|CoC|ос\.?талось|мест)/i.test(t)) {
        const item = roughExtract(el);
        if (item) out.push(item);
      }
    }
  }

  return dedup(sortByDate(out));
}

function extractFromCard(el) {
  const text = norm(el.textContent||'');
  // Дата
  const dateStr = pickDate(el) || pickDateText(text);
  if (!dateStr) return null;
  const date = toISO(dateStr);
  // Заголовок
  const title = pickTitle(el) || firstLine(text);
  // Система
  const system = pickSystem(el) || guessSystem(text);
  // Короткое
  const short = pickShort(el) || shortFromText(text);
  // Места
  const spots = pickSpots(el) || { total:null, free:null };
  // Ссылка на запись
  const signupUrl = pickSignup(el) || pickFirstLink(el, /запис/i);

  if (!title || !signupUrl) return null;
  return {
    id: hash([date, title, signupUrl].join('|')),
    date, title, system, short,
    spotsTotal: spots.total, spotsFree: spots.free,
    signupUrl
  };
}

function roughExtract(el){
  const text = norm(el.textContent||'');
  const dateStr = pickDateText(text);
  const title = firstLine(text);
  const system = guessSystem(text);
  const signupUrl = pickFirstLink(el, /http/);
  if (!dateStr || !signupUrl) return null;
  return {
    id: hash([dateStr, title, signupUrl].join('|')),
    date: toISO(dateStr), title, system,
    short: shortFromText(text), spotsTotal:null, spotsFree:null, signupUrl
  };
}

function pickDate(root){
  const el = root.querySelector('[datetime], time, .date, .game-date');
  if (el) return el.getAttribute('datetime') || el.textContent;
  return null;
}

function pickDateText(t){
  // Ищем паттерны формата  DD.MM.YYYY HH:MM  или  DD.MM HH:MM
  const m = t.match(/(\b\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?)[^\d]{0,6}(\d{1,2}[:]\d{2})/);
  if (m) return `${m[1]} ${m[2]}`;
  // fallback: без времени
  const m2 = t.match(/\b\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?/);
  if (m2) return `${m2[0]} 18:00`; // дефолт 18:00, если нет времени
  return null;
}

function toISO(s){
  // Преобразуем «DD.MM[.YYYY] HH:mm» в ISO +03:00
  const m = s.match(/(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\s+(\d{1,2}):(\d{2})/);
  if (!m) return new Date().toISOString();
  const [_, d, mo, yRaw, hh, mm] = m;
  const year = yRaw ? (+yRaw < 100 ? 2000 + +yRaw : +yRaw) : new Date().getFullYear();
  const iso = new Date(Date.UTC(year, +mo-1, +d, +hh-3, +mm)); // MSK=UTC+3
  return iso.toISOString();
}

function pickTitle(root){
  const el = root.querySelector('h1, h2, h3, .title, .game-title');
  return el && norm(el.textContent);
}

function pickSystem(root){
  const el = root.querySelector('.tag, .badge, .system, [class*="system"]');
  if (el) return norm(el.textContent);
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
  return el && norm(el.textContent);
}

function shortFromText(t){
  const s = t.replace(/\s+/g,' ').trim();
  return s.length>220 ? s.slice(0,200)+'…' : s;
}

function pickSpots(root){
  const el = root.querySelector('.seats, .spots, [class*="мест"], [class*="seat"]');
  const t = norm((el && el.textContent) || root.textContent || '');
  // Примеры: «осталось 3 места», «нет мест», «мест: 6/0 свободно: 0»
  if (/нет\s+мест/i.test(t)) return { total: null, free: 0 };
  const m = /(?:остал(?:ось|ось)|свободно|мест(?:а|о|))/i.test(t) ? t.match(/(\d{1,2})\s*(?:из|\/)?\s*(\d{1,2})?/) : null;
  if (m) {
    const a = toInt(m[1]);
    const b = toInt(m[2]);
    if (b != null) return { total: b, free: a };
    return { total: null, free: a };
  }
  return null;
}

function pickSignup(root){
  const a = root.querySelector('a[href*="t.me"], a[href*="/join"], a[href*="/signup"], a[href*="/record"]');
  return a ? a.href : null;
}

function pickFirstLink(root, re){
  const a = Array.from(root.querySelectorAll('a[href]')).find(x=> re.test(x.href) || re.test(x.textContent||''));
  return a && a.href;
}

function firstLine(s){ return norm(s).split(/\n|\.\s/)[0]; }
function norm(s){ return (s||'').replace(/\s+/g,' ').trim(); }
function toInt(x){ const n=Number.parseInt(x,10); return Number.isFinite(n)?n:null; }
function hash(s){ let h=0; for (let i=0;i<s.length;i++){ h=(h<<5)-h+s.charCodeAt(i); h|=0; } return String(h>>>0); }
function sortByDate(arr){ return arr.sort((a,b)=> new Date(a.date)-new Date(b.date)); }
function dedup(arr){ const seen=new Set(); return arr.filter(x=>{ if(seen.has(x.id)) return false; seen.add(x.id); return true; }); }
