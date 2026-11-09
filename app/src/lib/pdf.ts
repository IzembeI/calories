// PDF export: HTML rendered by iOS WebKit via expo-print (system fonts → Cyrillic works).
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  entriesBetween,
  measurementsBetween,
  type Entry,
  type MeasurementRow,
  type Profile,
} from '@/db/repo';
import { daysBetween, diffDays, formatDay, formatShort, todayKey } from './dates';
import { MEASUREMENTS } from './measurements';
import { MEALS, fmt, macroTargets } from './nutrition';
import { NUTRIENTS, microsByDay, pctDV, type Micros, type NutrientKey } from './micros';

export interface PdfOptions {
  from: string;
  to: string;
  diary: boolean;
  diaryDetailed: boolean;
  measurements: boolean;
  charts: boolean;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const n0 = (v: number) => fmt(v, 0);
const n1 = (v: number | null | undefined) => (v == null ? '' : fmt(v, 1));

const CSS = `
  @page { margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; color: #16181A; font-size: 10.5pt; margin: 0; }
  h1 { font-size: 20pt; margin: 0 0 2mm; }
  h2 { font-size: 14pt; margin: 8mm 0 3mm; color: #1B744B; }
  h3 { font-size: 11.5pt; margin: 5mm 0 2mm; }
  .muted { color: #5F646A; }
  .small { font-size: 9pt; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 3mm; page-break-inside: auto; }
  tr { page-break-inside: avoid; }
  th, td { padding: 1.6mm 2mm; border-bottom: 0.3mm solid #E3E5E1; text-align: right; vertical-align: top; }
  th { background: #F0F1EE; font-weight: 600; font-size: 9pt; }
  th:first-child, td:first-child, td.l, th.l { text-align: left; }
  tr.total td { font-weight: 700; border-top: 0.5mm solid #16181A; }
  tr.meal td { background: #F7F8F6; font-weight: 600; }
  .day { page-break-inside: avoid; }
  .over { color: #C2392D; }
  .good { color: #1B744B; }
  .cards { display: flex; gap: 3mm; margin: 3mm 0; }
  .card { flex: 1; border: 0.3mm solid #E3E5E1; border-radius: 2mm; padding: 3mm; }
  .card b { display: block; font-size: 14pt; }
  .pb { page-break-before: always; }
  svg text { font-family: -apple-system, Arial, sans-serif; }
`;

function lineSvg(points: { date: string; value: number }[], unit: string, target?: number | null): string {
  if (points.length < 2) return '';
  const W = 520, H = 150, L = 40, R = 10, T = 10, B = 22;
  const vals = points.map((p) => p.value).concat(target != null ? [target] : []);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (lo === hi) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.1; lo -= pad; hi += pad;
  const span = Math.max(diffDays(points[0].date, points[points.length - 1].date), 1);
  const x = (d: string) => L + (diffDays(points[0].date, d) / span) * (W - L - R);
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const ticks = [lo + pad, (lo + hi) / 2, hi - pad];
  return `<svg width="100%" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    ${ticks.map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#E3E5E1"/><text x="${L - 4}" y="${y(v) + 3}" font-size="9" fill="#5F646A" text-anchor="end">${fmt(v, 1)}</text>`).join('')}
    ${target != null ? `<line x1="${L}" x2="${W - R}" y1="${y(target)}" y2="${y(target)}" stroke="#1B744B" stroke-dasharray="4 3"/>` : ''}
    <path d="${path}" fill="none" stroke="#1B744B" stroke-width="2"/>
    ${points.length <= 60 ? points.map((p) => `<circle cx="${x(p.date)}" cy="${y(p.value)}" r="2.5" fill="#1B744B"/>`).join('') : ''}
    <text x="${L}" y="${H - 6}" font-size="9" fill="#5F646A">${formatShort(points[0].date)}</text>
    <text x="${W - R}" y="${H - 6}" font-size="9" fill="#5F646A" text-anchor="end">${formatShort(points[points.length - 1].date)} · ${esc(unit)}</text>
  </svg>`;
}

function barSvg(points: { date: string; value: number }[], goal: number): string {
  if (points.length < 2) return '';
  const W = 520, H = 150, L = 40, R = 10, T = 10, B = 22;
  const max = Math.max(goal, ...points.map((p) => p.value)) * 1.1;
  const bw = (W - L - R) / points.length;
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  return `<svg width="100%" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    ${points.map((p, i) => { const h = (p.value / max) * (H - T - B); return `<rect x="${L + i * bw + bw * 0.15}" y="${H - B - h}" width="${Math.max(bw * 0.7, 0.8)}" height="${h}" fill="${p.value > goal * 1.05 ? '#B87512' : '#1B744B'}"/>`; }).join('')}
    <line x1="${L}" x2="${W - R}" y1="${y(goal)}" y2="${y(goal)}" stroke="#16181A" stroke-dasharray="4 3" stroke-opacity="0.6"/>
    <text x="${L - 4}" y="${y(goal) + 3}" font-size="9" fill="#5F646A" text-anchor="end">${n0(goal)}</text>
    <text x="${L}" y="${H - 6}" font-size="9" fill="#5F646A">${formatShort(points[0].date)}</text>
    <text x="${W - R}" y="${H - 6}" font-size="9" fill="#5F646A" text-anchor="end">${formatShort(points[points.length - 1].date)} · ккал</text>
  </svg>`;
}

const sumOf = (rows: Entry[]) =>
  rows.reduce((a, r) => ({ kcal: a.kcal + r.kcal, protein: a.protein + r.protein, fat: a.fat + r.fat, carbs: a.carbs + r.carbs }), { kcal: 0, protein: 0, fat: 0, carbs: 0 });

async function diaryHtml(db: SQLiteDatabase, p: Profile, o: PdfOptions): Promise<string> {
  const [entries, microsBy] = await Promise.all([entriesBetween(db, o.from, o.to), microsByDay(db, o.from, o.to)]);
  const byDay = new Map<string, Entry[]>();
  for (const e of entries) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);

  const days = daysBetween(o.from, o.to);
  const logged = days.filter((d) => byDay.has(d));
  const goalM = macroTargets(p);
  const totals = logged.map((d) => ({ date: d, ...sumOf(byDay.get(d)!) }));
  const avg = (k: 'kcal' | 'protein' | 'fat' | 'carbs') => (totals.length ? totals.reduce((a, t) => a + t[k], 0) / totals.length : 0);
  const onTarget = totals.filter((t) => Math.abs(t.kcal - p.kcal_goal) <= p.kcal_goal * 0.1).length;

  let html = `<h2>Дневник питания</h2>
  <div class="cards">
    <div class="card"><span class="muted small">Дней с записями</span><b>${logged.length} из ${days.length}</b></div>
    <div class="card"><span class="muted small">В среднем в день</span><b>${n0(avg('kcal'))} ккал</b><span class="small muted">норма ${n0(p.kcal_goal)}</span></div>
    <div class="card"><span class="muted small">Б / Ж / У в среднем</span><b>${n0(avg('protein'))} / ${n0(avg('fat'))} / ${n0(avg('carbs'))} г</b><span class="small muted">цель ${goalM.protein} / ${goalM.fat} / ${goalM.carbs}</span></div>
    <div class="card"><span class="muted small">В пределах ±10% нормы</span><b>${onTarget} дн.</b></div>
  </div>`;

  if (o.charts && totals.length >= 2) html += `<h3>Калории по дням</h3>${barSvg(days.map((d) => ({ date: d, value: totals.find((t) => t.date === d)?.kcal ?? 0 })), p.kcal_goal)}`;

  html += `<h3>Итоги по дням</h3><table><tr><th class="l">Дата</th><th>Ккал</th><th>Норма</th><th>Белки</th><th>Жиры</th><th>Углев.</th><th>Доб. сахар</th></tr>`;
  for (const t of totals) {
    const goal = p.kcal_goal;
    const cls = t.kcal > goal * 1.1 ? 'over' : '';
    html += `<tr><td>${formatShort(t.date)}</td><td class="${cls}">${n0(t.kcal)}</td><td>${n0(goal)}</td><td>${n0(t.protein)}</td><td>${n0(t.fat)}</td><td>${n0(t.carbs)}</td><td>${n0(microsBy.get(t.date)?.added_sugar ?? 0)} г</td></tr>`;
  }
  if (totals.length > 1)
    html += `<tr class="total"><td>Среднее</td><td>${n0(avg('kcal'))}</td><td>${n0(p.kcal_goal)}</td><td>${n0(avg('protein'))}</td><td>${n0(avg('fat'))}</td><td>${n0(avg('carbs'))}</td><td></td></tr>`;
  html += `</table>`;
  if (!totals.length) html += `<p class="muted">За выбранный период записей нет.</p>`;

  if (totals.length) {
    // Average per logged day, as % of the daily value. Estimates from product type unless the label had data.
    const avgMicros: Micros = {};
    for (const m of microsBy.values()) for (const [k, v] of Object.entries(m)) avgMicros[k as NutrientKey] = (avgMicros[k as NutrientKey] ?? 0) + (v ?? 0) / totals.length;
    html += `<h3>Витамины и минералы — в среднем за день (≈ оценка)</h3><table><tr><th class="l">Нутриент</th><th>В среднем</th><th>Норма</th><th>% нормы</th></tr>`;
    for (const d of NUTRIENTS) {
      const v = avgMicros[d.key] ?? 0;
      const pct = pctDV(d, v);
      const bad = d.limit ? pct > 100 : pct < 50;
      html += `<tr><td>${d.title}${d.limit ? ' <span class="muted small">(не больше)</span>' : ''}</td><td>${fmt(v, v < 10 ? 1 : 0)} ${d.unit}</td><td>${fmt(d.dv)} ${d.unit}</td><td class="${bad ? 'over' : 'good'}">${n0(pct)}%</td></tr>`;
    }
    html += `</table>`;
  }

  if (o.diaryDetailed && logged.length) {
    html += `<h3 class="pb">Подробно</h3>`;
    for (const d of logged) {
      const rows = byDay.get(d)!;
      const s = sumOf(rows);
      html += `<div class="day"><h3>${formatDay(d, true)}</h3><table><tr><th class="l">Продукт</th><th>Кол-во</th><th>Ккал</th><th>Б</th><th>Ж</th><th>У</th></tr>`;
      for (const m of MEALS) {
        const items = rows.filter((r) => r.meal_type === m.type);
        if (!items.length) continue;
        const ms = sumOf(items);
        html += `<tr class="meal"><td>${m.title}</td><td></td><td>${n0(ms.kcal)}</td><td>${n0(ms.protein)}</td><td>${n0(ms.fat)}</td><td>${n0(ms.carbs)}</td></tr>`;
        for (const e of items)
          html += `<tr><td class="l">${esc(e.name)}</td><td>${e.grams != null ? `${n0(e.grams)} г` : ''}${e.serving_label ? `<br><span class="muted small">${esc(e.serving_label)}</span>` : ''}</td><td>${n0(e.kcal)}</td><td>${n1(e.protein)}</td><td>${n1(e.fat)}</td><td>${n1(e.carbs)}</td></tr>`;
      }
      html += `<tr class="total"><td>Итого</td><td></td><td>${n0(s.kcal)}</td><td>${n0(s.protein)}</td><td>${n0(s.fat)}</td><td>${n0(s.carbs)}</td></tr></table></div>`;
    }
  }
  return html;
}

async function measurementsHtml(db: SQLiteDatabase, p: Profile, o: PdfOptions): Promise<string> {
  const rows = await measurementsBetween(db, o.from, o.to);
  let html = `<h2 class="${o.diary ? 'pb' : ''}">Замеры тела</h2>`;
  if (!rows.length) return html + `<p class="muted">За выбранный период замеров нет.</p>`;
  const types = MEASUREMENTS.filter((m) => rows.some((r) => r.type === m.type));
  const byType = new Map<string, MeasurementRow[]>();
  for (const r of rows) byType.set(r.type, [...(byType.get(r.type) ?? []), r]);

  html += `<h3>Изменения за период</h3><table><tr><th class="l">Замер</th><th>Первый</th><th>Последний</th><th>Изменение</th><th>Записей</th></tr>`;
  for (const m of types) {
    const s = byType.get(m.type)!;
    const a = s[0], b = s[s.length - 1];
    const d = b.value - a.value;
    html += `<tr><td>${m.title}, ${m.unit}</td><td>${n1(a.value)}<br><span class="muted small">${formatShort(a.date)}</span></td><td>${n1(b.value)}<br><span class="muted small">${formatShort(b.date)}</span></td><td class="${d < 0 ? 'good' : d > 0 ? 'over' : ''}">${d > 0 ? '+' : ''}${n1(d)}</td><td>${s.length}</td></tr>`;
  }
  html += `</table>`;

  if (o.charts) {
    for (const m of types) {
      const s = byType.get(m.type)!;
      if (s.length < 2) continue;
      html += `<div class="day"><h3>${m.title}</h3>${lineSvg(s, m.unit, m.type === 'weight' ? p.target_weight_kg : null)}</div>`;
    }
  }

  // Full table: dates as rows, measured types as columns, split into chunks of 7 columns.
  const dates = [...new Set(rows.map((r) => r.date))].sort();
  const value = new Map(rows.map((r) => [`${r.date}|${r.type}`, r.value]));
  for (let i = 0; i < types.length; i += 7) {
    const cols = types.slice(i, i + 7);
    html += `<h3>Все записи${types.length > 7 ? ` (${i / 7 + 1})` : ''}</h3><table><tr><th class="l">Дата</th>${cols.map((c) => `<th>${c.title}, ${c.unit}</th>`).join('')}</tr>`;
    for (const d of dates) {
      if (!cols.some((c) => value.has(`${d}|${c.type}`))) continue;
      html += `<tr><td>${formatShort(d)}</td>${cols.map((c) => `<td>${n1(value.get(`${d}|${c.type}`))}</td>`).join('')}</tr>`;
    }
    html += `</table>`;
  }
  return html;
}

export async function buildPdf(db: SQLiteDatabase, profile: Profile, o: PdfOptions): Promise<{ uri: string; pages: number }> {
  const parts: string[] = [];
  if (o.diary) parts.push(await diaryHtml(db, profile, o));
  if (o.measurements) parts.push(await measurementsHtml(db, profile, o));
  const title = o.diary && o.measurements ? 'Питание и замеры' : o.diary ? 'Дневник питания' : 'Замеры тела';
  const html = `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><style>${CSS}</style></head><body>
    <h1>${title}</h1>
    <div class="muted">${formatDay(o.from, true)} — ${formatDay(o.to, true)} · норма ${n0(profile.kcal_goal)} ккал · рост ${n0(profile.height_cm)} см</div>
    ${parts.join('')}
    <p class="muted small" style="margin-top:8mm">Сформировано в приложении «Калории» ${formatShort(todayKey())}.</p>
  </body></html>`;
  const res = await Print.printToFileAsync({ html, width: 595, height: 842 });
  // Give the file a readable name for the share sheet.
  const name = `${title.replace(/\s+/g, '_')}_${o.from}_${o.to}.pdf`;
  const target = new File(Paths.cache, name);
  if (target.exists) target.delete();
  await new File(res.uri).move(target);
  return { uri: target.uri, pages: res.numberOfPages };
}

export async function sharePdf(uri: string) {
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Отправить PDF' });
}

