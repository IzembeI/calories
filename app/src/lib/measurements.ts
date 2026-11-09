export type MeasurementType = 'weight' | 'neck' | 'chest' | 'biceps' | 'waist' | 'hips' | 'thigh';

export interface MeasurementDef {
  type: MeasurementType;
  title: string;
  unit: 'кг' | 'см';
  step: number;
}

// Exactly the set the user asked for. Older types stay in the database but are not shown.
export const MEASUREMENTS: MeasurementDef[] = [
  { type: 'weight', title: 'Вес', unit: 'кг', step: 0.1 },
  { type: 'neck', title: 'Шея', unit: 'см', step: 0.5 },
  { type: 'chest', title: 'Грудь', unit: 'см', step: 0.5 },
  { type: 'biceps', title: 'Бицепс', unit: 'см', step: 0.5 },
  { type: 'waist', title: 'Талия', unit: 'см', step: 0.5 },
  { type: 'hips', title: 'Ягодицы', unit: 'см', step: 0.5 },
  { type: 'thigh', title: 'Бедро', unit: 'см', step: 0.5 },
];

export const measurementDef = (t: string): MeasurementDef =>
  MEASUREMENTS.find((m) => m.type === t) ?? { type: t as MeasurementType, title: t, unit: 'см', step: 0.5 };
