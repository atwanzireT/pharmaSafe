// app/inspection-form.tsx  — Lightweight & Smooth Scroll
import { auth, database } from '@/firebase';
import { Feather } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { push, ref } from 'firebase/database';
import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
import {
  ActivityIndicator,
  Divider,
  HelperText,
  Switch,
  Text,
  TextInput,
} from 'react-native-paper';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// TODO: move to secure config / server
const YOOLA_API_KEY = 'xgpYr222zWMD4w5VIzUaZc5KYO5L1w8N38qBj1qPflwguq9PdJ545NTCSLTS7H00';

const COLORS = {
  bg: '#F9FAFB',
  white: '#FFFFFF',
  border: '#E5E7EB',
  textPrimary: '#1E40AF',
  textBody: '#334155',
  slate600: '#475569',
  slate500: '#64748B',
  slate400: '#94A3B8',
  success: '#16A34A',
  danger: '#B91C1C',
};

type Coords = { latitude: number; longitude: number } | null;

const phoneTokenRe = /^\+?\d{7,15}$/;

function normalizePhones(raw: string): string[] {
  return raw.split(',').map(p => p.trim()).filter(Boolean);
}
function validatePhones(raw: string): string | null {
  const tokens = normalizePhones(raw);
  if (tokens.length === 0) return 'Enter at least one phone number';
  for (const t of tokens) if (!phoneTokenRe.test(t)) return `Invalid phone: ${t}`;
  return null;
}

