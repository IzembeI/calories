// «Сухая или варёная?» — the same food weighed raw and ready differs 2–3 times in calories.
// Pairs of built-in foods by name; the food screen offers a one-tap switch to the other state.

type State = 'сухой продукт' | 'готовый продукт' | 'сырой продукт';

const PAIRS: [dry: string, ready: string, raw?: boolean][] = [
  ['Гречка сухая', 'Гречка варёная'],
  ['Рис белый сухой', 'Рис белый варёный'],
  ['Рис бурый сухой', 'Рис бурый варёный'],
  ['Овсяные хлопья сухие', 'Овсянка на воде'],
  ['Макароны сухие', 'Макароны варёные'],
  ['Булгур сухой', 'Булгур варёный'],
  ['Пшено сухое', 'Пшённая каша на воде'],
  ['Перловка сухая', 'Перловка варёная'],
  ['Киноа сухая', 'Киноа варёная'],
  ['Чечевица сухая', 'Чечевица варёная'],
  ['Фасоль сухая', 'Фасоль варёная'],
  ['Нут сухой', 'Нут варёный'],
  ['Кускус сухой', 'Кускус варёный'],
  ['Картофель сырой', 'Картофель варёный', true],
  ['Куриная грудка сырая', 'Куриная грудка запечённая', true],
  ['Куриное бедро сырое без кожи', 'Куриное бедро запечённое без кожи', true],
  ['Индейка филе сырое', 'Индейка филе тушёное', true],
  ['Говядина сырая', 'Говядина тушёная', true],
  ['Свинина сырая', 'Свинина запечённая', true],
  ['Лосось сырой', 'Лосось запечённый', true],
  ['Треска сырая', 'Треска запечённая', true],
  ['Минтай сырой', 'Минтай отварной', true],
];

export interface FoodPair {
  /** what this food is */
  state: State;
  /** name of the built-in food in the other state */
  other: string;
  otherState: State;
}

const BY_NAME = new Map<string, FoodPair>();
for (const [dry, ready, raw] of PAIRS) {
  const a: State = raw ? 'сырой продукт' : 'сухой продукт';
  BY_NAME.set(dry, { state: a, other: ready, otherState: 'готовый продукт' });
  BY_NAME.set(ready, { state: 'готовый продукт', other: dry, otherState: a });
}

export const pairOf = (name: string): FoodPair | undefined => BY_NAME.get(name);
