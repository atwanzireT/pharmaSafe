// app/detail.tsx — fixed header at the top
import { database } from '@/firebase';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { ref as dbRef, get, off, onValue } from 'firebase/database';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Linking,
  Pressable,
  RefreshControl,
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
  IconButton,
  Text,
} from 'react-native-paper';

// ✅ NEW: safe area support for a proper fixed header
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const COLORS = {
  bg: '#F9FAFB',          // gray-50
  surface: '#FFFFFF',
  border: '#E5E7EB',      // gray-200
  divider: '#E5E7EB',
  primary: '#1E40AF',     // blue-800
  body: '#0F172A',        // slate-900
  sub: '#475569',         // slate-600
  mut: '#64748B',         // slate-500
  good: '#16A34A', goodBg: '#DCFCE7',
  warn: '#B45309', warnBg: '#FEF3C7',
  danger: '#B91C1C', dangerBg: '#FEE2E2',
  info: '#3730A3', infoBg: '#E0E7FF',
};

type Inspection = {
  id?: string;
  boxesImpounded?: string | number;
  clientTelephone?: string;
  createdAt?: string | number;
  createdBy?: string;
  date?: string | number;
  drugshopName?: string;
  impoundedBy?: string;
  location?: {
    coordinates?: { latitude?: number; longitude?: number };
    formattedAddress?: string;
  };
  serialNumber?: string;
  status?: string;
  releasedAt?: number;
  releasedBy?: string;
  releaseNote?: string;
};

