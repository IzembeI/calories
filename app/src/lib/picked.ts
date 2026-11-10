// A one-shot hand-over between screens: the scanner opened «to pick a food» puts the result here,
// the screen that asked (the dish editor) takes it when it gets focus again.
import type { FoodRow } from '@/db/repo';

let picked: FoodRow | null = null;
export const setPickedFood = (f: FoodRow) => {
  picked = f;
};
export function takePickedFood(): FoodRow | null {
  const f = picked;
  picked = null;
  return f;
}
