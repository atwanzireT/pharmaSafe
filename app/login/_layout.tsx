// app/_layout.tsx (or app/login/_layout.tsx)
import { Stack } from 'expo-router';

export default function Layout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#F9FAFB' } }} />
  );
}
