// app/inspection-register.tsx
import { database } from '@/firebase';
import { Feather } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ref as dbRef, off, onValue, push, serverTimestamp } from 'firebase/database';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Alert,
    FlatList,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    StyleSheet,
    View,
} from 'react-native';
import {
    ActivityIndicator,
    Badge,
    Button,
    Card,
    Divider,
    HelperText,
    IconButton,
    Modal,
    Portal,
    Snackbar,
    Text,
    TextInput,
} from 'react-native-paper';

type Entry = {
  id: string;
  date: string; // ISO
  inspectors: string;
  purpose: string;
  observations?: string;
  recommendations?: string;
  signature?: string;
  serialNo?: string;
  createdAt?: number | string;
};

const COLORS = {
  ink: '#0B1026',
  gradientStart: '#0B1026',
  gradientMid: '#101940',
  gradientEnd: '#1B2362',
  brand1: '#101940',
  brand2: '#1B2362',
  brand3: '#1B2362',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  slate900: '#0F172A',
  slate700: '#334155',
  slate600: '#475569',
  slate500: '#64748B',
  slate400: '#94A3B8',
  slate200: '#E2E8F0',
  slate100: '#F1F5F9',
  white: '#FFFFFF',
};

const formatDate = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

export default function InspectionRegisterScreen() {
  const router = useRouter();

  // ---------- list state ----------
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [snack, setSnack] = useState<{ visible: boolean; msg: string }>({ visible: false, msg: '' });

  // ---------- modal (single-entry) form ----------
  const [visible, setVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [form, setForm] = useState({
    date: new Date(),
    inspectors: '',
    purpose: '',
    observations: '',
    recommendations: '',
    signature: '',
    serialNo: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const setField = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => {
    setForm((p) => ({ ...p, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: '' }));
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.date) e.date = 'Date is required';
    if (!form.inspectors.trim()) e.inspectors = 'Required';
    if (!form.purpose.trim()) e.purpose = 'Required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const resetForm = () => {
    setForm({
      date: new Date(),
      inspectors: '',
      purpose: '',
      observations: '',
      recommendations: '',
      signature: '',
      serialNo: '',
    });
    setErrors({});
    setShowDatePicker(false);
  };

  const openModal = () => {
    resetForm();
    setVisible(true);
  };
  const closeModal = () => setVisible(false);

  const onDateChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') {
      if (event.type === 'set' && selected) setField('date', selected);
      setShowDatePicker(false);
    } else if (selected) {
      setField('date', selected);
    }
  };

  // ---------- save single entry ----------
  const submit = async () => {
    Keyboard.dismiss();
    if (!validate()) return;
    try {
      setSubmitting(true);
      const payload = {
        date: form.date.toISOString(),
        inspectors: form.inspectors.trim(),
        purpose: form.purpose.trim(),
        observations: form.observations.trim() || undefined,
        recommendations: form.recommendations.trim() || undefined,
        signature: form.signature.trim() || undefined,
        serialNo: form.serialNo.trim() || undefined,
        createdAt: serverTimestamp(),
      };
      await push(dbRef(database, 'inspectionRegister'), payload);
      setSnack({ visible: true, msg: 'Entry saved successfully' });
      closeModal();
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to save entry. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ---------- load entries (handle legacy "entries" array & new single-entry nodes) ----------
  useEffect(() => {
    const r = dbRef(database, 'inspectionRegister');
    const cb = (snap: any) => {
      const raw = snap.val();
      const acc: Entry[] = [];
      if (raw && typeof raw === 'object') {
        Object.entries(raw).forEach(([id, v]: any) => {
          if (v?.entries && Array.isArray(v.entries)) {
            v.entries.forEach((en: any, idx: number) => {
              acc.push({
                id: `${id}_${idx}`,
                date: en.date,
                inspectors: en.inspectors ?? '',
                purpose: en.purpose ?? '',
                observations: en.observations ?? '',
                recommendations: en.recommendations ?? '',
                signature: en.signature ?? '',
                serialNo: en.serialNo ?? '',
                createdAt: v?.createdAt ?? '',
              });
            });
          } else {
            acc.push({
              id,
              date: v?.date,
              inspectors: v?.inspectors ?? '',
              purpose: v?.purpose ?? '',
              observations: v?.observations ?? '',
              recommendations: v?.recommendations ?? '',
              signature: v?.signature ?? '',
              serialNo: v?.serialNo ?? '',
              createdAt: v?.createdAt ?? '',
            });
          }
        });
      }
      acc.sort((a, b) => {
        const ta = Date.parse(a.date || '');
        const tb = Date.parse(b.date || '');
        if (isNaN(ta) && isNaN(tb)) return 0;
        if (isNaN(ta)) return 1;
        if (isNaN(tb)) return -1;
        return tb - ta;
      });
      setEntries(acc);
      setLoading(false);
    };
    onValue(r, cb, (e) => {
      console.error(e);
      setLoading(false);
      setSnack({ visible: true, msg: 'Failed to load entries. Please try again.' });
    });
    return () => off(r, 'value', cb);
  }, []);

  const empty = !loading && entries.length === 0;

  const headerSubtitle = useMemo(
    () => (entries.length === 1 ? '1 entry' : `${entries.length} entries`),
    [entries.length]
  );

  const RenderItem = useCallback(
    ({ item }: { item: Entry }) => (
      <Card style={styles.itemCard} mode="elevated" elevation={1}>
        {/* subtle top gradient accent */}
        <LinearGradient
          colors={[COLORS.brand1, COLORS.brand2]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.cardAccent}
        />
        <Card.Content style={styles.itemRow}>
          <View style={styles.itemLeft}>
            <View style={styles.serialPill}>
              <Feather name="hash" size={12} color={COLORS.brand1} />
              <Text style={styles.serialText}>{item.serialNo || '—'}</Text>
            </View>
            <Text style={styles.itemTitle} numberOfLines={1}>
              {item.inspectors || 'Unnamed inspectors'}
            </Text>
            <Text style={styles.itemSubtitle} numberOfLines={2}>
              {item.purpose || '—'}
            </Text>
          </View>

          <View style={styles.itemRight}>
            <Text style={styles.dateText}>{formatDate(item.date)}</Text>
            <View style={styles.tag}>
              <Feather name="clipboard" size={12} color={COLORS.brand1} />
              <Text style={styles.tagText}>Inspection</Text>
            </View>
          </View>
        </Card.Content>

        {(item.observations || item.recommendations) && (
          <>
            <Divider style={{ backgroundColor: COLORS.slate100, marginVertical: 8 }} />
            <Card.Content style={styles.itemExtra}>
              {item.observations ? (
                <View style={styles.extraRow}>
                  <Feather name="eye" size={14} color={COLORS.slate600} style={styles.extraIcon} />
                  <Text style={styles.extraText} numberOfLines={3}>
                    <Text style={styles.extraLabel}>Observations: </Text>
                    {item.observations}
                  </Text>
                </View>
              ) : null}
              {item.recommendations ? (
                <View style={styles.extraRow}>
                  <Feather name="alert-circle" size={14} color={COLORS.slate600} style={styles.extraIcon} />
                  <Text style={styles.extraText} numberOfLines={3}>
                    <Text style={styles.extraLabel}>Recommendations: </Text>
                    {item.recommendations}
                  </Text>
                </View>
              ) : null}
            </Card.Content>
          </>
        )}
      </Card>
    ),
    []
  );

  return (
    <LinearGradient
      colors={[COLORS.gradientStart, COLORS.gradientMid, COLORS.gradientEnd]}
      style={styles.root}
    >
      <StatusBar style="light" />

      {/* Hero */}
      <LinearGradient
        colors={[COLORS.brand1, COLORS.brand2, COLORS.brand3]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.hero}
      >
        <View style={styles.heroRow}>
          <IconButton
            icon="arrow-left"
            size={22}
            onPress={() => router.back()}
            style={styles.backButton}
            iconColor={COLORS.white}
            accessibilityLabel="Go back"
          />
          <View>
            <Text style={styles.heroTitle}>Inspection Register</Text>
            <Text style={styles.heroSub}>{headerSubtitle}</Text>
          </View>
          <Badge style={styles.heroBadge}>LIVE</Badge>
        </View>

        <View style={styles.heroActions}>
          <Button
            mode="contained"
            icon="plus"
            onPress={openModal}
            style={styles.addButton}
            labelStyle={{ fontWeight: '800', color: COLORS.white }}
            contentStyle={styles.buttonContent}
          >
            Add Entry
          </Button>
        </View>
      </LinearGradient>

      {/* List */}
      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator animating color={COLORS.white} size="large" />
          <Text style={styles.loadingText}>Loading entries…</Text>
        </View>
      ) : empty ? (
        <View style={styles.centerFill}>
          <Feather name="inbox" size={46} color="rgba(255,255,255,0.8)" />
          <Text style={styles.emptyTitle}>No entries yet</Text>
          <Text style={styles.emptyText}>Tap "Add Entry" to record the first inspection.</Text>
          <Button 
            mode="contained" 
            onPress={openModal}
            style={styles.emptyButton}
            contentStyle={styles.buttonContent}
          >
            Create First Entry
          </Button>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(it) => it.id}
          contentContainerStyle={{ padding: 14, paddingBottom: 36 }}
          renderItem={RenderItem}
          ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Text style={styles.listHeader}>Swipe down to refresh</Text>
          }
        />
      )}

      {/* Modal: Single-entry form */}
      <Portal>
        <Modal
          visible={visible}
          onDismiss={closeModal}
          contentContainerStyle={styles.modalContainer}
        >
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <Card style={styles.modalCard} mode="elevated" elevation={4}>
              <LinearGradient
                colors={[COLORS.brand1, COLORS.brand2]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.modalHeader}
              >
                <Text style={styles.modalTitle}>New Inspection Entry</Text>
                <IconButton
                  icon="close"
                  onPress={closeModal}
                  accessibilityLabel="Close modal"
                  style={styles.modalClose}
                  iconColor={COLORS.white}
                />
              </LinearGradient>

              <Card.Content style={{ paddingTop: 16 }}>
                {/* Date */}
                <View style={styles.inputGroup}>
                  <View style={styles.labelRow}>
                    <Text style={styles.label}>
                      Date<Text style={styles.required}> *</Text>
                    </Text>
                    {errors.date ? <Text style={styles.errorBadge}>{errors.date}</Text> : null}
                  </View>
                  <Pressable
                    onPress={() => setShowDatePicker(true)}
                    style={({ pressed }) => [
                      styles.dateBtn,
                      pressed && { backgroundColor: COLORS.slate100 },
                    ]}
                  >
                    <Feather name="calendar" size={16} color={COLORS.brand1} />
                    <Text style={styles.dateBtnText}>{formatDate(form.date.toISOString())}</Text>
                    <Feather name="chevron-down" size={16} color={COLORS.brand1} />
                  </Pressable>
                  {showDatePicker && (
                    <DateTimePicker
                      value={form.date}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'inline' : 'default'}
                      onChange={onDateChange}
                      themeVariant="light"
                    />
                  )}
                  {errors.date ? <HelperText type="error" style={styles.helperText}>{errors.date}</HelperText> : null}
                </View>

                {/* Inspectors */}
                <View style={styles.inputGroup}>
                  <View style={styles.labelRow}>
                    <Text style={styles.label}>
                      Name of Inspectors<Text style={styles.required}> *</Text>
                    </Text>
                    {errors.inspectors ? (
                      <Text style={styles.errorBadge}>{errors.inspectors}</Text>
                    ) : null}
                  </View>
                  <TextInput
                    mode="outlined"
                    value={form.inspectors}
                    onChangeText={(t) => setField('inspectors', t)}
                    placeholder="e.g., J. Doe, A. Kato"
                    style={styles.input}
                    outlineStyle={styles.inputOutline}
                    dense
                    error={!!errors.inspectors}
                  />
                  {errors.inspectors ? <HelperText type="error" style={styles.helperText}>{errors.inspectors}</HelperText> : null}
                </View>

                {/* Purpose */}
                <View style={styles.inputGroup}>
                  <View style={styles.labelRow}>
                    <Text style={styles.label}>
                      Purpose of Inspection<Text style={styles.required}> *</Text>
                    </Text>
                    {errors.purpose ? (
                      <Text style={styles.errorBadge}>{errors.purpose}</Text>
                    ) : null}
                  </View>
                  <TextInput
                    mode="outlined"
                    value={form.purpose}
                    onChangeText={(t) => setField('purpose', t)}
                    placeholder="Routine / Compliance / Follow-up"
                    style={styles.input}
                    outlineStyle={styles.inputOutline}
                    dense
                    error={!!errors.purpose}
                  />
                  {errors.purpose ? <HelperText type="error" style={styles.helperText}>{errors.purpose}</HelperText> : null}
                </View>

                {/* Observations */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Observations</Text>
                  <TextInput
                    mode="outlined"
                    value={form.observations}
                    onChangeText={(t) => setField('observations', t)}
                    placeholder="Key findings…"
                    style={[styles.input, styles.multi]}
                    outlineStyle={styles.inputOutline}
                    multiline
                    numberOfLines={4}
                    dense
                  />
                </View>

                {/* Recommendations */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Recommendations</Text>
                  <TextInput
                    mode="outlined"
                    value={form.recommendations}
                    onChangeText={(t) => setField('recommendations', t)}
                    placeholder="Actions to take…"
                    style={[styles.input, styles.multi]}
                    outlineStyle={styles.inputOutline}
                    multiline
                    numberOfLines={4}
                    dense
                  />
                </View>

                {/* Signature / Serial */}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.label}>Signature</Text>
                    <TextInput
                      mode="outlined"
                      value={form.signature}
                      onChangeText={(t) => setField('signature', t)}
                      placeholder="Name / Sign"
                      style={styles.input}
                      outlineStyle={styles.inputOutline}
                      dense
                    />
                  </View>
                  <View style={[styles.inputGroup, { width: 120 }]}>
                    <Text style={styles.label}>Serial No.</Text>
                    <TextInput
                      mode="outlined"
                      value={form.serialNo}
                      onChangeText={(t) => setField('serialNo', t)}
                      placeholder="001"
                      style={styles.input}
                      outlineStyle={styles.inputOutline}
                      dense
                    />
                  </View>
                </View>
              </Card.Content>

              <Card.Actions style={styles.modalActions}>
                <Button mode="outlined" onPress={closeModal} disabled={submitting} style={styles.cancelButton}>
                  Cancel
                </Button>
                <Button
                  mode="contained"
                  icon={submitting ? undefined : 'check-circle'}
                  onPress={submit}
                  loading={submitting}
                  disabled={submitting}
                  style={styles.ctaBtn}
                  contentStyle={styles.buttonContent}
                  labelStyle={{ fontWeight: '800' }}
                >
                  {submitting ? 'Saving…' : 'Save Entry'}
                </Button>
              </Card.Actions>
            </Card>
          </KeyboardAvoidingView>
        </Modal>
      </Portal>

      <Snackbar
        visible={snack.visible}
        onDismiss={() => setSnack({ visible: false, msg: '' })}
        duration={3000}
        style={{ marginBottom: 16, backgroundColor: COLORS.slate900 }}
        action={{
          label: 'Dismiss',
          onPress: () => setSnack({ visible: false, msg: '' }),
        }}
      >
        {snack.msg}
      </Snackbar>
    </LinearGradient>
  );
}

