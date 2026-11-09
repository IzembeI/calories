import { View } from 'react-native';
import { NAVY_ERROR_PCT, measureHint } from '@/lib/body';
import type { Sex } from '@/lib/nutrition';
import { Button, T } from './components';

/** One-time check that the user measures where the Navy formula expects; the estimate is hidden until then. */
export function BodyFatMethod({ sex, onConfirm }: { sex: Sex; onConfirm: () => void }) {
  const sites: [string, string][] = [
    ['Талия', measureHint('waist', sex)!],
    ['Шея', measureHint('neck', sex)!],
    ...(sex === 'female' ? ([['Ягодицы', measureHint('hips', sex)!]] as [string, string][]) : []),
  ];
  return (
    <View style={{ gap: 6 }}>
      <T dim size={14}>
        Процент жира считается по формуле ВМС США (точность около ±{NAVY_ERROR_PCT}%), но только если мерить в этих местах:
      </T>
      {sites.map(([name, hint]) => (
        <T key={name} size={14}>
          • {name} — {hint}
        </T>
      ))}
      <T dim size={13}>
        Лента прилегает к коже, но не сдавливает. Замеры в других местах сдвигают оценку на несколько процентов.
      </T>
      <Button title="Я мерю так — показать оценку" kind="secondary" small onPress={onConfirm} />
    </View>
  );
}
