// app/inspection-list.tsx (flat, no shadows, gray-50 + blue-800)
import { auth, database } from '@/firebase';
import { Feather } from '@expo/vector-icons';
import { Link, useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { ref as dbRef, get, off, onValue } from 'firebase/database';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  RefreshControl,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Button, Card, IconButton, Searchbar, Text } from 'react-native-paper';

const COLORS = {
  // Surfaces
  bg: '#F9FAFB',          // gray-50
  cardBG: '#FFFFFF',
  border: '#E5E7EB',      // gray-200
  divider: '#E5E7EB',
  // Text
  primary: '#1E40AF',     // blue-800
  body: '#0F172A',        // slate-900
  sub: '#475569',         // slate-600
  mut: '#64748B',         // slate-500
  // States
  good: '#16A34A', goodBg: '#DCFCE7', goodBr: '#86EFAC',
  warn: '#B45309', warnBg: '#FEF3C7', warnBr: '#FCD34D',
  danger: '#B91C1C', dangerBg: '#FEE2E2', dangerBr: '#FCA5A5',
  info: '#3730A3', infoBg: '#E0E7FF', infoBr: '#C7D2FE',
};

type Inspection = {
  id: string;
  serialNumber?: string;
  drugshopName?: string;
  clientTelephone?: string;
  boxesImpounded?: string | number;
  impoundedBy?: string;
  status?: string;
  date?: string;
  createdAt?: string;
  location?: { formattedAddress?: string } | string;
};

