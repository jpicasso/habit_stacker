import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { Colors } from '@/constants/theme';

/** Entry: send signed-in users to habits, everyone else to login. */
export default function Index() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.primary }}>
        <ActivityIndicator color={Colors.white} />
      </View>
    );
  }

  if (session) {
    return <Redirect href="/(app)/habits" />;
  }

  return <Redirect href="/(auth)/login" />;
}
