import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { radius, space, useTheme } from './theme';

export function Screen({ children, padded = true, style }: { children: React.ReactNode; padded?: boolean; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={[padded && { padding: space.l, paddingBottom: 48 }, { gap: space.m }, style]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      contentInsetAdjustmentBehavior="automatic"
    >
      {children}
    </ScrollView>
  );
}

export function Card({ children, style, onPress }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const t = useTheme();
  const s = [{ backgroundColor: t.card, borderRadius: radius.l, padding: space.l, gap: space.s }, style];
  if (onPress)
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [...s, pressed && { opacity: 0.7 }]}>
        {children}
      </Pressable>
    );
  return <View style={s}>{children}</View>;
}

export function T({
  children,
  dim,
  size = 16,
  weight,
  color,
  style,
  numberOfLines,
  center,
}: {
  children: React.ReactNode;
  dim?: boolean;
  size?: number;
  weight?: TextStyle['fontWeight'];
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  center?: boolean;
}) {
  const t = useTheme();
  return (
    <Text
      numberOfLines={numberOfLines}
      maxFontSizeMultiplier={size >= 20 ? 1.3 : undefined}
      style={[{ color: color ?? (dim ? t.textDim : t.text), fontSize: size, fontWeight: weight }, center && { textAlign: 'center' }, style]}
    >
      {children}
    </Text>
  );
}

export function Title({ children }: { children: React.ReactNode }) {
  return (
    <T size={20} weight="700">
      {children}
    </T>
  );
}

export function Button({
  title,
  onPress,
  kind = 'primary',
  disabled,
  loading,
  style,
  small,
}: {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
}) {
  const t = useTheme();
  const bg = kind === 'primary' ? t.accent : kind === 'secondary' ? t.accentSoft : kind === 'danger' ? t.danger : 'transparent';
  const fg = kind === 'primary' || kind === 'danger' ? t.onAccent : t.accent;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderRadius: radius.m,
          paddingVertical: small ? 8 : 14,
          paddingHorizontal: small ? 12 : 18,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={{ color: fg, fontSize: small ? 14 : 16, fontWeight: '600' }}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, suffix, style, ...props }: TextInputProps & { label?: string; suffix?: string }) {
  const t = useTheme();
  return (
    <View style={[{ gap: 4 }, style as StyleProp<ViewStyle>]}>
      {label ? <T dim size={13}>{label}</T> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: t.input, borderRadius: radius.m, paddingHorizontal: space.m }}>
        <TextInput
          placeholderTextColor={t.textDim}
          {...props}
          style={{ flex: 1, color: t.text, fontSize: 17, paddingVertical: 12 }}
        />
        {suffix ? <T dim>{suffix}</T> : null}
      </View>
    </View>
  );
}

export function NumField(props: TextInputProps & { label?: string; suffix?: string }) {
  return <Field keyboardType="decimal-pad" selectTextOnFocus {...props} />;
}

export function Segmented<V extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: V; title: string }[];
  value: V;
  onChange: (v: V) => void;
}) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: t.input, borderRadius: radius.m, padding: 3 }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={{ flex: 1, paddingVertical: 8, borderRadius: radius.m - 3, backgroundColor: active ? t.card : 'transparent', alignItems: 'center' }}
          >
            <Text style={{ color: active ? t.text : t.textDim, fontWeight: active ? '600' : '400', fontSize: 14 }}>{o.title}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Choice({ title, hint, selected, onPress }: { title: string; hint?: string; selected: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        borderRadius: radius.m,
        borderWidth: 2,
        borderColor: selected ? t.accent : t.border,
        backgroundColor: selected ? t.accentSoft : t.card,
        padding: space.l,
        gap: 2,
      }}
    >
      <T weight="600">{title}</T>
      {hint ? <T dim size={13}>{hint}</T> : null}
    </Pressable>
  );
}

export function Row({ children, style, gap = space.s }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function ListItem({
  title,
  subtitle,
  right,
  onPress,
  onLongPress,
  left,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  left?: React.ReactNode;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: space.m, opacity: pressed && (onPress || onLongPress) ? 0.6 : 1 },
      ]}
    >
      {left}
      <View style={{ flex: 1, gap: 2 }}>
        <T numberOfLines={2}>{title}</T>
        {subtitle ? (
          <T dim size={13} numberOfLines={1}>
            {subtitle}
          </T>
        ) : null}
      </View>
      {right}
    </Pressable>
  );
}

export function Divider() {
  const t = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.border }} />;
}

export function Bar({ value, max, color, height = 6 }: { value: number; max: number; color: string; height?: number }) {
  const t = useTheme();
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const over = max > 0 && value > max * 1.02;
  return (
    <View style={{ height, backgroundColor: t.input, borderRadius: height, overflow: 'hidden' }}>
      <View style={{ width: `${pct * 100}%`, height, backgroundColor: over ? t.danger : color, borderRadius: height }} />
    </View>
  );
}

export function Ring({ value, max, size = 150, stroke = 12, children }: { value: number; max: number; size?: number; stroke?: number; children?: React.ReactNode }) {
  const t = useTheme();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const over = max > 0 && value > max;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={t.input} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={over ? t.danger : t.accent}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={c * (1 - pct)}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children}
    </View>
  );
}

export function Stepper({ onMinus, onPlus, children }: { onMinus: () => void; onPlus: () => void; children: React.ReactNode }) {
  const t = useTheme();
  const btn = (label: string, fn: () => void) => (
    <Pressable
      onPress={fn}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label === '+' ? 'Увеличить' : 'Уменьшить'}
      style={({ pressed }) => ({ width: 38, height: 38, borderRadius: 19, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
    >
      <Text style={{ color: t.accent, fontSize: 22, fontWeight: '600', marginTop: -2 }}>{label}</Text>
    </Pressable>
  );
  return (
    <Row gap={space.m}>
      {btn('−', onMinus)}
      <View style={{ minWidth: 70, alignItems: 'center' }}>{children}</View>
      {btn('+', onPlus)}
    </Row>
  );
}

export function Empty({ text }: { text: string }) {
  return (
    <View style={{ paddingVertical: 24, alignItems: 'center' }}>
      <T dim center>
        {text}
      </T>
    </View>
  );
}

const GLYPH_LABELS: Record<string, string> = {
  '‹': 'Назад',
  '›': 'Вперёд',
  '⋯': 'Действия',
  '✎': 'Изменить',
  '✕': 'Удалить',
  '↗': 'История и график',
  '★': 'Убрать из избранного',
  '☆': 'Добавить в избранное',
};

export function IconButton({ label, onPress, color, a11y }: { label: string; onPress: () => void; color?: string; a11y?: string }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={a11y ?? GLYPH_LABELS[label] ?? label}
      style={({ pressed }) => ({ paddingHorizontal: 6, minHeight: 44, justifyContent: 'center', opacity: pressed ? 0.5 : 1 })}
    >
      <Text style={{ color: color ?? t.accent, fontSize: 17, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

export function Plus({ onPress, a11y = 'Добавить' }: { onPress: () => void; a11y?: string }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={({ pressed }) => ({ width: 34, height: 34, borderRadius: 17, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
    >
      <Text style={{ color: t.onAccent, fontSize: 22, fontWeight: '600', marginTop: -2 }}>+</Text>
    </Pressable>
  );
}