const InspectionForm = () => {
  const router = useRouter();

  const [formData, setFormData] = useState({
    date: new Date(),
    serialNumber: '',
    drugshopName: '',
    clientTelephone: '',
    drugshopContactPhones: '',
    boxesImpounded: '',
    impoundedBy: '',
    location: null as Coords,
    locationAddress: '',
    sendSms: true,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);

  // Memoized Paper input theme (was recreated on every render)
  const inputTheme = useMemo(
    () => ({
      roundness: 12,
      colors: {
        primary: COLORS.textPrimary,
        background: COLORS.white,
        surface: COLORS.white,
        outline: COLORS.border,
        onSurface: '#0F172A',
        onSurfaceVariant: COLORS.slate500,
        placeholder: '#334155',
      },
    }),
    []
  );

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user || !user.uid) {
        router.replace('/login');
        return;
      }
      setAuthChecking(false);
    });
    return unsub;
  }, [router]);

  const formatAddress = (address?: Partial<Location.LocationGeocodedAddress>) =>
    !address
      ? ''
      : [address.name, address.street, address.city || address.district, address.region, address.country]
          .filter(Boolean)
          .join(', ');

  const handleChange = useCallback((name: string, value: any) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => (prev[name] ? { ...prev, [name]: '' } : prev));
  }, []);

  const validateForm = useCallback(() => {
    const req = ['serialNumber', 'drugshopName', 'boxesImpounded', 'impoundedBy', 'location'] as const;
    const next: Record<string, string> = {};
    let ok = true;

    req.forEach((key) => {
      // @ts-ignore
      if (!formData[key]) { next[key] = 'This field is required'; ok = false; }
    });

    if (formData.clientTelephone && !phoneTokenRe.test(formData.clientTelephone.trim())) {
      next.clientTelephone = 'Enter a valid phone number';
      ok = false;
    }

    if (formData.boxesImpounded && !/^\d+$/.test(formData.boxesImpounded.trim())) {
      next.boxesImpounded = 'Enter a valid number';
      ok = false;
    }

    const boxesNum = Number(formData.boxesImpounded || '0') || 0;
    if (formData.sendSms && boxesNum > 0) {
      const err = validatePhones(formData.drugshopContactPhones || '');
      if (err) { next.drugshopContactPhones = err; ok = false; }
    }

    setErrors(next);
    return ok;
  }, [formData]);

  const captureLocation = useCallback(async () => {
    try {
      setIsLocating(true);

      // Request when needed (lighter on mount)
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission required',
          'Enable location permissions in settings to use this feature.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Location.openSettings() },
          ]
        );
        return;
      }

      const loc = await Location.getCurrentPositionAsync({
        // Balanced for speed vs precision (lighter than High)
        accuracy: Location.Accuracy.Balanced,
        maximumAge: 10_000,
      });

      const geo = await Location.reverseGeocodeAsync({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });

      handleChange('location', { latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      handleChange('locationAddress', formatAddress(geo[0]));
    } catch (e) {
      Alert.alert('Location error', 'Could not determine your location. Try again.');
    } finally {
      setIsLocating(false);
    }
  }, [handleChange]);

  async function sendImpoundSms(
    phonesCsv: string,
    payload: {
      serialNumber: string;
      drugshopName: string;
      boxesImpounded: string;
      dateIso: string;
      impoundedBy: string;
    }
  ) {
    const dt = new Date(payload.dateIso);
    const when = isNaN(dt.getTime())
      ? payload.dateIso
      : dt.toLocaleString('en-UG', {
          year: 'numeric',
          month: 'short',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });

    const msg =
      `Dear ${payload.drugshopName || 'Drugshop'}, ` +
      `${payload.boxesImpounded} box(es) were impounded on ${when}. ` +
      `Serial: ${payload.serialNumber}. Officer: ${payload.impoundedBy}.`;

    const res = await fetch('https://yoolasms.com/api/v1/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: phonesCsv,
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

  const resetForm = useCallback(() => {
    setFormData({
      date: new Date(),
      serialNumber: '',
      drugshopName: '',
      clientTelephone: '',
      drugshopContactPhones: '',
      boxesImpounded: '',
      impoundedBy: '',
      location: null,
      locationAddress: '',
      sendSms: true,
    });
    setErrors({});
  }, []);

  const handleDateChange = useCallback((_: any, selected?: Date) => {
    setShowDatePicker(false);
    if (selected) handleChange('date', selected);
  }, [handleChange]);

  const handleSubmit = useCallback(async () => {
    Keyboard.dismiss();
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      const data = {
        date: formData.date.toISOString(),
        serialNumber: formData.serialNumber.trim(),
        drugshopName: formData.drugshopName.trim(),
        drugshopContactPhones: formData.drugshopContactPhones.trim(),
        boxesImpounded: formData.boxesImpounded.trim(),
        impoundedBy: formData.impoundedBy.trim(),
        location: formData.location
          ? {
              coordinates: {
                latitude: formData.location.latitude,
                longitude: formData.location.longitude,
              },
              formattedAddress: formData.locationAddress.trim(),
            }
          : null,
        status: 'submitted',
        createdAt: new Date().toISOString(),
        createdBy: auth.currentUser?.email || 'anonymous',
        smsAttempted: false,
        smsSuccess: false,
      };

      const inspectionsRef = ref(database, 'inspections');
      const newRef = await push(inspectionsRef, data);
      const boxesNum = Number(formData.boxesImpounded || '0') || 0;

      if (formData.sendSms && boxesNum > 0 && formData.drugshopContactPhones.trim()) {
        try {
          await sendImpoundSms(formData.drugshopContactPhones.trim(), {
            serialNumber: data.serialNumber,
            drugshopName: data.drugshopName,
            boxesImpounded: data.boxesImpounded,
            dateIso: data.date,
            impoundedBy: data.impoundedBy,
          });
          Alert.alert('Submitted', 'Report submitted and SMS sent.');
        } catch (smsErr: any) {
          console.log('SMS error:', smsErr?.message);
          Alert.alert('Submitted', 'Report submitted. SMS delivery failed, please retry later.');
        }
      } else {
        Alert.alert('Success', 'Inspection report submitted!');
      }

      resetForm();
    } catch (e) {
      Alert.alert('Submission failed', 'Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, resetForm, validateForm]);

  if (authChecking) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <Pressable onPress={Keyboard.dismiss} style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
          >
            {/* Header (lighter spacing & no animation) */}
            <View style={styles.header}>
              <View style={styles.logo}>
                <Feather name="clipboard" size={20} color={COLORS.textPrimary} />
              </View>
              <View>
                <Text variant="titleLarge" style={styles.headerTitle}>New Inspection</Text>
                <Text variant="bodyMedium" style={styles.headerSubtitle}>Fill out the form to submit</Text>
              </View>
            </View>

            <Section title="Inspection Details" icon="calendar">
              <DateField
                label="Inspection Date"
                value={formData.date}
                onPress={() => setShowDatePicker(true)}
                error={errors.date}
              />
              {showDatePicker && (
                <DateTimePicker
                  value={formData.date}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  onChange={handleDateChange}
                />
              )}

              <LocationField
                onCapture={captureLocation}
                isLocating={isLocating}
                location={formData.location}
                address={formData.locationAddress}
                error={errors.location}
              />
            </Section>

            <Section title="Drugshop Information" icon="home">
              <FormInput
                theme={inputTheme}
                label="Serial Number *"
                value={formData.serialNumber}
                onChangeText={(t: string) => handleChange('serialNumber', t)}
                icon="hash"
                error={errors.serialNumber}
                autoCapitalize="characters"
                autoCorrect={false}
              />
              <FormInput
                theme={inputTheme}
                label="Drugshop Name *"
                value={formData.drugshopName}
                onChangeText={(t: string) => handleChange('drugshopName', t)}
                icon="briefcase"
                error={errors.drugshopName}
                autoCorrect={false}
              />
              <FormInput
                theme={inputTheme}
                label="Drugshop Contact Phone(s) (comma-separated)"
                value={formData.drugshopContactPhones}
                onChangeText={(t: string) => handleChange('drugshopContactPhones', t)}
                icon="users"
                keyboardType="default"
                error={errors.drugshopContactPhones}
                placeholder="070..., +25670..., 25670..."
                autoCorrect={false}
              />
            </Section>

            <Section title="Impound Information" icon="package">
              <FormInput
                theme={inputTheme}
                label="Boxes Impounded *"
                value={formData.boxesImpounded}
                onChangeText={(t: string) => handleChange('boxesImpounded', t)}
                icon="package"
                keyboardType="numeric"
                error={errors.boxesImpounded}
              />
              <FormInput
                theme={inputTheme}
                label="Impounded By *"
                value={formData.impoundedBy}
                onChangeText={(t: string) => handleChange('impoundedBy', t)}
                icon="user"
                error={errors.impoundedBy}
                autoCorrect={false}
              />

              <View style={styles.rowSpace}>
                <Text style={{ color: COLORS.textBody, fontWeight: '700' }}>
                  Send SMS to Drugshop Contact on submit
                </Text>
                <Switch value={formData.sendSms} onValueChange={(v) => handleChange('sendSms', v)} />
              </View>
              <Text style={{ color: COLORS.slate500, marginTop: 4, fontSize: 12 }}>
                We’ll notify the contact if boxes are impounded (&gt; 0). Numbers can be comma-separated.
              </Text>
            </Section>

            {/* Actions */}
            <View style={styles.actions}>
              <Pressable onPress={resetForm} style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}>
                <Feather name="refresh-cw" size={18} color={COLORS.textPrimary} />
                <Text style={styles.secondaryBtnText}>Reset</Text>
              </Pressable>

              <Pressable
                onPress={handleSubmit}
                disabled={isSubmitting}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  pressed && styles.pressed,
                  isSubmitting && { opacity: 0.8 },
                ]}
              >
                {isSubmitting ? (
                  <View style={styles.btnRow}>
                    <ActivityIndicator color={COLORS.white} />
                    <Text style={styles.primaryBtnText}>Submitting…</Text>
                  </View>
                ) : (
                  <View style={styles.btnRow}>
                    <Text style={styles.primaryBtnText}>Submit Report</Text>
                    <Feather name="send" size={18} color={COLORS.white} />
                  </View>
                )}
              </Pressable>
            </View>

            <View style={{ height: 12 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Pressable>
  );
};

/* ---------- Reusable bits (memoized) ---------- */

const Section = memo(function Section({
  title,
  icon,
  children,
}: { title: string; icon: keyof typeof Feather.glyphMap; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Feather name={icon} size={16} color={COLORS.textPrimary} />
        <Text variant="titleMedium" style={styles.sectionTitle}>{title}</Text>
      </View>
      <Divider style={styles.sectionDivider} />
      {children}
    </View>
  );
});

const FormInput = memo(function FormInput({
  label,
  value,
  onChangeText,
  icon,
  error,
  theme,
  ...props
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  icon: keyof typeof Feather.glyphMap;
  error?: string;
  theme: any;
  [key: string]: any;
}) {
  return (
    <View style={styles.inputWrap}>
      <TextInput
        label={label}
        value={value}
        onChangeText={onChangeText}
        mode="outlined"
        error={!!error}
        left={<TextInput.Icon icon={() => <Feather name={icon} size={18} color={COLORS.textPrimary} />} />}
        style={styles.input}
        outlineStyle={styles.inputOutline}
        theme={theme}
        textColor="#0F172A"
        selectionColor="#0F172A"
        cursorColor="#0F172A"
        {...props}
      />
      {error ? <HelperText type="error" style={styles.errorText}>{error}</HelperText> : null}
    </View>
  );
});

const DateField = memo(function DateField({
  label,
  value,
  onPress,
  error,
}: {
  label: string;
  value: Date;
  onPress: () => void;
  error?: string;
}) {
  return (
    <View style={styles.inputWrap}>
      <Text variant="labelLarge" style={styles.label}>{label}</Text>
      <Pressable onPress={onPress} style={({ pressed }) => [styles.dateBtn, pressed && styles.pressed]}>
        <Feather name="calendar" size={16} color={COLORS.textPrimary} />
        <Text style={styles.dateBtnText}>
          {value.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
        </Text>
      </Pressable>
      {error ? <HelperText type="error" style={styles.errorText}>{error}</HelperText> : null}
    </View>
  );
});

const LocationField = memo(function LocationField({
  onCapture,
  isLocating,
  location,
  address,
  error,
}: {
  onCapture: () => void;
  isLocating: boolean;
  location: Coords;
  address: string;
  error?: string;
}) {
  return (
    <View style={styles.inputWrap}>
      <Text variant="labelLarge" style={styles.label}>Inspection Location *</Text>

      <Pressable
        onPress={onCapture}
        disabled={isLocating}
        style={({ pressed }) => [styles.locationBtn, pressed && styles.pressed, isLocating && { opacity: 0.85 }]}
      >
        {isLocating ? (
          <ActivityIndicator color={COLORS.white} />
        ) : (
          <>
            <Feather name={location ? 'check-circle' : 'crosshair'} size={16} color={COLORS.white} />
            <Text style={styles.locationBtnText}>
              {location ? 'Location Captured' : 'Capture Location'}
            </Text>
          </>
        )}
      </Pressable>

      {location && (
        <View style={styles.locationInfo}>
          <View style={styles.locationLine}>
            <Feather name="map-pin" size={14} color={COLORS.textPrimary} />
            <Text style={styles.locationText}>
              {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
            </Text>
          </View>
          {!!address && (
            <View style={styles.locationLine}>
              <Feather name="map" size={14} color={COLORS.textPrimary} />
              <Text style={styles.locationText} numberOfLines={2}>{address}</Text>
            </View>
          )}
        </View>
      )}
      {error ? <HelperText type="error" style={styles.errorText}>{error}</HelperText> : null}
    </View>
  );
});

/* ---------- Styles (leaner spacing/borders) ---------- */

const styles = StyleSheet.create({
  content: { paddingBottom: 24, paddingHorizontal: 16, paddingTop: 12 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 40,
    marginBottom: 8,
  },
  logo: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#DBEAFE',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#BFDBFE',
  },
  headerTitle: { color: COLORS.textPrimary, fontWeight: '800', letterSpacing: 0.2 },
  headerSubtitle: { color: COLORS.textBody, marginTop: 2 },

  section: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    marginTop: 10,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  sectionTitle: { color: COLORS.textPrimary, fontWeight: '800' },
  sectionDivider: { backgroundColor: COLORS.border, height: 1, marginBottom: 10 },

  inputWrap: { marginBottom: 12 },
  label: { marginBottom: 6, color: COLORS.textBody, fontWeight: '600' },
  input: { backgroundColor: COLORS.white, fontSize: 16, color: '#0F172A' },
  inputOutline: { borderRadius: 12, borderWidth: 1.25, borderColor: COLORS.border },
  errorText: { marginTop: 4 },

  dateBtn: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1.25,
    borderColor: COLORS.textPrimary,
    backgroundColor: COLORS.white,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateBtnText: { color: COLORS.textPrimary, fontWeight: '700' },

  locationBtn: {
    height: 48,
    borderRadius: 12,
    backgroundColor: COLORS.textPrimary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  locationBtnText: { color: COLORS.white, fontWeight: '800', letterSpacing: 0.2 },

  locationInfo: {
    backgroundColor: COLORS.bg,
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 6,
  },
  locationLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  locationText: { color: COLORS.textBody, fontSize: 13 },

  rowSpace: { marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  actions: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    marginTop: 12,
    marginBottom: "20%",
  },
  secondaryBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1.25,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  secondaryBtnText: { color: COLORS.textPrimary, fontWeight: '800' },

  primaryBtn: {
    flex: 2,
    height: 48,
    borderRadius: 12,
    backgroundColor: COLORS.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  primaryBtnText: { color: COLORS.white, fontSize: 16, fontWeight: '800', letterSpacing: 0.2 },

  pressed: { transform: [{ scale: 0.995 }] },
});

export default InspectionForm;
