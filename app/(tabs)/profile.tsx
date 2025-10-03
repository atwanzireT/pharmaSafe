// app/profile.tsx
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { getAuth, onAuthStateChanged, signOut } from 'firebase/auth';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
import {
  ActivityIndicator,
  Button,
  Card,
  Divider,
  Text
} from 'react-native-paper';

const COLORS = {
  bg: '#F9FAFB',          // gray-50
  surface: '#FFFFFF',
  border: '#E5E7EB',      // gray-200
  divider: '#E5E7EB',
  blue: '#1E40AF',        // blue-800
  red: '#991B1B',         // red-800
  body: '#0F172A',        // slate-900
  sub: '#475569',         // slate-600
  mut: '#64748B',         // slate-500
  blue100: '#DBEAFE',
  blue200: '#BFDBFE',
};

export default function ProfileScreen() {
  const router = useRouter();
  const auth = getAuth();
  const user = auth.currentUser ?? undefined;
  const [signingOut, setSigningOut] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);

  const initials = useMemo(() => {
    const name = user?.displayName?.trim();
    if (name) {
      const parts = name.split(/\s+/);
      return (parts[0]?.[0] || '').concat(parts[1]?.[0] || '').toUpperCase();
    }
    const email = user?.email || '';
    const id = (email.split('@')[0] || 'U').slice(0, 2);
    return id.toUpperCase();
  }, [user?.displayName, user?.email]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user || !user.uid) {
        router.replace('/login');
        return;
      }
      setAuthChecking(false); // user is present
    });
    return unsub;
  }, [router]);

  const handleSignOut = () => {
    Alert.alert(
      'Log out',
      'Are you sure you want to log out of your account?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log out',
          style: 'destructive',
          onPress: async () => {
            try {
              setSigningOut(true);
              await signOut(auth);
              router.replace('/login');
            } catch (e) {
              Alert.alert('Error', 'Failed to log out. Please try again.');
            } finally {
              setSigningOut(false);
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: COLORS.bg }]}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerIconWrap}>
            <Feather name="user" size={18} color={COLORS.blue} />
          </View>
          <View>
            <Text style={styles.headerTitle}>Profile</Text>
            <Text style={styles.headerSubtitle}>Account & preferences</Text>
          </View>
        </View>

        {/* Identity Card */}
        <Card mode="outlined" elevation={0} style={styles.card}>
          <View style={styles.cardContent}>
            <View style={styles.topRow}>
              {/* Gradient ring avatar */}
              <LinearGradient
                colors={[COLORS.red, COLORS.blue]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.avatarRing}
              >
                <View style={styles.avatarInner}>
                  <Text style={styles.avatarText}>{initials}</Text>
                </View>
              </LinearGradient>

              <View style={{ flex: 1 }}>
                <Text style={styles.nameText}>{user?.displayName || 'Unnamed User'}</Text>
                <Text style={styles.emailText}>{user?.email || 'No email'}</Text>
              </View>
            </View>

            <Divider style={styles.divider} />

            {/* Compact quick actions (no shadows) */}
            <View style={styles.quickActions}>
              <View style={styles.chip}>
                <Feather name="shield" size={14} color={COLORS.blue} />
                <Text style={styles.chipText}>Secure</Text>
              </View>
              <View style={styles.chip}>
                <Feather name="mail" size={14} color={COLORS.blue} />
                <Text style={styles.chipText}>Email verified{user?.emailVerified ? '' : ' (check mail)'}</Text>
              </View>
            </View>

            {/* Meta (no UID shown as requested) */}
            {user?.metadata ? (
              <>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Member since</Text>
                  <Text style={styles.infoValue}>
                    {user.metadata.creationTime
                      ? new Date(user.metadata.creationTime).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })
                      : '—'}
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Last sign-in</Text>
                  <Text style={styles.infoValue}>
                    {user.metadata.lastSignInTime
                      ? new Date(user.metadata.lastSignInTime).toLocaleString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '—'}
                  </Text>
                </View>
              </>
            ) : null}
          </View>
        </Card>

        {/* Preferences / Actions */}
        <Card mode="outlined" elevation={0} style={styles.card}>
          <View style={styles.cardContent}>
            <Text style={styles.sectionTitle}>Account</Text>

            <View style={styles.rowBtn}>
              <Feather name="edit-3" size={16} color={COLORS.blue} />
              <Text style={styles.rowBtnText}>Edit profile (coming soon)</Text>
              <Feather name="chevron-right" size={18} color={COLORS.mut} />
            </View>

            <View style={styles.rowBtn}>
              <Feather name="lock" size={16} color={COLORS.blue} />
              <Text style={styles.rowBtnText}>Change password (coming soon)</Text>
              <Feather name="chevron-right" size={18} color={COLORS.mut} />
            </View>
          </View>
        </Card>

        {/* Danger zone: Logout */}
        <Card mode="outlined" elevation={0} style={styles.card}>
          <View style={styles.cardContent}>
            <Text style={[styles.sectionTitle, { color: COLORS.red }]}>Sign out</Text>
            <Text style={styles.helpText}>You’ll need to sign in again to access your inspections.</Text>

            <View style={styles.actions}>
              <Button
                mode="contained"
                onPress={handleSignOut}
                disabled={signingOut}
                style={[styles.btn, styles.btnLogout]}
                labelStyle={{ color: '#fff', fontWeight: '800' }}
                icon="logout"
              >
                {signingOut ? 'Logging out…' : 'Log out'}
              </Button>
            </View>

            {signingOut && (
              <View style={styles.signOutRow}>
                <ActivityIndicator color={COLORS.red} />
                <Text style={{ color: COLORS.sub, marginLeft: 8 }}>Signing you out…</Text>
              </View>
            )}
          </View>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { paddingHorizontal: 14, paddingBottom: 28 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 50,
    paddingBottom: 10,
  },
  headerIconWrap: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.blue100, borderWidth: 1, borderColor: COLORS.blue200,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: COLORS.blue, letterSpacing: 0.2 },
  headerSubtitle: { fontSize: 12, color: COLORS.sub, marginTop: 2 },
  headerAction: {
    marginLeft: 'auto',
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.blue200,
  },

  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 8,
    marginBottom: 12,
  },
  cardContent: { padding: 14 },

  topRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatarRing: {
    width: 72, height: 72, borderRadius: 36, padding: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInner: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: COLORS.blue, fontWeight: '900', fontSize: 22, letterSpacing: 0.5 },

  nameText: { color: COLORS.body, fontWeight: '800', fontSize: 18 },
  emailText: { color: COLORS.sub, marginTop: 2 },

  divider: { height: 1, backgroundColor: COLORS.divider, marginVertical: 12 },

  quickActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6, marginTop: 2 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: '#EFF6FF', borderColor: COLORS.blue200, borderWidth: 1, borderRadius: 999,
  },
  chipText: { color: COLORS.blue, fontWeight: '700', fontSize: 12 },

  sectionTitle: { color: COLORS.body, fontWeight: '800', fontSize: 16, marginBottom: 8 },
  helpText: { color: COLORS.sub, fontSize: 12, marginBottom: 12 },

  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8,
  },
  infoLabel: { color: COLORS.mut, fontWeight: '600' },
  infoValue: { color: COLORS.body, fontWeight: '700' },

  rowBtn: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  rowBtnText: { color: COLORS.body, fontWeight: '700', flex: 1, marginLeft: 10 },

  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  btn: { flex: 1, borderRadius: 12, paddingVertical: 4 },
  btnLogout: { backgroundColor: COLORS.red, elevation: 0 },

  signOutRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 10 },
});
 