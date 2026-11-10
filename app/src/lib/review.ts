// Weekly review: plain rules over the diary, no network and no AI. It looks at the last 7 finished days
// (today is not finished, so it is left out) and says where the week went well and where it slipped.
import type { DayTotals } from '@/db/repo';
import { WEEKDAYS_SHORT, addDays, daysBetween, weekdayIndex } from './dates';
import { PROTEIN_OK_SHARE, inKcalBand, kcalBand } from './game';
import { fmt, kcalFloor, mealTitle, type Goal, type MealType, type Sex } from './nutrition';

export type Tone = 'good' | 'warn' | 'info';
export interface Finding { tone: Tone; title: string; text: string }

export interface ReviewInput {
  /** day totals inside the period (days without entries are simply missing) */
  days: DayTotals[];
  from: string;
  to: string;
  kcalGoal: number;
  proteinGoal: number;
  goal: Goal;
  sex: Sex;
  /** weight trend, kg per week; null when there are too few weigh-ins */
  weightPerWeek: number | null;
  /** kcal by meal over the period */
  meals: { meal_type: MealType; kcal: number }[];
  /** foods that gave the most kcal over the period */
  topFoods: { name: string; kcal: number; times: number }[];
}

export interface Review {
  from: string;
  to: string;
  logged: number;
  avgKcal: number;
  avgProtein: number;
  inBand: number;
  findings: Finding[];
}

export const reviewPeriod = (today: string) => ({ from: addDays(today, -7), to: addDays(today, -1) });

/** «ср 04.11» */
const dayName = (date: string) => `${WEEKDAYS_SHORT[weekdayIndex(date)].toLowerCase()} ${date.slice(8, 10)}.${date.slice(5, 7)}`;

/** «2 раза», «5 раз» */
const timesWord = (n: number) => {
  const a = n % 100;
  const b = n % 10;
  return `${n} ${b >= 2 && b <= 4 && !(a > 10 && a < 20) ? 'раза' : 'раз'}`;
};

