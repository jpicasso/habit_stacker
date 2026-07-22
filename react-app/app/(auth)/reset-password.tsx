import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ErrorBanner,
  FieldLabel,
  InfoBanner,
  Input,
  PrimaryButton,
  Screen,
  Title,
  Muted,
} from '@/components/ui';
import { useAuth } from '@/context/AuthContext';

export default function ResetPasswordScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { updatePassword, session } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setError(null);
    setInfo(null);
    if (!session) {
      setError('Open the reset link from your email in this app, then try again.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setBusy(true);
    try {
      await updatePassword(password);
      setInfo('Password updated. Taking you to your habits…');
      setTimeout(() => router.replace('/(app)/habits'), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update password');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen style={{ paddingTop: insets.top + 24 }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled">
          <Title>Choose a new password</Title>
          <Muted>Enter a new password for your Habit Stacker account.</Muted>
          <ErrorBanner message={error} />
          <InfoBanner message={info} />
          <FieldLabel>New password</FieldLabel>
          <Input secureTextEntry value={password} onChangeText={setPassword} placeholder="••••••••" />
          <FieldLabel>Confirm password</FieldLabel>
          <Input secureTextEntry value={confirm} onChangeText={setConfirm} placeholder="••••••••" />
          <PrimaryButton label="Update password" onPress={onSubmit} loading={busy} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
