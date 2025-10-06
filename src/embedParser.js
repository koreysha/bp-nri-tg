// Встраиваем .t778__wrapper как есть, мета — для фильтров
export let lastStats = {};

export function extractCardsWithMeta(doc){
  const wrappers = Array.from(doc.querySelectorAll('.t778__wrapper'));
  const out = [];
  let total = wrappers.length, skippedHeader = 0, noDate = 0, noSignals = 0;

  for (const el of wrappers){
    const html = sanitizeOuterHTML(el.outerHTML);
    const text = visibleText(el);

    // 0) Отсекаем явные "шапки" (нет времени и CTA)
    if (/^\s*расписание\s+игр/i.test(text)) { skippedHeader++; continue; }

    // 1) Дата строго из .t778__title
    const dateStr = pickDateFromTitle(el);
    if (!dateStr) { noDate++; continue; }
    const date = toISO(dateStr);

    // 2) "Сигналы" карточки: "За столом/Стол набран/Нет мест" или CTA "Записаться/СМОТРЕТЬ/t.me"
    if (!hasSignals(el, text)) { noSignals++; continue; }

    const spots = pickSpots(text);
    out.push({ id: hash(html + '|' + date), date, spotsFree: spots.free, html });
  }

  lastStats = { total, kept: out.length, skippedHeader, noDate, noSignals };
  return out;
}

function sanitizeOuterHTML(s){
  return s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
}

function visibleText(root){
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  let out = '';
  while (walker.nextNode()) {
    const p = walker.currentNode.parentElement;
    if (!p) continue;
    const tag = p.tagName;
    if (tag === 'STYLE' || tag === 'SCRIPT' || tag === 'NOSCRIPT') continue;
    out += walker.currentNode.nodeValue;
  }
  return out.replace(/\s+/g, ' ').trim();
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
  const time = m[4];
  const year = new Date().getFullYear();
  const dd = String(day).padStart(2,'0');
  const mm = String(mo).padStart(2,'0');
  return `${dd}.${mm}.${year} ${time}`;
}

function toISO(s){
  const m = s.match(/(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\s+(\d{1,2}):(\d{2})/);
  if (!m) return new Date().toISOString();
  const [_, d, mo, yRaw, hh, mm] = m;
  const year = yRaw ? (+yRaw < 100 ? 2000 + +yRaw : +yRaw) : new Date().getFullYear();
  const iso = new Date(Date.UTC(year, +mo-1, +d, +hh-3, +mm)); // MSK=UTC+3
  return iso.toISOString();
}

function hasSignals(root, text){
  const t = (text||'').toLowerCase();
  const hasSeats = /за\s+столом|стол\s+набран|нет\s+мест/.test(t);
  const hasCta = Array.from(root.querySelectorAll('a,button')).some(x => {
    const s = (x.textContent||'').toLowerCase();
    const href = (x.getAttribute && x.getAttribute('href')) || '';
    return /запис|смотреть/i.test(s) || /t\.me/.test(href||'') || /(join|signup|record)/i.test(href||'');
  });
  return hasSeats || hasCta;
}

function pickSpots(textAll){
  const t = (textAll || '').toLowerCase();
  if (/стол\s+набран!?/i.test(t) || /нет\s+мест/i.test(t)) return { free: 0 };
  const m = t.match(/за\s+столом\s+(\d{1,2})\s+мест/iu);
  if (m) return { free: 1 };
  return { free: 1 };
}

function hash(s){ let h=0; for (let i=0;i<s.length;i++){ h=(h<<5)-h+s.charCodeAt(i); h|=0; } return String(h>>>0); }
