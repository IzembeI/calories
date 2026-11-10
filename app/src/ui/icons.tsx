// Vector pictures: food tiles (drawn from art-data.ts) and line icons for buttons and tabs.
// Everything is bundled and works offline; nothing is downloaded at runtime.
import React from 'react';
import { View, useColorScheme, type ColorValue } from 'react-native';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';
import { ART, type ArtKey, type Shape } from './art-data';
import { plantShapes } from './plant-data';
import { useTheme } from './theme';

export { artFor, MEAL_ART } from '@/lib/food-art';

function shapeEl(s: Shape, i: number) {
  const p = {
    fill: s.f ?? 'none',
    stroke: s.s && s.w !== 0 ? s.s : undefined,
    strokeWidth: s.s ? (s.w ?? 2) : undefined,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    opacity: s.o,
    transform: s.rot ? `rotate(${s.rot[0]} ${s.rot[1]} ${s.rot[2]})` : undefined,
  };
  if (s.d) return <Path key={i} d={s.d} {...p} />;
  if (s.c) return <Circle key={i} cx={s.c[0]} cy={s.c[1]} r={s.c[2]} {...p} />;
  if (s.e) return <Ellipse key={i} cx={s.e[0]} cy={s.e[1]} rx={s.e[2]} ry={s.e[3]} {...p} />;
  if (s.r) return <Rect key={i} x={s.r[0]} y={s.r[1]} width={s.r[2]} height={s.r[3]} rx={s.r[4]} {...p} />;
  return null;
}

/** A rounded tile with a food picture. Decorative: hidden from VoiceOver (the row title says what it is). */
export const FoodPic = React.memo(function FoodPic({ art, size = 40 }: { art: ArtKey; size?: number }) {
  const dark = useColorScheme() === 'dark';
  const a = ART[art];
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 64 64">
        <Rect width={64} height={64} rx={16} fill={a.hue} opacity={dark ? 0.24 : 0.16} />
        <G transform="translate(8 8)">{a.shapes.map(shapeEl)}</G>
      </Svg>
    </View>
  );
});

/** The character: a plant in a pot, more grown at each stage; it dozes when there is no live streak. */
export const Plant = React.memo(function Plant({ stage, awake = true, size = 120 }: { stage: number; awake?: boolean; size?: number }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: size, height: (size * 140) / 120 }}>
      <Svg width={size} height={(size * 140) / 120} viewBox="0 0 120 140">
        {plantShapes(stage, awake).map(shapeEl)}
      </Svg>
    </View>
  );
});

// ——— line icons (24×24, stroke) ———
const ICONS = {
  diary: ['M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z', 'M9 9h6M9 13h6'],
  progress: ['M4 20h16', 'M5 15l4-5 4 3 6-7', 'M15 6h4v4'],
  profile: ['M12 12a4 4 0 1 0 0-8a4 4 0 0 0 0 8z', 'M4 20c1-4 4.500-6 8-6s7 2 8 6'],
  chevLeft: ['M15 5l-7 7 7 7'],
  chevRight: ['M9 5l7 7-7 7'],
  edit: ['M4 20l1-5L16 4l4 4L9 19z', 'M14 6l4 4'],
  close: ['M6 6l12 12M18 6L6 18'],
  star: ['M12 3l2.700 5.700 6.300.800-4.600 4.300 1.200 6.200L12 17l-5.600 3 1.200-6.200L3 9.500l6.300-.800z'],
  dots: ['M5 12h.010M12 12h.010M19 12h.010'],
  chart: ['M4 4v16h16', 'M8 15l3-4 3 2 5-6'],
  scan: ['M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3', 'M8 8v8M12 8v8M16 8v8'],
  target: ['M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18z', 'M12 16.500a4.500 4.500 0 1 0 0-9a4.500 4.500 0 0 0 0 9z', 'M12 12h.010'],
  ruler: ['M3 16L16 3l5 5L8 21z', 'M7 12l2 2M10 9l2 2M13 6l2 2'],
  doc: ['M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z', 'M14 3v5h5', 'M12 11v6M9.500 14.500L12 17l2.500-2.500'],
  bookmark: ['M7 3h10a1 1 0 0 1 1 1v17l-6-4-6 4V4a1 1 0 0 1 1-1z'],
  check: ['M5 12.500l4.500 4.500L19 7'],
  sliders: ['M4 7h9M19 7h1M4 17h1M11 17h9', 'M16 9.500a2.500 2.500 0 1 0 0-5a2.500 2.500 0 0 0 0 5z', 'M8 19.500a2.500 2.500 0 1 0 0-5a2.500 2.500 0 0 0 0 5z'],
} satisfies Record<string, string[]>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 22, color, filled }: { name: IconName; size?: number; color?: ColorValue; filled?: boolean }) {
  const t = useTheme();
  const c = color ?? t.accent;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {ICONS[name].map((d, i) => (
        <Path key={i} d={d} stroke={c} strokeWidth={name === 'dots' ? 3 : 2} strokeLinecap="round" strokeLinejoin="round" fill={filled ? c : 'none'} />
      ))}
    </Svg>
  );
}
