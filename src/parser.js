let _dbg = {strict:0, fallback:0};
export function _getParseStats(){ return _dbg; }
export function parseGames(doc) {
  const out = [];
  let cards = doc.querySelectorAll('.game-card, .games-card, .card, [class*="game"]');
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
  const text = norm(el.textContent||'');
  const dateStr = pickDate(el) || pickDateText(text);
  if (!dateStr) return null;
  const date = toISO(dateStr);
  const title = pickTitle(el) || firstLine(text);
  const system = pickSystem(el) || guessSystem(text);
  const short = pickShort(el) || shortFromText(text);
  const spots = pickSpots(el);
  const signupUrl = pickSignup(el) || pickFirstLink(el, /запис/i);
  if (!title) return null;
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
  if (!dateStr) return null;
  const spots = pickSpots(el);
  return {
    id: hash([dateStr, title, signupUrl].join('|')),
    date: toISO(dateStr), title, system,
    short: shortFromText(text), spotsTotal: spots.total, spotsFree: spots.free, signupUrl
  };
}

function pickDate(root){
  const el = root.querySelector('[datetime], time, .date, .game-date');
  if (el) return el.getAttribute('datetime') || el.textContent;
  return null;
}
function pickDateText(t){
  // Распознаём русские месяцы: "06 окт 19:00" / "6 октября 19:00"
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

// NEW logic per user: detect "Стол набран!" (no seats) and "За столом N мест" (assume available)
function pickSpots(root){
  const el = root.querySelector('.seats, .spots, [class*="мест"], [class*="seat"]');
  const t = norm((el && el.textContent) || root.textContent || '');

  if (/стол\s+набран!?/i.test(t)) return { total: null, free: 0 };

  let m = t.match(/за\s+столом\s+(\d{1,2})\s+мест/iu);
  if (m) {
    const total = parseInt(m[1], 10);
    return { total: Number.isFinite(total) ? total : null, free: 1 };
  }

  if (/нет\s+мест/i.test(t)) return { total: null, free: 0 };

  m = t.match(/(?:остал(?:ось|ось)|свободно)\s*[:\s]*?(\d{1,2})/i);
  if (m) {
    const free = parseInt(m[1], 10);
    return { total: null, free: Number.isFinite(free) ? free : 1 };
  }
  m = t.match(/(\d{1,2})\s*(?:из|\/)\s*(\d{1,2})/);
  if (m) {
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      const free = Math.max(b - a, 0);
      return { total: b, free };
    }
  }
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
function firstLine(s){ return norm(s).split(/\n|\.\s/)[0]; }
function norm(s){ return (s||'').replace(/\s+/g,' ').trim(); }
function toInt(x){ const n=Number.parseInt(x,10); return Number.isFinite(n)?n:null; }
function hash(s){ let h=0; for (let i=0;i<s.length;i++){ h=(h<<5)-h+s.charCodeAt(i); h|=0; } return String(h>>>0); }
function sortByDate(arr){ return arr.sort((a,b)=> new Date(a.date)-new Date(b.date)); }
function dedup(arr){ const seen=new Set(); return arr.filter(x=>{ if(seen.has(x.id)) return false; seen.add(x.id); return true; }); }
