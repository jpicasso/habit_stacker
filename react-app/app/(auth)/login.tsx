import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ErrorBanner,
  FieldLabel,
  InfoBanner,
  Input,
  PrimaryButton,
  Screen,
  Title,
} from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { Colors } from '@/constants/theme';

type Mode = 'login' | 'signup' | 'forgot';

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ mode?: string }>();
  const initialMode: Mode =
    params.mode === 'signup' ? 'signup' : params.mode === 'forgot' ? 'forgot' : 'login';

  const { signIn, signUp, resetPasswordForEmail, configured } = useAuth();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const copy = useMemo(() => {
    if (mode === 'signup') {
      return {
        title: 'Sign up',
        submit: 'Create account',
        toggle: 'Already have an account? Log in',
      };
    }
    if (mode === 'forgot') {
      return {
        title: 'Reset password',
        submit: 'Send reset link',
        toggle: 'Back to log in',
      };
    }
    return {
      title: 'Log in',
      submit: 'Log in',
      toggle: "Don't have an account? Sign up",
    };
  }, [mode]);

  async function onSubmit() {
    setError(null);
    setInfo(null);
    if (!configured) {
      setError('Supabase is not configured. Add keys to react-app/.env');
      return;
    }
    const trimmed = email.trim();
    if (!trimmed) {
      setError('Please enter your email');
      return;
    }
    if (mode !== 'forgot' && password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setBusy(true);
    try {
      if (mode === 'login') {
        await signIn(trimmed, password);
        router.replace('/(app)/habits');
      } else if (mode === 'signup') {
        const { needsEmailConfirm } = await signUp(trimmed, password);
        if (needsEmailConfirm) {
          setInfo('Check your email to confirm your account, then log in.');
          setMode('login');
        } else {
          router.replace('/(app)/habits');
        }
      } else {
        await resetPasswordForEmail(trimmed);
        setInfo('Password reset email sent. Check your inbox.');
        setMode('login');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  function onToggle() {
    setError(null);
    setInfo(null);
    if (mode === 'login') setMode('signup');
    else setMode('login');
  }

  return (
    <Screen style={{ paddingTop: insets.top + 24 }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
          <Title>{copy.title}</Title>
          <ErrorBanner message={error} />
          <InfoBanner message={info} />

          <FieldLabel>Email</FieldLabel>
          <Input
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
          />

          {mode !== 'forgot' && (
            <>
              <FieldLabel>Password</FieldLabel>
              <Input
                secureTextEntry
                autoComplete={mode === 'signup' ? 'new-password' : 'password'}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
              />
            </>
          )}

          <PrimaryButton label={copy.submit} onPress={onSubmit} loading={busy} />

          {mode === 'login' && (
            <Pressable onPress={() => setMode('forgot')} style={{ marginTop: 16 }}>
              <Text style={{ color: Colors.primary, textAlign: 'center', fontWeight: '600' }}>
                Forgot password?
              </Text>
            </Pressable>
          )}

          <Pressable onPress={onToggle} style={{ marginTop: 16 }}>
            <Text style={{ color: Colors.primary, textAlign: 'center', fontWeight: '600' }}>
              {copy.toggle}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