export default function InspectionDetailScreen() {
  const router = useRouter();
  const auth = getAuth();
  const me = auth.currentUser || undefined;

  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const inspectionId = Array.isArray(params.id) ? params.id?.[0] : params.id;
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authChecking, setAuthChecking] = useState(true);

  // ✅ NEW: safe area insets for header placement
  const insets = useSafeAreaInsets();
  const HEADER_HEIGHT = 56; // visual height of header row
  const CONTENT_TOP_PAD = insets.top + HEADER_HEIGHT + 8; // space for header + breathing room


  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user || !user.uid) {
        // No user → go to login
        router.replace('/login');
        return;
      }
      setAuthChecking(false); // user is present
    });
    return unsub;
  }, [router]);

  // subscribe
  useEffect(() => {
    if (!inspectionId) {
      setError('Missing inspection id.');
      setLoading(false);
      return;
    }
    const r = dbRef(database, `inspections/${inspectionId}`);

    const cb = (snap: any) => {
      const val = snap.val();
      if (!val) {
        setInspection(null);
        setError('Inspection not found.');
      } else {
        setInspection({ id: inspectionId, ...val });
        setError(null);
      }
      setLoading(false);
    };
    const eb = (err: any) => {
      setError(err?.message || 'Failed to load inspection.');
      setLoading(false);
    };

    onValue(r, cb, eb);
    return () => off(r, 'value', cb);
  }, [inspectionId]);

  // refresh
  const onRefresh = useCallback(async () => {
    if (!inspectionId) return;
    setRefreshing(true);
    try {
      const snap = await get(dbRef(database, `inspections/${inspectionId}`));
      const val = snap.val();
      if (!val) {
        setInspection(null);
        setError('Inspection not found.');
      } else {
        setInspection({ id: inspectionId, ...val });
        setError(null);
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to refresh inspection.');
    } finally {
      setRefreshing(false);
    }
  }, [inspectionId]);

  const statusMap = (status?: string) => {
    const s = (status || 'submitted').toLowerCase();
    if (s.includes('complete')) return { bg: COLORS.goodBg, fg: COLORS.good, icon: 'check-circle' as const, label: 'Completed' };
    if (s.includes('pending'))  return { bg: COLORS.warnBg, fg: COLORS.warn, icon: 'clock' as const,         label: 'Pending Review' };
    if (s.includes('action'))   return { bg: COLORS.dangerBg, fg: COLORS.danger, icon: 'alert-triangle' as const, label: 'Action Required' };
    return { bg: COLORS.infoBg, fg: COLORS.info, icon: 'clipboard' as const, label: 'Submitted' };
  };

  const status = useMemo(() => statusMap(inspection?.status), [inspection?.status]);

  const formatDate = (isoOrMs?: string | number) => {
    if (!isoOrMs) return '—';
    const d = typeof isoOrMs === 'number' ? new Date(isoOrMs) : new Date(isoOrMs);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  const handleCall = (phone?: string) => { if (phone) Linking.openURL(`tel:${phone}`); };
  const openMaps = (address?: string) => {
    if (!address) return;
    const q = encodeURIComponent(address);
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`);
  };
  const goReleaseForm = () => inspectionId && router.push({ pathname: '/releaseform', params: { id: inspectionId } });

  const OutlinedCard: React.FC<{ children: React.ReactNode; style?: any }> = ({ children, style }) => (
    <Card mode="outlined" elevation={0} style={[styles.card, style]}>
      <View style={styles.cardContent}>{children}</View>
    </Card>
  );

  if (loading) {
    return (
      <View style={[styles.fill, styles.center, { backgroundColor: COLORS.bg }]}>
        <StatusBar barStyle="dark-content" />
        <ActivityIndicator animating color={COLORS.primary} />
        <Text style={{ color: COLORS.sub, marginTop: 12 }}>Loading inspection…</Text>
      </View>
    );
  }

  return (
    // ✅ NEW: SafeAreaView container so the absolute header sits below the notch
    <SafeAreaView style={[styles.fill, { backgroundColor: COLORS.bg }]} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" />

      {/* ✅ FIXED HEADER */}
      <View
        style={[
          styles.fixedHeader,
          {
            top: insets.top, // sit right below the status bar/notch
          },
        ]}
      >
        <IconButton
          icon="arrow-left"
          size={22}
          onPress={() => router.back()}
          style={styles.backButton}
          accessibilityLabel="Go back"
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Inspection Details</Text>
          {inspection?.serialNumber ? (
            <Text style={styles.headerSubtitle}>Serial: {inspection.serialNumber}</Text>
          ) : null}
        </View>
        <View style={{ width: 44 }} />
      </View>

      {/* Content scrolls under the fixed header; we pad the top to avoid overlap */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24, paddingHorizontal: 14, paddingTop: CONTENT_TOP_PAD }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
      >
        {/* Error / Not found */}
        {error ? (
          <OutlinedCard>
            <Text style={{ color: COLORS.danger, fontWeight: '800', marginBottom: 6 }}>Unable to load</Text>
            <Text style={{ color: COLORS.sub, marginBottom: 10 }}>{error}</Text>
            <Button mode="contained" onPress={onRefresh} style={styles.primaryBtn} labelStyle={styles.primaryBtnLabel} icon="reload">
              Retry
            </Button>
          </OutlinedCard>
        ) : null}

        {!error && !inspection ? (
          <OutlinedCard>
            <Text style={{ color: COLORS.sub }}>This inspection could not be found.</Text>
          </OutlinedCard>
        ) : null}

        {inspection && (
          <>
            {/* Status */}
            <OutlinedCard>
              <View style={styles.statusRow}>
                <View style={[styles.statusBadge, { backgroundColor: status.bg, borderColor: status.fg }]}>
                  <Feather name={status.icon} size={16} color={status.fg} />
                  <Text style={[styles.statusText, { color: status.fg }]}>{status.label}</Text>
                </View>
                <Text style={styles.statusSerial}>#{inspection.serialNumber || '—'}</Text>
              </View>
            </OutlinedCard>

            {/* Drugshop info */}
            <OutlinedCard style={{ marginTop: 12 }}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionIcon}>
                  <Feather name="home" size={16} color={COLORS.primary} />
                </View>
                <Text style={styles.sectionTitle}>Drugshop Information</Text>
              </View>
              <Divider style={styles.divider} />
              <Row label="Name" value={inspection.drugshopName} />
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Contact</Text>
                <View style={styles.rowValueInline}>
                  <Text style={styles.rowValue}>{inspection.clientTelephone || '—'}</Text>
                  {inspection.clientTelephone ? (
                    <Pressable onPress={() => handleCall(inspection.clientTelephone)} style={styles.callChip}>
                      <Feather name="phone" size={14} color="#fff" />
                      <Text style={styles.callChipText}>Call</Text>
                    </Pressable>
                  ) : null}
                  <View style={{ marginRight: 60 }} />
                </View>
              </View>
            </OutlinedCard>

            {/* Inspection details */}
            <OutlinedCard style={{ marginTop: 12 }}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionIcon}>
                  <Feather name="clipboard" size={16} color={COLORS.primary} />
                </View>
                <Text style={styles.sectionTitle}>Inspection Details</Text>
              </View>
              <Divider style={styles.divider} />
              <Row label="Date & Time" value={formatDate(inspection.date ?? inspection.createdAt ?? '')} />
              <Row label="Inspected By" value={inspection.impoundedBy} />
              <View style={styles.kpiRow}>
                <Text style={styles.kpiLabel}>Boxes Impounded</Text>
                <View style={styles.kpiBadge}>
                  <Text style={styles.kpiValue}>{String(inspection.boxesImpounded ?? '0')}</Text>
                </View>
              </View>
            </OutlinedCard>

            {/* Location */}
            <OutlinedCard style={{ marginTop: 12 }}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionIcon}>
                  <Feather name="map-pin" size={16} color={COLORS.primary} />
                </View>
                <Text style={styles.sectionTitle}>Location</Text>
              </View>
              <Divider style={styles.divider} />
              <Pressable
                onPress={() => openMaps(inspection.location?.formattedAddress)}
                style={styles.locationRow}
                disabled={!inspection.location?.formattedAddress}
              >
                <Feather name="map" size={18} color={COLORS.sub} />
                <Text style={styles.locationText} numberOfLines={3}>
                  {inspection.location?.formattedAddress || '—'}
                </Text>
                <Feather name="external-link" size={16} color={COLORS.primary} />
              </Pressable>
            </OutlinedCard>

            {/* Actions */}
            <View style={styles.actions}>
              <Button
                mode="contained"
                onPress={goReleaseForm}
                style={[styles.primaryBtn, { backgroundColor: '#0ea5e9' }]}
                labelStyle={styles.primaryBtnLabel}
                icon="file-document-outline"
              >
                Generate Release Form
              </Button>

              <Button
                mode="outlined"
                onPress={() => {}}
                style={styles.secondaryBtn}
                labelStyle={styles.secondaryBtnLabel}
                icon="pencil-outline"
              >
                Edit Inspection
              </Button>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/* ---------- small UI helpers ---------- */
function Row({ label, value }: { label: string; value?: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={2}>
        {value || '—'}
      </Text>
    </View>
  );
}

/* ---------- styles ---------- */
const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },

  // ✅ NEW: fixed header styles
  fixedHeader: {
    position: 'absolute',
    left: 14,
    right: 14,
    height: 56,
    zIndex: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 4,
    backgroundColor: COLORS.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    // subtle elevation/shadow so it floats above the list
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },

  backButton: {
    backgroundColor: '#DBEAFE', // blue-100
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: COLORS.primary, letterSpacing: 0.2 },
  headerSubtitle: { fontSize: 12, color: COLORS.sub, marginTop: 2 },

  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 8,
  },
  cardContent: { padding: 14 },

  // Status
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusText: { fontWeight: '800' },
  statusSerial: { fontSize: 12, color: COLORS.sub, fontWeight: '600' },

  // Sections
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  sectionIcon: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#DBEAFE', borderWidth: 1, borderColor: '#BFDBFE',
    alignItems: 'center', justifyContent: 'center',
  },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: COLORS.body, marginLeft: 8 },
  divider: { backgroundColor: COLORS.divider, height: 1, marginBottom: 12 },

  // Rows
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 16 },
  rowLabel: { fontSize: 14, color: COLORS.sub, fontWeight: '600', flexShrink: 0 },
  rowValue: { fontSize: 14, color: COLORS.body, fontWeight: '700', flex: 1, textAlign: 'right' },
  rowValueInline: { flexDirection: 'row', alignItems: 'center', gap: 10 },

  // Call chip
  callChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.primary, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  callChipText: { color: '#fff', fontWeight: '700', fontSize: 12 },

  // KPI
  kpiRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, marginBottom: 6 },
  kpiLabel: { color: COLORS.sub, fontSize: 12, fontWeight: '600' },
  kpiBadge: { backgroundColor: '#FEE2E2', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: '#FCA5A5' },
  kpiValue: { color: '#DC2626', fontSize: 18, fontWeight: '900' },

  // Location
  locationRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#F8FAFC', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border,
  },
  locationText: { flex: 1, color: COLORS.sub, fontSize: 14 },

  // Actions
  actions: { marginTop: 14, marginBottom: 26, gap: 10 },
  primaryBtn: { borderRadius: 12, backgroundColor: COLORS.primary, paddingVertical: 4, elevation: 0 },
  primaryBtnLabel: { color: '#fff', fontWeight: '800' },
  secondaryBtn: { borderRadius: 12, borderColor: COLORS.primary, paddingVertical: 4 },
  secondaryBtnLabel: { color: COLORS.primary, fontWeight: '800' },
});
