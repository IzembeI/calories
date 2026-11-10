// Loads what lib/game.ts needs from the database and computes the game state for today.
import type { SQLiteDatabase } from 'expo-sqlite';
import { currentWeight, gameData, type Profile } from '@/db/repo';
import { computeGame, type Game } from './game';
import { macroTargets } from './nutrition';
import { goalForDate } from './schedule';

export async function loadGame(db: SQLiteDatabase, profile: Profile, today: string): Promise<Game> {
  const [data, w] = await Promise.all([gameData(db, today), currentWeight(db, profile, today)]);
  return computeGame({ ...data, kcalGoal: profile.kcal_goal, goalFor: (d) => goalForDate(profile, d), proteinGoal: macroTargets(profile, w).protein, goal: profile.goal, today });
}
