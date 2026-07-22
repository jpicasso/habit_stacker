import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorBanner, FieldLabel, Input, PrimaryButton, Screen } from '@/components/ui';
import { Colors, getStreakStyle } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { createHabit, fetchHabits, type Habit } from '@/lib/api';
import { daysSince, formatDateShort, todayInputValue } from '@/lib/dates';

export default function HabitsScreen() {
  const { accessToken, user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [habits, setHabits] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [task, setTask] = useState('');
  const [eventDate, setEventDate] = useState(todayInputValue());
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken || !user?.email) return;
    setError(null);
    try {
      const all = await fetchHabits(accessToken);
      const mine = all
        .filter((h) => h.user_id === user.email)
        .sort((a, b) => {
          const dateA = a.event_date ? new Date(a.event_date + 'T00:00:00').getTime() : 0;
          const dateB = b.event_date ? new Date(b.event_date + 'T00:00:00').getTime() : 0;
          return dateB - dateA;
        });
      setHabits(mine);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load habits');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accessToken, user?.email]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  async function onAdd() {
    if (!accessToken || !user?.email) return;
    const name = task.trim();
    if (!name) {
      setError('Please enter a habit');
      return;
    }
    if (!eventDate) {
      setError('Please select a start date (YYYY-MM-DD)');
      return;
    }
    setAdding(true);
    setError(null);
    try {
      await createHabit(accessToken, name, eventDate, user.email);
      setTask('');
      setEventDate(todayInputValue());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add habit');
    } finally {
      setAdding(false);
    }
  }

  function renderItem({ item }: { item: Habit }) {
    const kept = daysSince(item.event_date);
    const streak = getStreakStyle(kept);
    return (
      <Pressable
        onPress={() => router.push(`/(app)/habits/${item.id}`)}
        style={[styles.row, { backgroundColor: streak.backgroundColor }]}
      >
        <Text style={[styles.habitName, { color: streak.color, flex: 1 }]} numberOfLines={1}>
          {item.task}
        </Text>
        <Text style={[styles.cell, { color: streak.color, width: 56, textAlign: 'center' }]}>
          {item.event_date ? kept : '—'}
        </Text>
        <Text style={[styles.cell, { color: streak.color, width: 78, textAlign: 'center' }]}>
          {formatDateShort(item.event_date)}
        </Text>
      </Pressable>
    );
  }

  return (
    <Screen style={{ paddingTop: 12, paddingBottom: insets.bottom + 8 }}>
      <ErrorBanner message={error} />

      <View style={styles.headerRow}>
        <Text style={[styles.headerCell, { flex: 1 }]}>Habit</Text>
        <Text style={[styles.headerCell, { width: 56, textAlign: 'center' }]}>Days{'\n'}Kept</Text>
        <Text style={[styles.headerCell, { width: 78, textAlign: 'center' }]}>Start{'\n'}Date</Text>
      </View>

      {loading && habits.length === 0 ? (
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 24, flex: 1 }} />
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={habits}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={Colors.primary}
            />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>No habits yet. Add one below!</Text>
          }
          contentContainerStyle={{ paddingBottom: 16 }}
        />
      )}

      <View style={styles.addCard}>
        <FieldLabel>New habit</FieldLabel>
        <Input
          value={task}
          onChangeText={setTask}
          placeholder="Enter Habit"
          returnKeyType="done"
          onSubmitEditing={onAdd}
        />
        <FieldLabel>Start date (YYYY-MM-DD)</FieldLabel>
        <Input
          value={eventDate}
          onChangeText={setEventDate}
          placeholder={todayInputValue()}
          autoCapitalize="none"
        />
        <PrimaryButton label="Add New Habit" onPress={onAdd} loading={adding} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  addCard: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  headerCell: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textMuted,
    lineHeight: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  habitName: {
    fontSize: 16,
    fontWeight: '700',
    paddingRight: 8,
  },
  cell: {
    fontSize: 14,
  },
  empty: {
    textAlign: 'center',
    color: Colors.textMuted,
    marginTop: 24,
    fontSize: 15,
  },
});
