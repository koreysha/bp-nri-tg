// Парсим только мету (дату и свободные места), сами карточки оставляем как есть
export function extractCardsWithMeta(doc){
  const cards = Array.from(doc.querySelectorAll('.t778__wrapper'));
  const out = [];
  for (const el of cards){
    const html = sanitizeOuterHTML(el.outerHTML);
    const text = visibleText(el);

    // Отбрасываем общий заголовок "Расписание игр клуба ..."
    if (/^\s*расписание\s+игр/i.test(text)) continue;

    const dateStr = pickDateFromTitle(el) || pickDateText(text);
    if (!dateStr) continue; // без даты фильтрация теряет смысл

    const date = toISO(dateStr);
    const spots = pickSpots(el, text);
    out.push({
      id: hash(html + '|' + date),
      date,
      spotsFree: spots.free,
      html
    });
  }
  return out;
}

function sanitizeOuterHTML(s){
  // Скрипты не вставляем; стили оставляем (для оформления).
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

// Пример: ".t778__title" => "Вторник 7 октября 19:00 Паладины ..."
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

// Фоллбэк: "7 октября 19:00" и т.д.
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

// "Стол набран!" или "За столом 7 мест" → мета для фильтрации
function pickSpots(root, textAll){
  const t = (textAll || '').toLowerCase();
  if (/стол\s+набран!?/i.test(t) || /нет\s+мест/i.test(t)) return { free: 0 };
  const m = t.match(/за\s+столом\s+(\d{1,2})\s+мест/iu);
  if (m) return { free: 1 }; // набор идёт → считаем, что свободно ≥ 1
  // иначе считаем, что места есть
  return { free: 1 };
}

function hash(s){ let h=0; for (let i=0;i<s.length;i++){ h=(h<<5)-h+s.charCodeAt(i); h|=0; } return String(h>>>0); }
