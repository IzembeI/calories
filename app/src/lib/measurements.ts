export type MeasurementType =
  | 'weight' | 'body_fat' | 'neck' | 'shoulders' | 'chest' | 'under_chest'
  | 'biceps_l' | 'biceps_r' | 'forearm_l' | 'forearm_r' | 'waist' | 'belly' | 'hips'
  | 'thigh_l' | 'thigh_r' | 'calf_l' | 'calf_r' | 'wrist';

export interface MeasurementDef {
  type: MeasurementType;
  title: string;
  unit: 'кг' | '%' | 'см';
  step: number;
}

export const MEASUREMENTS: MeasurementDef[] = [
  { type: 'weight', title: 'Вес', unit: 'кг', step: 0.1 },
  { type: 'body_fat', title: 'Процент жира', unit: '%', step: 0.1 },
  { type: 'neck', title: 'Шея', unit: 'см', step: 0.5 },
  { type: 'shoulders', title: 'Плечи', unit: 'см', step: 0.5 },
  { type: 'chest', title: 'Грудь', unit: 'см', step: 0.5 },
  { type: 'under_chest', title: 'Под грудью', unit: 'см', step: 0.5 },
  { type: 'biceps_l', title: 'Бицепс левый', unit: 'см', step: 0.5 },
  { type: 'biceps_r', title: 'Бицепс правый', unit: 'см', step: 0.5 },
  { type: 'forearm_l', title: 'Предплечье левое', unit: 'см', step: 0.5 },
  { type: 'forearm_r', title: 'Предплечье правое', unit: 'см', step: 0.5 },
  { type: 'waist', title: 'Талия', unit: 'см', step: 0.5 },
  { type: 'belly', title: 'Живот', unit: 'см', step: 0.5 },
  { type: 'hips', title: 'Ягодицы (бёдра)', unit: 'см', step: 0.5 },
  { type: 'thigh_l', title: 'Бедро левое', unit: 'см', step: 0.5 },
  { type: 'thigh_r', title: 'Бедро правое', unit: 'см', step: 0.5 },
  { type: 'calf_l', title: 'Икра левая', unit: 'см', step: 0.5 },
  { type: 'calf_r', title: 'Икра правая', unit: 'см', step: 0.5 },
  { type: 'wrist', title: 'Запястье', unit: 'см', step: 0.5 },
];

export const measurementDef = (t: string): MeasurementDef =>
  MEASUREMENTS.find((m) => m.type === t) ?? { type: t as MeasurementType, title: t, unit: 'см', step: 0.5 };
