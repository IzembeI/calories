import { useEffect, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { datesWithEntries } from '@/db/repo';
import { WEEKDAYS_SHORT, addDays, fromKey, monthName, toKey, todayKey, weekStart } from '@/lib/dates';
import { Button, IconButton, Row, T } from './components';
import { radius, space, useTheme } from './theme';

export function CalendarModal({ visible, value, onClose, onPick }: { visible: boolean; value: string; onClose: () => void; onPick: (d: string) => void }) {
  const t = useTheme();
  const db = useSQLiteContext();
  const [month, setMonth] = useState(() => value.slice(0, 7));
  const [marked, setMarked] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (visible) setMonth(value.slice(0, 7));
  }, [visible, value]);

  const first = `${month}-01`;
  const d0 = fromKey(first);
  const nextMonth = toKey(new Date(d0.getFullYear(), d0.getMonth() + 1, 1));
  const prevMonth = toKey(new Date(d0.getFullYear(), d0.getMonth() - 1, 1));
  const gridStart = weekStart(first);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  useEffect(() => {
    if (visible) datesWithEntries(db, days[0], days[41]).then(setMarked);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, month, db]);

  const today = todayKey();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: space.l }} onPress={onClose}>
        <Pressable style={{ backgroundColor: t.card, borderRadius: radius.l, padding: space.l, gap: space.m }} onPress={() => {}}>
          <Row style={{ justifyContent: 'space-between' }}>
            <IconButton label="‹" onPress={() => setMonth(prevMonth.slice(0, 7))} />
            <T weight="700" size={17}>
              {monthName(d0.getMonth())} {d0.getFullYear()}
            </T>
            <IconButton label="›" onPress={() => setMonth(nextMonth.slice(0, 7))} />
          </Row>
          <View style={{ flexDirection: 'row' }}>
            {WEEKDAYS_SHORT.map((w) => (
              <T key={w} dim size={12} center style={{ flex: 1 }}>
                {w}
              </T>
            ))}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {days.map((d) => {
              const inMonth = d.startsWith(month);
              const selected = d === value;
              return (
                <Pressable key={d} onPress={() => onPick(d)} style={{ width: `${100 / 7}%`, aspectRatio: 1, padding: 2 }}>
                  <View
                    style={{
                      flex: 1,
                      borderRadius: 100,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: selected ? t.accent : 'transparent',
                      borderWidth: d === today && !selected ? 1 : 0,
                      borderColor: t.accent,
                    }}
                  >
                    <T size={15} color={selected ? t.onAccent : inMonth ? t.text : t.textDim} weight={d === today ? '700' : '400'}>
                      {fromKey(d).getDate()}
                    </T>
                    {marked.has(d) && !selected ? (
                      <View style={{ position: 'absolute', bottom: 4, width: 4, height: 4, borderRadius: 2, backgroundColor: t.accent }} />
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
          <Button title="Сегодня" kind="secondary" onPress={() => onPick(today)} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