/* ---------------- styles ---------------- */
const styles = StyleSheet.create({
  root: { flex: 1 },

  hero: {
    paddingTop: Platform.OS === 'ios' ? 56 : 36,
    paddingBottom: 20,
    paddingHorizontal: 16,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  heroRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    marginTop: 10,
    marginBottom: 12,
  },
  backButton: { 
    backgroundColor: 'rgba(255,255,255,0.18)', 
    borderRadius: 12, 
    margin: 0,
  },
  heroTitle: { 
    color: COLORS.white, 
    fontWeight: '900', 
    fontSize: 22, 
    letterSpacing: 0.2,
  },
  heroSub: { 
    color: 'rgba(255,255,255,0.95)', 
    marginTop: 4, 
    fontSize: 13, 
    fontWeight: '600',
  },
  heroBadge: {
    backgroundColor: 'rgba(255,255,255,0.20)',
    color: COLORS.white,
    marginRight: 2,
    borderRadius: 10,
    paddingHorizontal: 8,
  },
  heroActions: { 
    flexDirection: 'row', 
    justifyContent: 'flex-end',
  },
  addButton: {
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  buttonContent: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },

  centerFill: { 
    flex: 1, 
    alignItems: 'center', 
    justifyContent: 'center', 
    padding: 20,
  },
  loadingText: { 
    color: COLORS.white, 
    marginTop: 16, 
    opacity: 0.9,
    fontSize: 16,
  },
  emptyTitle: { 
    color: COLORS.white, 
    fontWeight: '900', 
    fontSize: 20, 
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: { 
    color: 'rgba(255,255,255,0.9)', 
    textAlign: 'center', 
    marginBottom: 20,
    fontSize: 15,
  },
  emptyButton: {
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },

  listHeader: {
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    marginBottom: 8,
    fontSize: 12,
    fontStyle: 'italic',
  },

  itemCard: {
    borderRadius: 16,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.slate200,
    overflow: 'hidden',
    shadowColor: COLORS.slate900,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  cardAccent: { height: 4, width: '100%' },

  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 16,
  },
  itemLeft: { flex: 1, paddingRight: 12 },
  serialPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.slate200,
  },
  serialText: { 
    color: COLORS.brand1, 
    fontWeight: '900', 
    fontSize: 13, 
    marginLeft: 6,
  },
  itemTitle: { 
    fontSize: 17, 
    fontWeight: '900', 
    color: COLORS.slate900,
    marginBottom: 4,
  },
  itemSubtitle: { 
    fontSize: 14, 
    color: COLORS.slate600,
    lineHeight: 20,
  },

  itemRight: { 
    alignItems: 'flex-end', 
    gap: 10,
  },
  dateText: { 
    color: COLORS.slate500, 
    fontSize: 13, 
    fontWeight: '600',
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(79,70,229,0.08)',
    borderColor: 'rgba(79,70,229,0.25)',
    borderWidth: 1,
  },
  tagText: { 
    color: COLORS.brand1, 
    fontWeight: '900', 
    fontSize: 12,
  },

  itemExtra: {
    paddingTop: 0,
    paddingBottom: 16,
  },
  extraRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  extraIcon: {
    marginTop: 2,
    marginRight: 8,
  },
  extraLabel: {
    fontWeight: '800',
    color: COLORS.slate700,
  },
  extraText: {
    color: COLORS.slate600,
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },

  modalContainer: { 
    padding: 16,
    marginHorizontal: Platform.OS === 'web' ? '20%' : 0,
  },
  modalCard: {
    borderRadius: 20,
    backgroundColor: COLORS.white,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.slate200,
    maxHeight: '90%',
  },
  modalHeader: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  modalTitle: { 
    color: COLORS.white, 
    fontWeight: '900', 
    fontSize: 18,
  },
  modalClose: { 
    position: 'absolute', 
    right: 4, 
    top: 4,
  },

  inputGroup: { 
    marginBottom: 16,
  },
  labelRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    marginBottom: 6,
  },
  label: { 
    fontWeight: '800', 
    color: COLORS.slate700,
    fontSize: 15,
  },
  required: { 
    color: COLORS.danger,
  },
  errorBadge: { 
    color: COLORS.danger, 
    fontWeight: '800', 
    fontSize: 12,
  },
  helperText: {
    fontSize: 12,
    marginTop: 4,
  },

  input: { 
    backgroundColor: COLORS.white, 
    fontSize: 15,
  },
  inputOutline: { 
    borderRadius: 12, 
    borderWidth: 1.5, 
    borderColor: COLORS.slate200,
  },
  multi: { 
    minHeight: 90, 
    textAlignVertical: 'top',
  },

  dateBtn: {
    height: 50,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.brand1,
    backgroundColor: COLORS.white,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dateBtnText: { 
    color: COLORS.brand1, 
    fontWeight: '800', 
    flex: 1,
    fontSize: 15,
  },

  modalActions: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    justifyContent: 'flex-end',
    gap: 12,
  },
  cancelButton: {
    borderRadius: 10,
    borderColor: COLORS.slate400,
  },
  ctaBtn: {
    borderRadius: 10,
    backgroundColor: COLORS.brand1,
  },
});