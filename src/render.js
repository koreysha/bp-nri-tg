import { Preset } from './filters.js';

export function renderSkeleton(root, count=5){
  root.innerHTML = Array.from({length:count}).map(()=>`
    <div class="skel-card">
      <div class="skel-line" style="width:60%"></div>
      <div class="skel-gap"></div>
      <div class="skel-line sm" style="width:40%"></div>
      <div class="skel-gap"></div>
      <div class="skel-line" style="width:90%"></div>
    </div>
  `).join('');
}

export function renderFilters($root, state, onChange){
  $root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'controls';

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
    btn.onclick = ()=> onChange({ preset: key });
    wrap.appendChild(btn);
  }

  // Видимый тумблер «Скрыть без мест» (полезно вне Telegram)
  const hideBtn = document.createElement('button');
  hideBtn.className = 'chip' + (state.hideFull ? ' active' : '');
  hideBtn.textContent = state.hideFull ? 'Скрыть без мест: ВКЛ' : 'Скрыть без мест: ВЫКЛ';
  hideBtn.onclick = () => onChange({ hideFull: !state.hideFull });
  wrap.appendChild(hideBtn);

  $root.appendChild(wrap);
}

export function renderList($root, items){
  if (!items.length) {
    $root.innerHTML = `<div class="notice">Ничего не найдено по текущим фильтрам.</div>`;
    return;
  }
  $root.innerHTML = items.map(cardHtml).join('');
  $root.querySelectorAll('[data-act="signup"]').forEach(btn=>{
    btn.addEventListener('click', () => {
      const url = btn.getAttribute('data-url');
      if (url) window.open(url, '_blank');
    });
  });
}

function cardHtml(it){
  const d = formatDateMSK(new Date(it.date));
  const spots = it.spotsFree==null ? '' : (it.spotsFree>0 ? `<span class="badge ok">Свободно: ${it.spotsFree}</span>` : `<span class="badge danger">Нет мест</span>`);
  const sys = it.system ? `<span class="badge accent">${escapeHtml(it.system)}</span>` : '';
  return `
    <article class="card">
      <div class="card-header">
        <h3 class="card-title">${escapeHtml(it.title)}</h3>
        <div class="card-sub">${d}</div>
      </div>
      <div>${sys} ${spots}</div>
      <div class="card-desc">${escapeHtml(it.short||'')}</div>
      <div class="card-actions">
        <button class="btn btn-primary" data-act="signup" data-url="${encodeURI(it.signupUrl)}">Записаться</button>
      </div>
    </article>`;
}

function formatDateMSK(d){
  const fmt = new Intl.DateTimeFormat('ru-RU', { weekday:'short', day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
  return fmt.format(d).replace('.', '') + ' (MSK)';
}

function escapeHtml(s){ return (s+'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
