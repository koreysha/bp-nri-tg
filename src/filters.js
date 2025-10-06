// Пресеты дат и фильтрация/сортировка
export const Preset = {
  ALL: 'all', TODAY: 'today', WEEK: 'week', WEEKEND: 'weekend'
};

export function startOfDay(date) { const d=new Date(date); d.setHours(0,0,0,0); return d; }
export function endOfDay(date) { const d=new Date(date); d.setHours(23,59,59,999); return d; }

export function getDateRange(preset, now=new Date()) {
  const day = now.getDay(); // 0=Sun..6=Sat
  switch (preset) {
    case Preset.TODAY: return { from: startOfDay(now), to: endOfDay(now) };
    case Preset.WEEK: {
      const diffToMon = (day === 0 ? -6 : 1 - day); // Monday-based
      const monday = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMon));
      const sunday = endOfDay(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6));
      return { from: monday, to: sunday };
    }
    case Preset.WEEKEND: {
      const curr = startOfDay(now);
      let toSat = (6 - curr.getDay()) % 7;
      if (toSat === 0) toSat = 7; // «после текущего дня»
      const sat = new Date(curr.getFullYear(), curr.getMonth(), curr.getDate() + toSat);
      const sun = new Date(sat.getFullYear(), sat.getMonth(), sat.getDate() + 1);
      return { from: startOfDay(sat), to: endOfDay(sun) };
    }
    case Preset.ALL:
    default: return { from: null, to: null };
  }
}

export function filterItems(items, { preset, hideFull }, now=new Date()) {
  const { from, to } = getDateRange(preset, now);
  return items.filter(it => {
    const d = new Date(it.date);
    const inRange = (!from || d >= from) && (!to || d <= to);
    // Новое правило: не смогли определить — считаем, что МЕСТА ЕСТЬ
    const hasSpots = it.spotsFree == null ? true : (hideFull ? it.spotsFree > 0 : true);
    return inRange && (hideFull ? hasSpots : true);
  }).sort((a,b)=> new Date(a.date)-new Date(b.date));
}
