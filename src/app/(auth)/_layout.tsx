import { Stack } from 'expo-router';

/**
 * Sign-in and invite registration.
 *
 * `sign-in` is declared first, so it is the group's landing route: a driver
 * signed out mid-route lands on the screen that gets them back to work, not on
 * the one for creating an account they already have.
 */
export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: 'transparent' },
        animation: 'fade',
      }}>
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="register" />
    </Stack>
  );
}
