// app/(tabs)/_layout.tsx
import { HapticTab } from '@/components/haptic-tab';
import { auth } from '@/firebase';
import { MaterialIcons } from '@expo/vector-icons';
import { Tabs, useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';

// Palette (kept from your snippet)
const COLORS = {
  bg: '#F9FAFB',        // gray-50
  border: '#E5E7EB',    // gray-200
  text: '#0F172A',      // slate-900
  sub: '#24397eff',     // slate-500-ish
  green: '#166534',     // green-800
  greenSoft: '#DCFCE7', // green-100-ish background
  primary: '#1E40AF',   // blue-800
};

export default function TabLayout() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  // Simple auth guard at the layout level
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        // Not signed in → go to login (replace to avoid back to tabs)
        router.replace('/login');
        setReady(false);
      } else {
        setReady(true);
      }
    });
    return unsub;
  }, [router]);

  // Small loader while we confirm auth state
  if (!ready) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: COLORS.bg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,

        // Colors
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.sub,

        // Backgrounds
        tabBarStyle: {
          backgroundColor: COLORS.bg,
          borderTopColor: COLORS.border,
          borderTopWidth: 1,
          elevation: 0,
          shadowOpacity: 0,
          height: Platform.OS === 'ios' ? 110 : 120,
          paddingBottom: 8,
          paddingTop: 8,
        },

        // Labels
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '700',
        },

        // Haptics + larger touch target
        tabBarButton: HapticTab,

        // Hide bar when keyboard opens (Android esp.)
        tabBarHideOnKeyboard: true,

        // Scene background
        sceneStyle: {
          backgroundColor: COLORS.bg,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarAccessibilityLabel: 'Home',
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="home" size={26} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="explore"
        options={{
          title: 'Search',
          tabBarAccessibilityLabel: 'Search',
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="search" size={26} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarAccessibilityLabel: 'Profile',
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="person" size={26} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
  