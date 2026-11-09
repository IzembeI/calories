import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { backupNudgeDue, dismissBackupNudge, exportBackup } from '@/lib/backup';
import { Button, Card, Row, T } from './components';

/**
 * Weekly inline reminder on the diary: the automatic copies sit inside the app and are deleted with it,
 * so once a week we ask the user to save one copy outside (iCloud Drive via the share sheet).
 */
export function BackupNudge() {
  const db = useSQLiteContext();
  const [due, setDue] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      backupNudgeDue(db)
        .then((d) => alive && setDue(d))
        .catch(() => {});
      return () => {
        alive = false;
      };
    }, [db]),
  );

  if (!due) return null;

  const save = async () => {
    try {
      await exportBackup(db);
      setDue(false);
    } catch (e) {
      Alert.alert('Ошибка', String(e instanceof Error ? e.message : e));
    }
  };
  const later = async () => {
    setDue(false);
    await dismissBackupNudge(db);
  };

  return (
    <Card>
      <T weight="700">Сохраните копию в iCloud Drive</T>
      <T dim size={13}>
        Автокопии лежат внутри приложения и пропадут, если его удалить. Раз в неделю сохраняйте копию в «Файлы → iCloud Drive».
      </T>
      <Row>
        <Button title="Сохранить копию" small onPress={save} style={{ flex: 1 }} />
        <Button title="Позже" kind="ghost" small onPress={later} />
      </Row>
    </Card>
  );
}
