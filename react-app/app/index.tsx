import { Redirect, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';

const hero = require('../assets/images/homepage-hero.jpg');

/**
 * Entry route `/`:
 * - Signed in → habits
 * - Signed out → marketing home (port of src/pages/index.html)
 *
 * Layout: shorter hero so “What is habit stacking?” peeks into the first viewport.
 */
export default function Index() {
  const { session, loading } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: viewportHeight } = useWindowDimensions();

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={Colors.white} />
      </View>
    );
  }

  if (session) {
    return <Redirect href="/(app)/habits" />;
  }

  function goSignup() {
    router.push('/(auth)/login?mode=signup');
  }

  function goLogin() {
    router.push('/(auth)/login');
  }

  return (
    <ScrollView style={styles.root} bounces={false}>
      {/* Hero — shorter than the viewport so the next heading peeks in */}
      <ImageBackground
        source={hero}
        style={[
          styles.hero,
          {
            height: viewportHeight * 0.68,
            paddingTop: insets.top + 28,
          },
        ]}
        imageStyle={styles.heroImage}
      >
        <View style={styles.heroContent}>
          <Text style={styles.brand}>Habit Stacker</Text>
          <Text style={styles.tagline}>
            Build habits that stick by stacking them onto routines you already have.
          </Text>
          <Pressable
            onPress={goSignup}
            style={({ pressed }) => [styles.heroBtn, pressed && { opacity: 0.9 }]}
          >
            <Text style={styles.heroBtnText}>Sign up</Text>
          </Pressable>
          <Pressable onPress={goLogin} style={{ marginTop: 16 }}>
            <Text style={styles.heroLink}>Already have an account? Log in</Text>
          </Pressable>
        </View>
      </ImageBackground>

      {/* Explainer — starts in the first viewport under the hero */}
      <View
        style={[
          styles.sectionViewport,
          {
            paddingTop: 28,
            paddingBottom: Math.max(insets.bottom, 40),
          },
        ]}
      >
        <View style={styles.sectionInner}>
          <Text style={styles.h3}>What is habit stacking?</Text>
          <Text style={styles.p}>
            Habit stacking is a proven productivity technique that pairs a new, desired behavior with
            an existing, automatic daily routine. By using an established habit as a natural trigger,
            you bypass the need for relying on willpower, making it significantly easier to build
            consistent routines.
          </Text>
          <Text style={[styles.p, styles.em]}>
            After I pour my morning coffee, I will write down my top priority for the day. The coffee
            is the trigger; the new habit stacks right on top.
          </Text>

          <Text style={[styles.h3, { marginTop: 28 }]}>How the app works</Text>
          <Text style={styles.li}>
            <Text style={styles.strong}>1. Add a habit</Text> and the date you started it.
          </Text>
          <Text style={styles.li}>
            <Text style={styles.strong}>2. Keep your streak</Text> — the app tracks how many days
            you&apos;ve kept each habit.
          </Text>
          <Text style={styles.li}>
            <Text style={styles.strong}>3. Watch habits level up</Text> as streaks pass 1, 21, 100,
            and 365 days.
          </Text>

          <Pressable
            onPress={goSignup}
            style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.9 }]}
          >
            <Text style={styles.primaryBtnText}>Sign up</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.primary,
  },
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  hero: {
    width: '100%',
    justifyContent: 'flex-start',
    paddingHorizontal: 24,
    backgroundColor: Colors.primary,
  },
  heroImage: {
    resizeMode: 'cover',
  },
  heroContent: {
    zIndex: 1,
    alignItems: 'center',
    maxWidth: 560,
    alignSelf: 'center',
    width: '100%',
  },
  brand: {
    fontSize: 40,
    fontWeight: '800',
    color: Colors.white,
    textAlign: 'center',
    marginBottom: 12,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  tagline: {
    fontSize: 18,
    lineHeight: 26,
    color: Colors.white,
    textAlign: 'center',
    marginBottom: 28,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  heroBtn: {
    backgroundColor: Colors.white,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 10,
  },
  heroBtnText: {
    color: Colors.primary,
    fontSize: 17,
    fontWeight: '700',
  },
  heroLink: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    textDecorationLine: 'underline',
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  sectionViewport: {
    width: '100%',
    backgroundColor: Colors.white,
    justifyContent: 'flex-start',
    paddingHorizontal: 24,
  },
  sectionInner: {
    maxWidth: 640,
    width: '100%',
    alignSelf: 'center',
  },
  h3: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 12,
  },
  p: {
    fontSize: 16,
    lineHeight: 24,
    color: Colors.textMuted,
    marginBottom: 12,
  },
  em: {
    fontStyle: 'italic',
    marginBottom: 8,
  },
  li: {
    fontSize: 16,
    lineHeight: 24,
    color: Colors.textMuted,
    marginBottom: 10,
  },
  strong: {
    fontWeight: '700',
    color: Colors.text,
  },
  primaryBtn: {
    marginTop: 24,
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
});
