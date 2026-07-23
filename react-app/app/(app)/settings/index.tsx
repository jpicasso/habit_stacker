import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Muted, PrimaryButton, Screen, Title } from '@/components/ui';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';

export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  async function onLogout() {
    await signOut();
    router.replace('/');
  }

  return (
    <Screen style={{ paddingTop: 16, paddingBottom: insets.bottom + 16 }}>
      <Title>Settings</Title>
      <Muted>Signed in as {user?.email ?? '—'}</Muted>

      <View style={styles.card}>
        <Pressable onPress={() => router.push('/privacy')}>
          <Text style={styles.link}>Privacy policy</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/(app)/settings/delete-account')}>
          <Text style={[styles.link, { color: Colors.danger }]}>Delete account</Text>
        </Pressable>
      </View>

      <PrimaryButton label="Log out" onPress={onLogout} variant="secondary" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    gap: 16,
  },
  link: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.primary,
  },
});
