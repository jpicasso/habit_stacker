import { ScrollView, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen, Title } from '@/components/ui';
import { Colors } from '@/constants/theme';

/** Public privacy policy — also reachable at /privacy for App Store / web. */
export default function PrivacyScreen() {
  const insets = useSafeAreaInsets();
  return (
    <Screen style={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }}>
      <ScrollView>
        <Title>Privacy policy</Title>
        <Text style={styles.p}>
          Habit Stacker (“we”) provides a habit-tracking service. This policy describes what we
          collect and how we use it.
        </Text>
        <Text style={styles.h}>Account information</Text>
        <Text style={styles.p}>
          When you create an account we store your email address and authentication data via
          Supabase Auth. We use this to sign you in and associate your habits with your account.
        </Text>
        <Text style={styles.h}>Habit data</Text>
        <Text style={styles.p}>
          Habits you create (name and start date) are stored in our database and shown only to your
          signed-in account. We do not sell your personal data.
        </Text>
        <Text style={styles.h}>Deletion</Text>
        <Text style={styles.p}>
          You can permanently delete your account and habit data from Settings → Delete account, or
          by contacting us.
        </Text>
        <Text style={styles.h}>Contact</Text>
        <Text style={styles.p}>
          For privacy questions, contact the site operator via the support channel listed on
          habitstackerapp.com.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  h: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text,
    marginTop: 16,
    marginBottom: 6,
  },
  p: {
    fontSize: 15,
    lineHeight: 22,
    color: Colors.textMuted,
    marginBottom: 8,
  },
});
