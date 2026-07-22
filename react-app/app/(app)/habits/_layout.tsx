import { Stack } from 'expo-router';
import { Colors } from '@/constants/theme';

export default function HabitsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Colors.primary },
        headerTintColor: Colors.white,
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'My Habits' }} />
      <Stack.Screen name="[id]" options={{ title: 'Edit Habit', presentation: 'modal' }} />
    </Stack>
  );
}
