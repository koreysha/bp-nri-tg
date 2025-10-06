// Эвристика: пытаемся вытащить основные цвета из CSS страницы `/games`.
// Если не удаётся — используем дефолт (в base.css).

const HEX_RE = /#[0-9a-fA-F]{6}\b/g;

export async function applyPaletteFromSite(doc) {
  try {
    // Ищем <link rel="stylesheet" ...> на странице игр
    const links = Array.from(doc.querySelectorAll('link[rel="stylesheet"]'))
      .map(l => l.href).filter(Boolean).slice(0, 3); // 1-3 файла стилей
    const cssTexts = await Promise.allSettled(links.map(href => fetch(href, { mode:'cors' }).then(r=>r.text())));
    const colors = new Map();
    cssTexts.forEach(r => {
      if (r.status === 'fulfilled') {
        const matches = r.value.match(HEX_RE) || [];
        for (const c of matches) {
          const hex = c.toLowerCase();
          colors.set(hex, (colors.get(hex)||0)+1);
        }
      }
    });
    const ranked = [...colors.entries()].sort((a,b)=>b[1]-a[1]).map(([c])=>c);

    // Простейший выбор: тёмный фон + яркий акцент
    const darks = ranked.filter(c => isDark(c));
    const brights = ranked.filter(c => !isDark(c));

    const bg = darks[0] || '#0f1014';
    const panel = darks[1] || '#151820';
    const accent = brights[0] || '#7e57ff';

    setVar('--bg', bg);
    setVar('--panel', panel);
    setVar('--accent', accent);
    setVar('--accent-2', brights[1] || '#29d3c6');
  } catch (e) {
    console.warn('palette fallback', e);
  }
}

function setVar(name, val) { document.documentElement.style.setProperty(name, val); }

function isDark(hex) {
  const {r,g,b} = hexToRgb(hex);
  const l = 0.2126*r + 0.7152*g + 0.0722*b;
  return l < 140; // 0..255
}

function hexToRgb(h){
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(h);
  return m ? { r:parseInt(m[1],16), g:parseInt(m[2],16), b:parseInt(m[3],16) } : {r:0,g:0,b:0};
}
