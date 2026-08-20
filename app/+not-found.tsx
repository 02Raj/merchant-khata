import { Link, Stack } from 'expo-router';
import { Text, View } from 'react-native';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not found', headerShown: true }} />
      <View>
        <Text>This screen does not exist.</Text>
        <Link href="/(auth)/login">
          <Text>Go to login</Text>
        </Link>
      </View>
    </>
  );
}
