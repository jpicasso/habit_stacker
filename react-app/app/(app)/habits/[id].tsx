import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ErrorBanner,
  FieldLabel,
  Input,
  PrimaryButton,
  Screen,
  Title,
} from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { deleteHabit, fetchHabits, updateHabit } from '@/lib/api';
import { todayInputValue } from '@/lib/dates';

export default function EditHabitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const habitId = Number(id);
  const { accessToken, user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [task, setTask] = useState('');
  const [eventDate, setEventDate] = useState(todayInputValue());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!accessToken || !user?.email || !habitId) return;
      try {
        const all = await fetchHabits(accessToken);
        const found = all.find((h) => h.id === habitId);
        if (!found) {
          if (!cancelled) setError('Habit not found');
          return;
        }
        if (!cancelled) {
          setTask(found.task);
          setEventDate(found.event_date || todayInputValue());
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load habit');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, user?.email, habitId]);

  async function onSave() {
    if (!accessToken || !user?.email) return;
    const name = task.trim();
    if (!name) {
      setError('Please enter a habit');
      return;
    }
    if (!eventDate) {
      setError('Please enter a start date');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateHabit(accessToken, habitId, name, eventDate, user.email);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update habit');
    } finally {
      setSaving(false);
    }
  }

  function onDelete() {
    if (!accessToken) return;
    Alert.alert('Delete habit?', 'Are you sure you want to delete this habit?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteHabit(accessToken, habitId);
            router.back();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to delete habit');
          }
        },
      },
    ]);
  }

  return (
    <Screen style={{ paddingTop: insets.top + 12 }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled">
          <Title>Edit Habit</Title>
          <ErrorBanner message={error} />
          {!loading && (
            <>
              <FieldLabel>Habit</FieldLabel>
              <Input value={task} onChangeText={setTask} placeholder="Enter habit" />
              <FieldLabel>Start date (YYYY-MM-DD)</FieldLabel>
              <Input value={eventDate} onChangeText={setEventDate} autoCapitalize="none" />
              <PrimaryButton label="Save Changes" onPress={onSave} loading={saving} />
              <PrimaryButton label="Delete" onPress={onDelete} variant="danger" />
              <PrimaryButton label="Cancel" onPress={() => router.back()} variant="secondary" />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
