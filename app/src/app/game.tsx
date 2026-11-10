import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useProfile } from '@/lib/app-state';
import { todayKey } from '@/lib/dates';
import { STAGES, XP, daysWord, kcalBand, nextStageLevel, type Game } from '@/lib/game';
import { loadGame } from '@/lib/game-load';
import { fmt } from '@/lib/nutrition';
import { Bar, Button, Card, Divider, Row, Screen, T } from '@/ui/components';
import { Icon, Plant } from '@/ui/icons';
import { radius, space, useTheme } from '@/ui/theme';

export default function GameScreen() {
  const db = useSQLiteContext();
  const t = useTheme();
  const profile = useProfile();
  const [g, setG] = useState<Game | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadGame(db, profile, todayKey()).then(setG);
    }, [db, profile]),
  );

  if (!g) return null;
  const [lo, hi] = kcalBand(profile.goal);
  const next = nextStageLevel(g.stage);
  const done = g.achievements.filter((a) => a.done).length;

  return (
    <Screen>
      <Card style={{ alignItems: 'center', backgroundColor: t.accentSoft }}>
        <Plant stage={g.stage} awake={g.streak > 0} size={170} />
        <T size={22} weight="800">
          Уровень {g.level} · {g.stageTitle}
        </T>
        <View style={{ alignSelf: 'stretch', gap: 4 }}>
          <Bar value={g.xp - g.levelFrom} max={g.levelTo - g.levelFrom} color={t.accent} height={10} />
          <Row style={{ justifyContent: 'space-between' }}>
            <T dim size={13}>
              {fmt(g.xp)} очков
            </T>
            <T dim size={13}>
              до уровня {g.level + 1}: {fmt(g.levelTo - g.xp)}
            </T>
          </Row>
        </View>
        <T dim size={13} center>
          {next ? `На уровне ${next} вырастет «${STAGES[g.stage + 1].toLowerCase()}».` : 'Растение выросло полностью. Очки и уровни продолжают копиться.'}
          {g.streak === 0 ? ' Сейчас оно дремлет: запишите еду, и оно проснётся.' : ''}
        </T>
      </Card>

      <Row gap={space.m}>
        <StatCard value={daysWord(g.streak)} label="серия сейчас" />
        <StatCard value={daysWord(g.bestStreak)} label="лучшая серия" />
        <StatCard value={String(g.loggedDays)} label="дней с записями" />
      </Row>

      <Card>
        <T weight="700">Сегодня</T>
        <Task done={g.today.logged} title="Записать еду" xp={XP.logged} />
        <Divider />
        <Task
          done={g.today.kcal}
          title="Уложиться в норму калорий"
          hint={`от ${fmt(profile.kcal_goal * lo)} до ${fmt(profile.kcal_goal * hi)} ккал`}
          xp={XP.kcal}
        />
        <Divider />
        <Task done={g.today.protein} title="Набрать норму белка" xp={XP.protein} />
        <Divider />
        <Task done={g.today.measuredThisWeek} title="Замеры на этой неделе" hint="вес или объёмы, раз в неделю" xp={XP.measureWeek} />
        <T dim size={12}>
          Очки только копятся: пропущенный день ничего не отнимает.
        </T>
      </Card>

      <Button title="Разбор недели" kind="secondary" onPress={() => router.push('/review')} />

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <T weight="700">Достижения</T>
          <T dim size={13}>
            {done} из {g.achievements.length}
          </T>
        </Row>
        {g.achievements.map((a, i) => (
          <View key={a.id}>
            {i > 0 && <Divider />}
            <Row gap={space.m} style={{ paddingVertical: 8 }}>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: a.done ? t.accent : t.input,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name={a.done ? 'check' : 'star'} size={18} color={a.done ? t.onAccent : t.textDim} />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <T weight="600">{a.title}</T>
                <T dim size={13}>
                  {a.hint}
                </T>
                {!a.done && a.target > 1 ? <Bar value={a.value} max={a.target} color={t.accent} height={4} /> : null}
              </View>
              {!a.done && a.target > 1 ? (
                <T dim size={13}>
                  {a.value}/{a.target}
                </T>
              ) : null}
            </Row>
          </View>
        ))}
      </Card>
    </Screen>
  );
}

function StatCard({ value, label }: { value: string; label: string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.card, borderRadius: radius.l, padding: space.m, alignItems: 'center', gap: 2 }}>
      <T size={17} weight="800" center>
        {value}
      </T>
      <T dim size={12} center>
        {label}
      </T>
    </View>
  );
}

function Task({ done, title, hint, xp }: { done: boolean; title: string; hint?: string; xp: number }) {
  const t = useTheme();
  return (
    <Row gap={space.m} style={{ paddingVertical: 6 }} >
      <View
        accessibilityLabel={done ? 'Выполнено' : 'Не выполнено'}
        style={{
          width: 26,
          height: 26,
          borderRadius: 13,
          borderWidth: done ? 0 : 2,
          borderColor: t.border,
          backgroundColor: done ? t.accent : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {done ? <Icon name="check" size={16} color={t.onAccent} /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <T>{title}</T>
        {hint ? (
          <T dim size={12}>
            {hint}
          </T>
        ) : null}
      </View>
      <T size={13} weight="600" color={done ? t.accent : t.textDim}>
        +{xp}
      </T>
    </Row>
  );
}
