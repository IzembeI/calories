import { Pressable, Text, View } from 'react-native';
import { explainGoal, fmt, goalWarnings, paceAsPctBW, type BodyInput } from '@/lib/nutrition';
import { Card, Divider, Row, T } from './components';
import { radius, useTheme } from './theme';

/** «Как считается норма»: BMR × activity ± pace, the floor, and neutral warnings. */
export function GoalExplainCard({ body, note }: { body: BodyInput; note?: string }) {
  const t = useTheme();
  const e = explainGoal(body);
  const warnings = goalWarnings(body, e);
  const sexPart = body.sex === 'male' ? '+ 5' : '− 161';
  const pace = `${fmt(body.pace_kg_week, 2)} кг/нед`;
  return (
    <Card>
      <T weight="700">Как считается норма</T>
      <Line
        label="Базовый обмен (Миффлин — Сан Жеор)"
        detail={`10×${fmt(body.weight_kg, 1)} + 6,25×${fmt(body.height_cm, 1)} − 5×${e.age} ${sexPart}`}
        value={fmt(Math.round(e.bmr))}
      />
      <Line label={`× ${fmt(e.factor, 3)}`} detail={`${e.activityTitle.toLowerCase()} активность`} value={fmt(Math.round(e.tdee))} />
      {body.goal === 'maintain' ? (
        <Line label="± 0" detail="держим вес, без дефицита" value="" />
      ) : (
        <Line
          label={`${e.delta < 0 ? '−' : '+'} ${fmt(Math.round(Math.abs(e.delta)))}`}
          detail={`${e.delta < 0 ? 'дефицит' : 'профицит'} на ${pace}`}
          value={fmt(Math.round(e.tdee + e.delta))}
        />
      )}
      {body.goal === 'lose' ? (
        <T dim size={12}>
          Нижний порог {fmt(e.floor)} ккал{e.floorApplied ? ' — применён' : ''}: ниже — только под наблюдением врача.
        </T>
      ) : null}
      <Divider />
      <Row style={{ justifyContent: 'space-between' }}>
        <T weight="700">Итог</T>
        <T weight="700">{fmt(e.kcal)} ккал</T>
      </Row>
      {note ? (
        <T dim size={12}>
          {note}
        </T>
      ) : null}
      {warnings.map((w) => (
        <T key={w} size={13} color={t.warn}>
          {w}
        </T>
      ))}
    </Card>
  );
}

export const PACES = [0.25, 0.5, 0.75, 1];

/** Pace chips «0,5 кг · 0,6%»: kg a week with the percent of body weight next to it. */
export function PaceChips({ value, weight, onChange }: { value: number; weight: number; onChange: (v: number) => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: t.input, borderRadius: radius.m, padding: 3 }}>
      {PACES.map((p) => {
        const active = Math.abs(p - value) < 0.001;
        const pct = paceAsPctBW(p, weight);
        return (
          <Pressable
            key={p}
            onPress={() => onChange(p)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={{ flex: 1, paddingVertical: 6, borderRadius: radius.m - 3, backgroundColor: active ? t.card : 'transparent', alignItems: 'center' }}
          >
            <Text style={{ color: active ? t.text : t.textDim, fontWeight: active ? '600' : '400', fontSize: 14 }}>{fmt(p, 2)} кг</Text>
            <Text style={{ color: pct > 1 ? t.warn : t.textDim, fontSize: 12 }}>{fmt(pct, 1)}%</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Line({ label, detail, value }: { label: string; detail: string; value: string }) {
  return (
    <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <View style={{ flex: 1 }}>
        <T size={14}>{label}</T>
        <T dim size={12}>
          {detail}
        </T>
      </View>
      {value ? <T size={14}>= {value}</T> : null}
    </Row>
  );
}