const InspectionListScreen = () => {
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [authChecking, setAuthChecking] = useState(true);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const router = useRouter();

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

  const mapSnapshot = (raw: any): Inspection[] => {
    if (!raw) return [];
    const items: Inspection[] = Object.entries(raw).map(([id, v]: any) => {
      const loc =
        typeof v?.location === 'string'
          ? v.location
          : v?.location?.formattedAddress || 'Location not specified';
      const isoDate = v?.date || v?.createdAt;
      return {
        id,
        ...v,
        date: isoDate,
        location: loc,
        boxesImpounded:
          typeof v?.boxesImpounded === 'number'
            ? v.boxesImpounded
            : (v?.boxesImpounded || '0'),
        serialNumber: v?.serialNumber || '—',
        drugshopName: v?.drugshopName || 'Unnamed drugshop',
        status: v?.status || 'Submitted',
      };
    });

    return items.sort((a, b) => {
      const ta = Date.parse(a.date || a.createdAt || '');
      const tb = Date.parse(b.date || b.createdAt || '');
      if (isNaN(ta) && isNaN(tb)) return 0;
      if (isNaN(ta)) return 1;
      if (isNaN(tb)) return -1;
      return tb - ta;
    });
  };

  const formatDate = (iso?: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  useEffect(() => {
    const r = dbRef(database, 'inspections');
    const cb = (snap: any) => {
      const mapped = mapSnapshot(snap.val());
      setInspections(mapped);

      Animated.timing(fadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
      setLoading(false);
    };
    const err = (e: any) => {
      console.error('Error fetching inspections:', e);
      setLoading(false);
    };

    onValue(r, cb, err);
    return () => {
      off(r, 'value', cb);
    };
  }, [fadeAnim]);

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      const snap = await get(dbRef(database, 'inspections'));
      setInspections(mapSnapshot(snap.val()));
    } catch (e) {
      console.error('Refresh error:', e);
    } finally {
      setRefreshing(false);
    }
  };

  const statusStyles = (status?: string) => {
    switch (status) {
      case 'Completed':
        return { wrap: [styles.badge, { backgroundColor: COLORS.goodBg, borderColor: COLORS.goodBr }], dot: [styles.dot, { backgroundColor: COLORS.good }], txt: [styles.badgeTxt, { color: COLORS.good }] };
      case 'Pending Review':
        return { wrap: [styles.badge, { backgroundColor: COLORS.warnBg, borderColor: COLORS.warnBr }], dot: [styles.dot, { backgroundColor: '#F59E0B' }], txt: [styles.badgeTxt, { color: COLORS.warn }] };
      case 'Action Required':
        return { wrap: [styles.badge, { backgroundColor: COLORS.dangerBg, borderColor: COLORS.dangerBr }], dot: [styles.dot, { backgroundColor: COLORS.danger }], txt: [styles.badgeTxt, { color: COLORS.danger }] };
      default:
        return { wrap: [styles.badge, { backgroundColor: COLORS.infoBg, borderColor: COLORS.infoBr }], dot: [styles.dot, { backgroundColor: COLORS.info }], txt: [styles.badgeTxt, { color: COLORS.info }] };
    }
  };

  const openDetail = (id: string) => router.push({ pathname: '/detail', params: { id } });
  const openReleaseForm = (id: string) => router.push({ pathname: '/releaseform', params: { id } });

  // Client-side filter
  const filteredInspections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return inspections;
    const includes = (val?: string | number) => String(val ?? '').toLowerCase().includes(q);
    return inspections.filter((i) => {
      const loc = typeof i.location === 'string' ? i.location : '';
      return includes(i.drugshopName) || includes(i.serialNumber) || includes(i.status) || includes(loc);
    });
  }, [query, inspections]);

  const renderInspectionItem = ({ item }: { item: Inspection }) => {
    const st = statusStyles(item.status);
    return (
      <Animated.View
        style={[
          styles.cardContainer,
          { opacity: fadeAnim, transform: [{ translateY: fadeAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] },
        ]}
      >
        <Link href={{ pathname: '/detail', params: { id: item.id } }} asChild>
          <TouchableOpacity activeOpacity={0.9}>
            <Card style={styles.card} mode="outlined" elevation={0}>
              <View style={styles.cardContent}>
                {/* Top row: serial + status */}
                <View style={styles.cardHeader}>
                  <View style={styles.serialPill}>
                    <Feather name="hash" size={13} color={COLORS.primary} />
                    <Text style={styles.serialText} numberOfLines={1}>
                      {item.serialNumber}
                    </Text>
                  </View>
                  <View style={st.wrap as any}>
                    <View style={st.dot as any} />
                    <Text style={st.txt as any} numberOfLines={1}>
                      {item.status || 'Submitted'}
                    </Text>
                  </View>
                </View>

                {/* Title */}
                <Text style={styles.title} numberOfLines={1}>
                  {item.drugshopName}
                </Text>

                {/* Meta */}
                <View style={styles.metaRow}>
                  <View style={styles.metaItem}>
                    <Feather name="map-pin" size={14} color={COLORS.sub} />
                    <Text style={styles.metaText} numberOfLines={1}>
                      {typeof item.location === 'string' ? item.location : 'Location not specified'}
                    </Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Feather name="calendar" size={14} color={COLORS.sub} />
                    <Text style={styles.metaText}>{formatDate(item.date || item.createdAt)}</Text>
                  </View>
                </View>

                {/* KPI */}
                <View style={styles.kpiWrap}>
                  <Text style={styles.kpiLabel}>Boxes Impounded</Text>
                  <View style={styles.kpiValueWrap}>
                    <Text style={styles.kpiValue}>{String(item.boxesImpounded ?? '0')}</Text>
                  </View>
                </View>

                <View style={styles.divider} />

                {/* Actions */}
                <View style={styles.actionsRow}>
                  <Button
                    mode="contained"
                    onPress={() => openReleaseForm(item.id)}
                    style={styles.releaseButton}
                    labelStyle={styles.releaseButtonLabel}
                    icon="file-document-outline"
                    compact
                  >
                    Release Form
                  </Button>

                  <IconButton
                    icon="chevron-right"
                    size={22}
                    onPress={() => openDetail(item.id)}
                    style={styles.detailsIcon}
                    accessibilityLabel="Open details"
                  />
                </View>
              </View>
            </Card>
          </TouchableOpacity>
        </Link>
      </Animated.View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.fill, styles.center, { backgroundColor: COLORS.bg }]}>
        <StatusBar barStyle="dark-content" />
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={{ color: COLORS.sub, marginTop: 10 }}>Loading inspections…</Text>
      </View>
    );
  }

  if (inspections.length === 0) {
    return (
      <View style={[styles.fill, styles.center, { backgroundColor: COLORS.bg, padding: 20 }]}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.emptyBadge}>
          <Feather name="clipboard" size={48} color={COLORS.primary} />
        </View>
        <Text style={styles.emptyTitle}>No inspections yet</Text>
        <Text style={styles.emptyText}>Create your first inspection to get started.</Text>
        <Button
          mode="contained"
          onPress={() => router.push('/NewInspection')}
          style={styles.addButton}
          labelStyle={styles.addButtonLabel}
          icon="plus"
        >
          Create New Inspection
        </Button>
      </View>
    );
  }

  const noResults = filteredInspections.length === 0 && query.trim().length > 0;

  return (
    <View style={[styles.fill, { backgroundColor: COLORS.bg }]}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.logoCircle}>
          <Feather name="clipboard" size={20} color={COLORS.primary} />
        </View>
        <View>
          <Text style={styles.headerTitle}>Inspections</Text>
          <Text style={styles.headerSubtitle}>
            {filteredInspections.length} {filteredInspections.length === 1 ? 'result' : 'results'}
            {query ? ` • filtered` : ` • ${inspections.length} total`}
          </Text>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <Searchbar
          placeholder="Search name, serial, status, or location"
          value={query}
          onChangeText={setQuery}
          icon="magnify"
          clearIcon={query ? 'close' : undefined}
          onClearIconPress={() => setQuery('')}
          style={styles.searchBar}
          inputStyle={styles.searchInput}
          elevation={0}
          theme={{
            colors: {
              primary: COLORS.primary,
              onSurface: COLORS.body,
              onSurfaceVariant: COLORS.sub,
              outline: COLORS.border,
            },
          }}
        />
      </View>

      {noResults ? (
        <View style={styles.noResults}>
          <Feather name="search" size={36} color={COLORS.sub} />
          <Text style={styles.noResultsTitle}>No matches</Text>
          <Text style={styles.noResultsText}>Try a different name, serial, status, or location.</Text>
        </View>
      ) : (
        <FlatList
          data={filteredInspections}
          keyExtractor={(item) => item.id}
          renderItem={renderInspectionItem}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.listSeparator} />}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[COLORS.primary]}
              tintColor={COLORS.primary}
            />
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },

  listContent: { paddingBottom: 18, paddingTop: 6, paddingHorizontal: 14 },
  listSeparator: { height: 8 }, // nice breathing room between flat cards

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    marginTop: 40,
    marginBottom: 10,
  },
  logoCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#DBEAFE', // blue-100
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#BFDBFE', // blue-200
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: 0.2,
  },
  headerSubtitle: { fontSize: 13, color: COLORS.sub, marginTop: 2 },

  searchWrap: { paddingHorizontal: 14, marginTop: 6, marginBottom: 6 },
  searchBar: {
    backgroundColor: COLORS.cardBG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchInput: { color: COLORS.body },

  emptyBadge: {
    width: 86,
    height: 86,
    borderRadius: 43,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    backgroundColor: '#DBEAFE',
  },
  emptyTitle: { color: COLORS.primary, fontWeight: '800', fontSize: 18, marginBottom: 6 },
  emptyText: { color: COLORS.sub, textAlign: 'center', marginBottom: 18 },
  addButton: { borderRadius: 12, backgroundColor: COLORS.primary, elevation: 0 },
  addButtonLabel: { color: '#fff', fontWeight: '700' },

  cardContainer: { },
  card: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: COLORS.cardBG,
    borderWidth: 1,
    borderColor: COLORS.border,
    // no shadow, no elevation
  },
  cardContent: { padding: 14 },

  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

  serialPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E0E7FF',
  },
  serialText: { color: COLORS.primary, fontWeight: '700', fontSize: 12, marginLeft: 6 },

  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  badgeTxt: { fontWeight: '700', fontSize: 12 },

  title: { fontSize: 18, fontWeight: '800', color: COLORS.body, marginTop: 12, marginBottom: 10 },

  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, gap: 8 },
  metaItem: { flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 },
  metaText: { color: COLORS.sub, fontSize: 13, marginLeft: 6, flexShrink: 1 },

  kpiWrap: { marginBottom: 12 },
  kpiLabel: { color: COLORS.mut, fontSize: 12, marginBottom: 6, fontWeight: '600' },
  kpiValueWrap: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  kpiValue: { color: '#DC2626', fontSize: 20, fontWeight: '900' },

  divider: { height: 1, backgroundColor: COLORS.divider, marginBottom: 10 },

  actionsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  releaseButton: { borderRadius: 10, backgroundColor: COLORS.primary, elevation: 0 },
  releaseButtonLabel: { color: '#fff', fontWeight: '700', fontSize: 13 },
  detailsIcon: {
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },

  noResults: { alignItems: 'center', marginTop: 34, paddingHorizontal: 20 },
  noResultsTitle: { color: COLORS.primary, fontWeight: '800', fontSize: 18, marginTop: 10 },
  noResultsText: { color: COLORS.sub, textAlign: 'center', marginTop: 6 },
});

export default InspectionListScreen;
