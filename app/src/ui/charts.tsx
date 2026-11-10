import React, { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { diffDays, fromKey } from '@/lib/dates';
import { fmt } from '@/lib/nutrition';
import { useTheme } from './theme';
import { T } from './components';

export interface Point { date: string; value: number }

const H = 180;
const PAD = { l: 36, r: 10, t: 12, b: 22 };

function niceRange(min: number, max: number) {
  if (min === max) return { lo: min - 1, hi: max + 1 };
  const span = max - min;
  return { lo: min - span * 0.1, hi: max + span * 0.1 };
}

const label = (key: string) => {
  const d = fromKey(key);
  return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/** With `trend`, raw `points` are drawn as small dots and the trend as the solid line. */
/** `forecast` continues the line to the right as a dashed projection; its first point is where the line ends. */
export function LineChart({ points, unit, target, trend, forecast }: { points: Point[]; unit?: string; target?: number | null; trend?: Point[]; forecast?: Point[] }) {
  const t = useTheme();
  const [w, setW] = useState(0);
  if (points.length === 0) return <T dim>Нет данных за период</T>;
  const values = points
    .map((p) => p.value)
    .concat(trend ? trend.map((p) => p.value) : [])
    .concat(forecast ? forecast.map((p) => p.value) : [])
    .concat(target != null ? [target] : []);
  const { lo, hi } = niceRange(Math.min(...values), Math.max(...values));
  const first = points[0].date;
  const lastDate = forecast?.length ? forecast[forecast.length - 1].date : points[points.length - 1].date;
  const span = Math.max(diffDays(first, lastDate), 1);
  const iw = Math.max(w - PAD.l - PAD.r, 1);
  const ih = H - PAD.t - PAD.b;
  const x = (d: string) => PAD.l + (points.length === 1 && !forecast?.length ? iw / 2 : (diffDays(first, d) / span) * iw);
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * ih;
  const line = trend ?? points;
  const path = line.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const ticks = [lo + (hi - lo) * 0.1, (lo + hi) / 2, hi - (hi - lo) * 0.1];
  const dashed = forecast?.length ? forecast.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ') : null;
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: H }}>
      {w > 0 && (
        <Svg width={w} height={H}>
          {ticks.map((v) => (
            <React.Fragment key={v}>
              <Line x1={PAD.l} x2={w - PAD.r} y1={y(v)} y2={y(v)} stroke={t.border} strokeWidth={1} />
              <SvgText x={PAD.l - 4} y={y(v) + 4} fontSize={10} fill={t.textDim} textAnchor="end">
                {fmt(v, 1)}
              </SvgText>
            </React.Fragment>
          ))}
          {target != null && (
            <Line x1={PAD.l} x2={w - PAD.r} y1={y(target)} y2={y(target)} stroke={t.accent} strokeDasharray="4 4" strokeWidth={1} />
          )}
          {trend
            ? points.map((p) => <Circle key={p.date} cx={x(p.date)} cy={y(p.value)} r={2.5} fill={t.textDim} />)
            : null}
          {line.length > 0 && <Path d={path} stroke={t.accent} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />}
          {dashed && <Path d={dashed} stroke={t.accent} strokeWidth={2} strokeDasharray="2 6" fill="none" strokeLinecap="round" opacity={0.8} />}
          {!trend &&
            points.length <= 40 &&
            points.map((p) => <Circle key={p.date} cx={x(p.date)} cy={y(p.value)} r={3} fill={t.accent} />)}
          <SvgText x={PAD.l} y={H - 6} fontSize={10} fill={t.textDim}>
            {label(first)}
          </SvgText>
          <SvgText x={w - PAD.r} y={H - 6} fontSize={10} fill={t.textDim} textAnchor="end">
            {label(lastDate)}
          </SvgText>
        </Svg>
      )}
    </View>
  );
}

export function BarChart({ points, goal }: { points: Point[]; goal?: number }) {
  const t = useTheme();
  const [w, setW] = useState(0);
  if (points.length === 0) return <T dim>Нет данных за период</T>;
  const max = Math.max(...points.map((p) => p.value), goal ?? 0) * 1.1 || 1;
  const iw = Math.max(w - PAD.l - PAD.r, 1);
  const ih = H - PAD.t - PAD.b;
  const bw = iw / points.length;
  const y = (v: number) => PAD.t + (1 - v / max) * ih;
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: H }}>
      {w > 0 && (
        <Svg width={w} height={H}>
          {[max * 0.5, max * 0.9].map((v) => (
            <React.Fragment key={v}>
              <Line x1={PAD.l} x2={w - PAD.r} y1={y(v)} y2={y(v)} stroke={t.border} />
              <SvgText x={PAD.l - 4} y={y(v) + 4} fontSize={10} fill={t.textDim} textAnchor="end">
                {fmt(v)}
              </SvgText>
            </React.Fragment>
          ))}
          {points.map((p, i) => {
            const over = goal != null && p.value > goal * 1.05;
            const h = Math.max((p.value / max) * ih, p.value > 0 ? 2 : 0);
            return (
              <Rect
                key={p.date}
                x={PAD.l + i * bw + bw * 0.15}
                y={PAD.t + ih - h}
                width={Math.max(bw * 0.7, 1)}
                height={h}
                rx={Math.min(3, bw * 0.3)}
                fill={over ? t.warn : t.accent}
              />
            );
          })}
          {goal != null && <Line x1={PAD.l} x2={w - PAD.r} y1={y(goal)} y2={y(goal)} stroke={t.text} strokeDasharray="4 4" strokeOpacity={0.5} />}
          <SvgText x={PAD.l} y={H - 6} fontSize={10} fill={t.textDim}>
            {label(points[0].date)}
          </SvgText>
          <SvgText x={w - PAD.r} y={H - 6} fontSize={10} fill={t.textDim} textAnchor="end">
            {label(points[points.length - 1].date)}
          </SvgText>
        </Svg>
      )}
    </View>
  );
}