export function buildReview(r: ReviewInput): Review {
  const total = daysBetween(r.from, r.to).length;
  const days = [...r.days].sort((a, b) => a.date.localeCompare(b.date));
  const n = days.length;
  const avg = (k: 'kcal' | 'protein') => (n ? days.reduce((s, d) => s + d[k], 0) / n : 0);
  const avgKcal = avg('kcal');
  const avgProtein = avg('protein');
  const inBand = days.filter((d) => inKcalBand(d.kcal, r.kcalGoal, r.goal)).length;
  const f: Finding[] = [];
  const base: Review = { from: r.from, to: r.to, logged: n, avgKcal, avgProtein, inBand, findings: f };

  if (n === 0) {
    f.push({ tone: 'info', title: 'Записей за неделю нет', text: 'Разбор появится, когда в дневнике будет хотя бы несколько дней. Начните с сегодняшнего.' });
    return base;
  }

  // 1. how complete the diary is
  if (n === total) f.push({ tone: 'good', title: 'Дневник заполнен полностью', text: `Записи есть за все ${total} дней — выводам ниже можно доверять.` });
  else if (n >= 5) f.push({ tone: 'info', title: `Записи за ${n} из ${total} дней`, text: 'Средние посчитаны по дням с записями. Пропущенные дни в расчёт не входят.' });
  else f.push({ tone: 'warn', title: `Записи только за ${n} из ${total} дней`, text: 'Данных мало, поэтому выводы приблизительные. Самое полезное сейчас — записывать каждый день, даже неидеальный.' });

  // 2. average calories against the goal
  const [lo, hi] = kcalBand(r.goal);
  const diff = avgKcal - r.kcalGoal;
  if (avgKcal > r.kcalGoal * hi)
    f.push({ tone: 'warn', title: `Калории выше нормы на ${fmt(diff)}`, text: `В среднем ${fmt(avgKcal)} ккал при норме ${fmt(r.kcalGoal)}. В норме были ${inBand} из ${n} дней.` });
  else if (avgKcal < r.kcalGoal * lo) {
    const floor = avgKcal < kcalFloor(r.sex);
    f.push({
      tone: 'warn',
      title: `Калории ниже нормы на ${fmt(-diff)}`,
      text: `В среднем ${fmt(avgKcal)} ккал при норме ${fmt(r.kcalGoal)}. ${floor ? `Это ниже безопасного минимума ${kcalFloor(r.sex)} ккал. ` : ''}Сильный недобор трудно держать долго, после него чаще случаются переборы. Проверьте, всё ли записано.`,
    });
  } else f.push({ tone: 'good', title: 'Калории в норме', text: `В среднем ${fmt(avgKcal)} ккал при норме ${fmt(r.kcalGoal)}. В норме были ${inBand} из ${n} дней.` });

  // 3. days far above the goal, and whether a very low day came right before
  const big = days.filter((d) => d.kcal > r.kcalGoal * 1.2);
  if (big.length) {
    const list = big.map((d) => `${dayName(d.date)} — ${fmt(d.kcal)} (+${fmt(d.kcal - r.kcalGoal)})`).join(', ');
    const afterLow = big.some((d) => {
      const prev = days.find((x) => x.date === addDays(d.date, -1));
      return prev != null && prev.kcal < r.kcalGoal * 0.8;
    });
    f.push({
      tone: 'warn',
      title: big.length === 1 ? 'Один день с большим перебором' : `Дней с большим перебором: ${big.length}`,
      text: `${list}.${afterLow ? ' Накануне был день с сильным недобором — такая пара встречается часто. Ровная норма каждый день обычно работает лучше, чем «отработать» перебор голодом.' : ''}`,
    });
  }

  // 4. swings
  if (n >= 4) {
    const min = days.reduce((a, d) => (d.kcal < a.kcal ? d : a));
    const max = days.reduce((a, d) => (d.kcal > a.kcal ? d : a));
    if (max.kcal - min.kcal > r.kcalGoal * 0.5)
      f.push({ tone: 'info', title: 'Калории сильно скачут', text: `От ${fmt(min.kcal)} (${dayName(min.date)}) до ${fmt(max.kcal)} (${dayName(max.date)}). Чем ровнее дни, тем легче держать норму.` });
  }

  // 5. weekend against weekdays
  const we = days.filter((d) => weekdayIndex(d.date) >= 5);
  const wd = days.filter((d) => weekdayIndex(d.date) < 5);
  if (we.length && wd.length >= 2) {
    const a = we.reduce((s, d) => s + d.kcal, 0) / we.length;
    const b = wd.reduce((s, d) => s + d.kcal, 0) / wd.length;
    if (a > b * 1.15) f.push({ tone: 'info', title: 'В выходные больше', text: `В выходные в среднем ${fmt(a)} ккал, в будни ${fmt(b)}. Разница ${fmt(a - b)} ккал в день.` });
  }

  // 6. protein
  if (r.proteinGoal > 0) {
    const ok = days.filter((d) => d.protein >= r.proteinGoal * PROTEIN_OK_SHARE).length;
    if (avgProtein >= r.proteinGoal * PROTEIN_OK_SHARE)
      f.push({ tone: 'good', title: 'Белок в порядке', text: `В среднем ${fmt(avgProtein)} г при цели ${fmt(r.proteinGoal)} г. Норму набирали ${ok} из ${n} дней.` });
    else {
      const gap = r.proteinGoal - avgProtein;
      f.push({
        tone: 'warn',
        title: `Белка не хватает: в среднем ${fmt(gap)} г в день`,
        text: `${fmt(avgProtein)} г при цели ${fmt(r.proteinGoal)} г, норму набирали ${ok} из ${n} дней. ${fmt(gap)} г белка — это примерно ${fmt((gap / 18) * 100, 0)} г творога или ${fmt((gap / 30) * 100, 0)} г запечённой куриной грудки.`,
      });
    }
  }

  // 7. where the calories come from
  const mealSum = r.meals.reduce((s, m) => s + m.kcal, 0);
  const topMeal = [...r.meals].sort((a, b) => b.kcal - a.kcal)[0];
  if (topMeal && mealSum > 0 && topMeal.kcal / mealSum >= 0.4)
    f.push({ tone: 'info', title: `Больше всего калорий — ${mealTitle(topMeal.meal_type).toLowerCase()}`, text: `На этот приём пищи пришлось ${fmt((topMeal.kcal / mealSum) * 100)}% калорий недели.` });
  if (r.topFoods.length)
    f.push({
      tone: 'info',
      title: 'Что дало больше всего калорий',
      text: r.topFoods.map((x) => `${x.name} — ${fmt(x.kcal)} ккал${x.times > 1 ? ` (${timesWord(x.times)})` : ''}`).join('\n'),
    });

  // 8. weight against the plan — only when the diary is reliable enough to compare
  if (r.weightPerWeek != null && n >= 5) {
    const w = r.weightPerWeek;
    const kcalOk = avgKcal <= r.kcalGoal * hi;
    if (r.goal === 'lose' && w > -0.1 && kcalOk)
      f.push({ tone: 'warn', title: 'Вес не снижается при соблюдении нормы', text: 'По дневнику калории в норме, а тренд веса стоит. Чаще всего дело в неучтённой еде (масло, соусы, напитки, «кусочки»). Если всё записано точно, норму стоит пересчитать на вкладке «Прогресс».' });
    else if (r.goal === 'lose' && w <= -0.1) f.push({ tone: 'good', title: 'Вес снижается', text: 'Тренд веса идёт вниз — план работает.' });
    else if (r.goal === 'gain' && w < 0.05 && avgKcal >= r.kcalGoal * lo)
      f.push({ tone: 'warn', title: 'Вес не растёт', text: 'Калории по дневнику в норме, а тренд веса стоит. Попробуйте прибавить 100–150 ккал в день.' });
    else if (r.goal === 'gain' && w >= 0.05) f.push({ tone: 'good', title: 'Вес растёт', text: 'Тренд веса идёт вверх — план работает.' });
    else if (r.goal === 'maintain' && Math.abs(w) <= 0.15) f.push({ tone: 'good', title: 'Вес держится', text: 'Тренд веса почти не меняется.' });
  }

  return base;
}
