// app/releaseform.tsx
import { database } from '@/firebase';
import { Feather } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { get, push, ref, update } from 'firebase/database';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
import {
  Button,
  Card,
  Checkbox,
  HelperText,
  IconButton,
  Text,
  TextInput
} from 'react-native-paper';

type FormData = {
  date: Date;
  clientName: string;
  telephone: string;
  releasedBy: string;
  comment: string;
  boxesReleased: string;
};

type Inspection = {
  boxesImpounded?: number | string;
  status?: string;
  serialNumber?: string;
  drugshopName?: string;
};

const COLORS = {
  bg: '#F9FAFB',
  surface: '#FFFFFF',
  border: '#E5E7EB',
  divider: '#E5E7EB',
  primary: '#1E40AF',
  body: '#0F172A',
  sub: '#475569',
  mut: '#64748B',
  danger: '#DC2626',
  good: '#16A34A',
};

// ⚠️ For production, move this to secure config/env.
const YOOLA_API_KEY = 'xgpYr222zWMD4w5VIzUaZc5KYO5L1w8N38qBj1qPflwguq9PdJ545NTCSLTS7H00';

const parseNumber = (n: unknown) => {
  if (typeof n === 'number') return Number.isFinite(n) ? n : 0;
  if (typeof n === 'string') {
    const x = Number(n);
    return Number.isFinite(x) ? x : 0;
  }
  return 0;
};

// --- NEW: helper to send release SMS
async function sendReleaseSms(opts: {
  phone: string;
  drugshopName?: string;
  serial?: string;
  boxesReleased: number;
  boxesRemaining: number;
  dateIso: string;
  releasedBy: string;
}) {
  const when = new Date(opts.dateIso);
  const whenStr = isNaN(when.getTime())
    ? opts.dateIso
    : when.toLocaleString('en-UG', {
        year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit'
      });

  const msg =
    `Dear ${opts.drugshopName || 'Drugshop'}, ` +
    `${opts.boxesReleased} box(es) have been released on ${whenStr}. ` +
    `Serial: ${opts.serial || '—'}. ` +
    `Remaining: ${opts.boxesRemaining}. ` +
    `Officer: ${opts.releasedBy}.`;

  const res = await fetch('https://yoolasms.com/api/v1/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phone: opts.phone,    // single number; you can pass comma-separated if needed
      message: msg,
      api_key: YOOLA_API_KEY,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`SMS failed (${res.status}): ${text || 'Unknown error'}`);
  }
  return res.json().catch(() => ({}));
}

