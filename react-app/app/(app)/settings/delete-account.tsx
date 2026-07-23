import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ErrorBanner,
  FieldLabel,
  Input,
  Muted,
  PrimaryButton,
  Screen,
  Title,
} from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { deleteAccount } from '@/lib/api';

export default function DeleteAccountScreen() {
  const { accessToken, signOut } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onDelete() {
    setError(null);
    if (confirm.trim() !== 'DELETE') {
      setError('Type DELETE (all caps) to confirm.');
      return;
    }
    if (!accessToken) {
      setError('You must be logged in.');
      return;
    }
    setBusy(true);
    try {
      await deleteAccount(accessToken);
      await signOut();
      router.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete account');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen style={{ paddingTop: insets.top + 12 }}>
      <ScrollView>
        <Title>Delete account</Title>
        <Muted>
          This permanently deletes your Habit Stacker account and all of your habits. This cannot be
          undone.
        </Muted>
        <ErrorBanner message={error} />
        <FieldLabel>Type DELETE to confirm</FieldLabel>
        <Input
          value={confirm}
          onChangeText={setConfirm}
          autoCapitalize="characters"
          placeholder="DELETE"
        />
        <PrimaryButton label="Delete my account" onPress={onDelete} loading={busy} variant="danger" />
        <PrimaryButton label="Cancel" onPress={() => router.back()} variant="secondary" />
      </ScrollView>
    </Screen>
  );
}
