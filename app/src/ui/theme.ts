import { useColorScheme } from 'react-native';

// Values mirror replica/design/tokens.{light,dark}.json — every text pair passes WCAG AA
// (check: python contrast.py replica/design/tokens.light.json).
const light = {
  bg: '#F4F5F2',
  card: '#FFFFFF',
  text: '#16181A',
  textDim: '#5F646A',
  border: '#E3E5E1',
  accent: '#1B744B',
  accentSoft: '#E6F4EC',
  onAccent: '#FFFFFF',
  danger: '#C2392D',
  warn: '#B87512',
  protein: '#3F6FD6',
  fat: '#B06F12',
  carbs: '#8A4CC7',
  water: '#2687B8',
  input: '#F0F1EE',
};

const dark: typeof light = {
  bg: '#0F1112',
  card: '#1A1D1F',
  text: '#F1F3F2',
  textDim: '#9AA0A6',
  border: '#2A2E31',
  accent: '#45C08A',
  accentSoft: '#1E3A2D',
  onAccent: '#0B1F15',
  danger: '#F06A5D',
  warn: '#F0B04A',
  protein: '#7099F0',
  fat: '#F0B755',
  carbs: '#B587E6',
  water: '#5BBBE8',
  input: '#24282B',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

export const radius = { s: 8, m: 14, l: 20 };
export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24 };