const ReleaseFormScreen: React.FC = () => {
  const router = useRouter();
  const auth = getAuth();

  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const inspectionId = Array.isArray(params.id) ? params.id?.[0] : params.id ?? '';

  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    date: new Date(),
    clientName: '',
    telephone: '',
    releasedBy: '',
    comment: '',
    boxesReleased: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);

  // For confirmation
  const [ack1, setAck1] = useState(false);
  const [ack2, setAck2] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  // Minimal inspection info for summary + confirmation
  const [inspLoading, setInspLoading] = useState(true);
  const [insp, setInsp] = useState<Inspection | null>(null);

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


  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!inspectionId) {
        setInspLoading(false);
        return;
      }
      try {
        const snap = await get(ref(database, `inspections/${inspectionId}`));
        if (!mounted) return;
        setInsp(snap.exists() ? (snap.val() as Inspection) : null);
      } catch {
        if (mounted) setInsp(null);
      } finally {
        if (mounted) setInspLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [inspectionId]);

  const formatDate = (date: Date) =>
    date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  const handleChange = <K extends keyof FormData>(name: K, value: FormData[K]) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name as string]) setErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const validateTelephone = (phone: string) => /^(\+?\d{7,15})$/.test(phone.replace(/\s+/g, ''));

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.date) newErrors.date = 'Date is required';
    if (!formData.clientName.trim()) newErrors.clientName = 'Client name is required';
    if (!formData.telephone.trim()) newErrors.telephone = 'Telephone number is required';
    else if (!validateTelephone(formData.telephone)) newErrors.telephone = 'Enter a valid phone number';
    if (!formData.releasedBy.trim()) newErrors.releasedBy = 'Released by field is required';
    const boxes = parseInt(formData.boxesReleased, 10);
    if (!formData.boxesReleased || Number.isNaN(boxes) || boxes <= 0) {
      newErrors.boxesReleased = 'Valid number of boxes is required';
    }
    if (!inspectionId) newErrors.inspectionId = 'Missing inspection reference. Re-open this form from an inspection.';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const onDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      if (event.type === 'set' && selectedDate) handleChange('date', selectedDate);
      setShowDatePicker(false);
    } else {
      if (selectedDate) handleChange('date', selectedDate);
    }
  };

  const canConfirm = useMemo(() => {
    const typed = confirmText.trim();
    const serial = (insp?.serialNumber || '').trim();
    const okTyped = typed.toUpperCase() === 'RELEASE' || (!!serial && typed.toLowerCase() === serial.toLowerCase());
    return ack1 && ack2 && okTyped;
  }, [ack1, ack2, confirmText, insp?.serialNumber]);

  const handleSubmit = async () => {
    if (!validateForm()) return;
    if (!canConfirm) {
      Alert.alert('Confirmation required', 'Complete the acknowledgements and type RELEASE or the serial number.');
      return;
    }

    setLoading(true);
    try {
      // 1) Get the current inspection (fresh)
      const inspRef = ref(database, `inspections/${inspectionId}`);
      const inspSnap = await get(inspRef);
      if (!inspSnap.exists()) {
        Alert.alert('Not found', 'The linked inspection no longer exists.');
        setLoading(false);
        return;
      }
      const current = inspSnap.val() as Inspection;
      const currentBoxes = parseNumber(current.boxesImpounded);
      const releaseCount = parseInt(formData.boxesReleased, 10);

      if (releaseCount > currentBoxes) {
        Alert.alert(
          'Invalid quantity',
          `You are releasing ${releaseCount} boxes, but only ${currentBoxes} are impounded.`
        );
        setLoading(false);
        return;
      }

      const remaining = Math.max(0, currentBoxes - releaseCount);

      // 2) Write release record under releases/{inspectionId}
      const releaseRef = ref(database, `releases/${inspectionId}`);
      const releasePayload = {
        inspectionId,
        date: formData.date.toISOString(),
        clientName: formData.clientName.trim(),
        telephone: formData.telephone.replace(/\s+/g, ''),
        releasedBy: formData.releasedBy.trim(),
        comment: formData.comment.trim(),
        boxesReleased: releaseCount,
        createdAt: new Date().toISOString(),
        createdByUid: auth.currentUser?.uid ?? 'anonymous',
        createdByEmail: auth.currentUser?.email ?? null,
        createdByName: auth.currentUser?.displayName ?? null,
      };
      await push(releaseRef, releasePayload);

      // 3) Update inspection (boxes + status + release stamps)
      const isStringType = typeof current.boxesImpounded === 'string';
      const nextStatus = remaining === 0 ? 'Completed' : 'Pending Review';

      await update(inspRef, {
        boxesImpounded: isStringType ? String(remaining) : remaining,
        status: nextStatus,
        releasedAt: Date.now(),
        releasedBy: auth.currentUser?.uid ?? 'anonymous',
        releasedByEmail: auth.currentUser?.email ?? null,
        releasedByName: auth.currentUser?.displayName ?? null,
        lastReleaseNote: formData.comment.trim() || null,
        lastReleaseCount: releaseCount,
      });

      // 4) 🔔 Send SMS to owner (telephone field)
      let smsMsg = 'Release submitted.';
      try {
        await sendReleaseSms({
          phone: formData.telephone.replace(/\s+/g, ''),
          drugshopName: current.drugshopName,
          serial: current.serialNumber,
          boxesReleased: releaseCount,
          boxesRemaining: remaining,
          dateIso: formData.date.toISOString(),
          releasedBy: formData.releasedBy.trim(),
        });

        // If you want to persist audit flags:
        // await update(inspRef, { lastReleaseSmsAt: Date.now(), lastReleaseSmsOk: true });

        smsMsg = 'Release submitted and SMS sent to the owner.';
      } catch (smsErr: any) {
        console.log('Release SMS error:', smsErr?.message || smsErr);
        // If you want to persist audit flags:
        // await update(inspRef, { lastReleaseSmsAt: Date.now(), lastReleaseSmsOk: false, lastReleaseSmsError: String(smsErr?.message || smsErr) });
        smsMsg = 'Release submitted. SMS delivery failed, please notify the owner manually.';
      }

      Alert.alert('Success', `${smsMsg}\nStatus set to “${nextStatus}”.`, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error) {
      console.error('Error submitting release form:', error);
      Alert.alert('Error', 'Failed to submit release form. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.fill, { backgroundColor: COLORS.bg }]}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.header}>
            <IconButton
              icon="arrow-left"
              size={22}
              onPress={() => router.back()}
              style={styles.backButton}
              accessibilityLabel="Go back"
            />
            <View>
              <Text style={styles.headerTitle}>Release Form</Text>
              {inspLoading ? (
                <Text style={styles.headerSub}>Loading inspection…</Text>
              ) : insp ? (
                <Text style={styles.headerSub}>
                  Serial: {insp.serialNumber || '—'} • Impounded: {parseNumber(insp.boxesImpounded)}
                </Text>
              ) : (
                <Text style={[styles.headerSub, { color: COLORS.danger }]}>Inspection not found</Text>
              )}
            </View>
            <View style={{ width: 44 }} />
          </View>

          {/* Missing inspection warning */}
          {errors.inspectionId ? (
            <Card mode="outlined" elevation={0} style={[styles.card, { borderColor: COLORS.danger }]}>
              <View style={styles.cardContent}>
                <Text style={{ color: COLORS.danger }}>{errors.inspectionId}</Text>
              </View>
            </Card>
          ) : null}

          {/* Form */}
          <Card mode="outlined" elevation={0} style={styles.card}>
            <View style={styles.cardContent}>
              {/* Date */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>
                  Date<Text style={styles.required}> *</Text>
                </Text>
                <Pressable
                  onPress={() => setShowDatePicker(true)}
                  style={({ pressed }) => [styles.dateBtn, pressed && { transform: [{ scale: 0.997 }] }]}
                >
                  <Feather name="calendar" size={16} color={COLORS.primary} />
                  <Text style={styles.dateBtnText}>{formatDate(formData.date)}</Text>
                </Pressable>
                {errors.date ? <HelperText type="error" style={styles.errorText}>{errors.date}</HelperText> : null}
                {showDatePicker && (
                  <DateTimePicker
                    value={formData.date}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'inline' : 'default'}
                    onChange={onDateChange}
                  />
                )}
              </View>

              {/* Client Name */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>
                  Client Name<Text style={styles.required}> *</Text>
                </Text>
                <TextInput
                  mode="outlined"
                  value={formData.clientName}
                  onChangeText={(t) => handleChange('clientName', t)}
                  error={!!errors.clientName}
                  style={styles.input}
                  outlineStyle={styles.inputOutline}
                  autoCapitalize="words"
                  left={<TextInput.Icon icon={() => <Feather name="user" size={18} color={COLORS.primary} />} />}
                  theme={{ colors: { primary: COLORS.primary, outline: COLORS.border } }}
                />
                {errors.clientName ? <HelperText type="error" style={styles.errorText}>{errors.clientName}</HelperText> : null}
              </View>

              {/* Telephone */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>
                  Telephone Number<Text style={styles.required}> *</Text>
                </Text>
                <TextInput
                  mode="outlined"
                  value={formData.telephone}
                  onChangeText={(t) => handleChange('telephone', t)}
                  error={!!errors.telephone}
                  keyboardType="phone-pad"
                  style={styles.input}
                  outlineStyle={styles.inputOutline}
                  autoComplete="tel"
                  left={<TextInput.Icon icon={() => <Feather name="phone" size={18} color={COLORS.primary} />} />}
                  theme={{ colors: { primary: COLORS.primary, outline: COLORS.border } }}
                />
                {errors.telephone ? <HelperText type="error" style={styles.errorText}>{errors.telephone}</HelperText> : null}
              </View>

              {/* Released By */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>
                  Released By<Text style={styles.required}> *</Text>
                </Text>
                <TextInput
                  mode="outlined"
                  value={formData.releasedBy}
                  onChangeText={(t) => handleChange('releasedBy', t)}
                  error={!!errors.releasedBy}
                  style={styles.input}
                  outlineStyle={styles.inputOutline}
                  autoCapitalize="words"
                  left={<TextInput.Icon icon={() => <Feather name="user-check" size={18} color={COLORS.primary} />} />}
                  theme={{ colors: { primary: COLORS.primary, outline: COLORS.border } }}
                />
                {errors.releasedBy ? <HelperText type="error" style={styles.errorText}>{errors.releasedBy}</HelperText> : null}
              </View>

              {/* Boxes Released */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>
                  Number of Boxes Released<Text style={styles.required}> *</Text>
                </Text>
                <TextInput
                  mode="outlined"
                  value={formData.boxesReleased}
                  onChangeText={(t) => handleChange('boxesReleased', t.replace(/[^\d]/g, ''))}
                  error={!!errors.boxesReleased}
                  keyboardType="numeric"
                  style={styles.input}
                  outlineStyle={styles.inputOutline}
                  left={<TextInput.Icon icon={() => <Feather name="package" size={18} color={COLORS.primary} />} />}
                  theme={{ colors: { primary: COLORS.primary, outline: COLORS.border } }}
                />
                {errors.boxesReleased ? <HelperText type="error" style={styles.errorText}>{errors.boxesReleased}</HelperText> : null}
                {!!insp && (
                  <Text style={styles.hint}>Available: {parseNumber(insp.boxesImpounded)} box(es)</Text>
                )}
              </View>

              {/* Comment */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Comment</Text>
                <TextInput
                  mode="outlined"
                  value={formData.comment}
                  onChangeText={(t) => handleChange('comment', t)}
                  multiline
                  numberOfLines={4}
                  style={[styles.input, styles.textArea]}
                  outlineStyle={styles.inputOutline}
                  left={<TextInput.Icon icon={() => <Feather name="message-square" size={18} color={COLORS.primary} />} />}
                  theme={{ colors: { primary: COLORS.primary, outline: COLORS.border } }}
                />
              </View>
            </View>
          </Card>

          {/* Confirmation block */}
          <Card mode="outlined" elevation={0} style={styles.card}>
            <View style={styles.cardContent}>
                <Text style={styles.sectionTitle}>Confirm Release</Text>
                <View style={{ height: 6 }} />

                <Checkbox.Item
                  status={ack1 ? 'checked' : 'unchecked'}
                  onPress={() => setAck1((s) => !s)}
                  label="I have verified and counted the items with the facility representative."
                  position="leading"
                  labelVariant="bodySmall"
                  labelStyle={{ color: COLORS.good }}
                />
                <Checkbox.Item
                  status={ack2 ? 'checked' : 'unchecked'}
                  onPress={() => setAck2((s) => !s)}
                  label="I accept responsibility and a handover record will be kept."
                  position="leading"
                  labelVariant="bodySmall"
                  labelStyle={{ color: COLORS.good }}
                />

                <TextInput
                  mode="outlined"
                  value={confirmText}
                  onChangeText={setConfirmText}
                  autoCapitalize="characters"
                  style={[styles.input, { marginTop: 6 }]}
                  outlineStyle={styles.inputOutline}
                  label={`Type RELEASE${insp?.serialNumber ? ` or ${insp.serialNumber}` : ''}`}
                  theme={{ colors: { primary: COLORS.primary, outline: COLORS.border } }}
                />
              {!canConfirm && (
                <Text style={{ color: COLORS.mut, fontSize: 12, marginTop: 6 }}>
                  Complete both checkboxes and type <Text style={{ fontWeight: '700' }}>RELEASE</Text>
                  {insp?.serialNumber ? ` or ${insp.serialNumber}` : ''} to enable submission.
                </Text>
              )}
            </View>
          </Card>

          {/* Actions */}
          <View style={styles.actions}>
            <Button
              mode="outlined"
              onPress={() => router.back()}
              style={[styles.btn, styles.btnOutline]}
              disabled={loading}
              labelStyle={{ color: COLORS.primary, fontWeight: '800' }}
            >
              Cancel
            </Button>

            <Button
              mode="contained"
              onPress={handleSubmit}
              disabled={loading || !canConfirm}
              loading={loading}
              style={[styles.btn, styles.btnPrimary]}
              labelStyle={{ color: '#fff', fontWeight: '800' }}
              icon="check-circle"
            >
              Submit Release
            </Button>
          </View>

          <Text style={styles.footerNote}>
            Fields marked with <Text style={styles.required}>*</Text> are required
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { paddingHorizontal: 14, paddingBottom: 28 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingBottom: 10,
  },
  backButton: {
    backgroundColor: '#DBEAFE',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  headerTitle: { fontWeight: '800', color: COLORS.primary, letterSpacing: 0.2, fontSize: 20 },
  headerSub: { color: COLORS.sub, fontSize: 12, marginTop: 2 },

  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
  },
  cardContent: { padding: 14 },

  inputGroup: { marginBottom: 14 },
  label: { marginBottom: 8, fontWeight: '700', color: COLORS.body },
  required: { color: COLORS.danger },
  input: { backgroundColor: COLORS.surface, fontSize: 16 },
  inputOutline: { borderRadius: 12, borderWidth: 1.2, borderColor: COLORS.border },
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  errorText: { fontSize: 13, marginTop: 4 },
  dateBtn: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateBtnText: { color: COLORS.primary, fontWeight: '700' },
  hint: { color: COLORS.mut, fontSize: 12, marginTop: 6 },

  sectionTitle: { color: COLORS.body, fontWeight: '800', fontSize: 16 },

  actions: { flexDirection: 'row', gap: 10, marginTop: 4, marginBottom: 18 },
  btn: { flex: 1, borderRadius: 12, paddingVertical: 4 },
  btnPrimary: { backgroundColor: COLORS.primary, elevation: 0 },
  btnOutline: { borderColor: COLORS.primary, backgroundColor: COLORS.surface },

  footerNote: { textAlign: 'center', marginTop: 6, color: COLORS.mut, fontSize: 12, marginBottom: 40 },
});

export default ReleaseFormScreen;
