// app/inspection-form.tsx (with Drugshop Contact + SMS)
import { auth, database } from '@/firebase';
import { Feather } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { push, ref } from 'firebase/database';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Keyboard,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  TouchableWithoutFeedback,
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

const YOOLA_API_KEY = 'xgpYr222zWMD4w5VIzUaZc5KYO5L1w8N38qBj1qPflwguq9PdJ545NTCSLTS7H00'; // TODO: move to secure config

// Tailwind colors used
const COLORS = {
  bg: '#F9FAFB',          // gray-50
  white: '#FFFFFF',
  border: '#E5E7EB',      // gray-200
  textPrimary: '#1E40AF', // blue-800
  textBody: '#334155',    // slate-700
  slate600: '#475569',
  slate500: '#64748B',
  slate400: '#94A3B8',
  success: '#16A34A',     // green-600
  danger: '#B91C1C',      // red-700
};

type Coords = { latitude: number; longitude: number } | null;

const phoneTokenRe = /^\+?\d{7,15}$/; // simple per-number check

function normalizePhones(raw: string): string[] {
  return raw
    .split(',')
    .map(p => p.trim())
    .filter(Boolean);
}

function validatePhones(raw: string): string | null {
  const tokens = normalizePhones(raw);
  if (tokens.length === 0) return 'Enter at least one phone number';
  for (const t of tokens) {
    if (!phoneTokenRe.test(t)) {
      return `Invalid phone: ${t}`;
    }
  }
  return null;
}

const InspectionForm = () => {
  // Form state
  const [formData, setFormData] = useState({
    date: new Date(),
    serialNumber: '',
    drugshopName: '',
    clientTelephone: '',
    drugshopContactPhones: '', // NEW: comma-separated phones to notify
    boxesImpounded: '',
    impoundedBy: '',
    location: null as Coords,
    locationAddress: '',
    sendSms: true, // NEW: toggle to send SMS
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [hasLocationPermission, setHasLocationPermission] = useState<boolean | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const router = useRouter();

  // Simple entrance animation
  const fade = useRef(new Animated.Value(0)).current;
  const slideY = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.timing(slideY, { toValue: 0, duration: 260, useNativeDriver: true }),
    ]).start();
  }, [fade, slideY]);

  
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


  // Location permission
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setHasLocationPermission(status === 'granted');
    })();
  }, []);

  const formatAddress = (address?: Partial<Location.LocationGeocodedAddress>) => {
    if (!address) return '';
    return [
      address.name,
      address.street,
      address.city || address.district,
      address.region,
      address.country,
    ].filter(Boolean).join(', ');
  };

  const handleChange = (name: string, value: any) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const validateForm = () => {
    const req = [
      'serialNumber',
      'drugshopName',
      'boxesImpounded',
      'impoundedBy',
      'location',
    ] as const;

    const next: Record<string, string> = {};
    let ok = true;

    req.forEach((key) => {
      // @ts-ignore
      if (!formData[key]) { next[key] = 'This field is required'; ok = false; }
    });

    // Phone (reporting person/owner)
    if (formData.clientTelephone && !phoneTokenRe.test(formData.clientTelephone.trim())) {
      next.clientTelephone = 'Enter a valid phone number';
      ok = false;
    }

    // Boxes numeric
    if (formData.boxesImpounded && !/^\d+$/.test(formData.boxesImpounded.trim())) {
      next.boxesImpounded = 'Enter a valid number';
      ok = false;
    }

    // Contact phones (only if sending SMS AND boxes>0)
    const boxesNum = Number(formData.boxesImpounded || '0') || 0;
    if (formData.sendSms && boxesNum > 0) {
      const err = validatePhones(formData.drugshopContactPhones || '');
      if (err) {
        next.drugshopContactPhones = err;
        ok = false;
      }
    }

    setErrors(next);
    return ok;
  };

  const captureLocation = async () => {
    if (hasLocationPermission === false) {
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

    setIsLocating(true);
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
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
  };

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
    const when = isNaN(dt.getTime()) ? payload.dateIso : dt.toLocaleString('en-UG', {
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

    // Use fetch (no extra deps)
    const res = await fetch('https://yoolasms.com/api/v1/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: phonesCsv,             // comma-separated
        message: msg,
        api_key: "xgpYr222zWMD4w5VIzUaZc5KYO5L1w8N38qBj1qPflwguq9PdJ545NTCSLTS7H00",
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`SMS failed (${res.status}): ${text || 'Unknown error'}`);
    }
    return res.json().catch(() => ({}));
  }

  const handleSubmit = async () => {
    Keyboard.dismiss();
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      const data = {
        date: formData.date.toISOString(),
        serialNumber: formData.serialNumber.trim(),
        drugshopName: formData.drugshopName.trim(),
        drugshopContactPhones: formData.drugshopContactPhones.trim(), // NEW: stored
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
        smsAttempted: false, // NEW: audit fields
        smsSuccess: false,
      };

      const inspectionsRef = ref(database, 'inspections');
      const newRef = await push(inspectionsRef, data);
      const newId = newRef.key;

      // Try to send SMS if requested and impounded > 0
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
          // Patch audit flags (fire-and-forget)
          if (newId) {
            await fetch(`https://yoolasms.com/api/v1/send`); // no-op to avoid blocking if offline? (optional)
          }
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
  };

  const resetForm = () => {
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
  };

  const handleDateChange = (_: any, selected?: Date) => {
    setShowDatePicker(false);
    if (selected) handleChange('date', selected);
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
        <StatusBar barStyle="dark-content" />
        <SafeAreaView style={{ flex: 1 }}>
          <Animated.View style={[styles.container, { opacity: fade, transform: [{ translateY: slideY }] }]}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.logo}>
                <Feather name="clipboard" size={22} color={COLORS.textPrimary} />
              </View>
              <View>
                <Text variant="headlineSmall" style={styles.headerTitle}>New Inspection</Text>
                <Text variant="bodyMedium" style={styles.headerSubtitle}>Fill out the form to submit</Text>
              </View>
            </View>

            <ScrollView
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Section: Details */}
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

              {/* Section: Drugshop */}
              <Section title="Drugshop Information" icon="home">
                <FormInput
                  label="Serial Number *"
                  value={formData.serialNumber}
                  onChangeText={(t: string) => handleChange('serialNumber', t)}
                  icon="hash"
                  error={errors.serialNumber}
                  autoCapitalize="characters"
                />
                <FormInput
                  label="Drugshop Name *"
                  value={formData.drugshopName}
                  onChangeText={(t: string) => handleChange('drugshopName', t)}
                  icon="briefcase"
                  error={errors.drugshopName}
                />
                {/* NEW: Drugshop Contact Phones */}
                <FormInput
                  label="Drugshop Contact Phone(s) (comma-separated)"
                  value={formData.drugshopContactPhones}
                  onChangeText={(t: string) => handleChange('drugshopContactPhones', t)}
                  icon="users"
                  keyboardType="default"
                  error={errors.drugshopContactPhones}
                  placeholder="070..., +25670..., 25670..."
                />
              </Section>

              {/* Section: Impound */}
              <Section title="Impound Information" icon="package">
                <FormInput
                  label="Boxes Impounded *"
                  value={formData.boxesImpounded}
                  onChangeText={(t: string) => handleChange('boxesImpounded', t)}
                  icon="package"
                  keyboardType="numeric"
                  error={errors.boxesImpounded}
                />
                <FormInput
                  label="Impounded By *"
                  value={formData.impoundedBy}
                  onChangeText={(t: string) => handleChange('impoundedBy', t)}
                  icon="user"
                  error={errors.impoundedBy}
                />

                {/* NEW: SMS toggle */}
                <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ color: COLORS.textBody, fontWeight: '700' }}>
                    Send SMS to Drugshop Contact on submit
                  </Text>
                  <Switch
                    value={formData.sendSms}
                    onValueChange={(v) => handleChange('sendSms', v)}
                  />
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

              <View style={{ height: 8 }} />
            </ScrollView>
          </Animated.View>
        </SafeAreaView>
      </View>
    </TouchableWithoutFeedback>
  );
};

/* ---------- Reusable bits ---------- */

const Section = ({ title, icon, children }: { title: string; icon: keyof typeof Feather.glyphMap; children: React.ReactNode }) => (
  <View style={styles.section}>
    <View style={styles.sectionHeader}>
      <Feather name={icon} size={16} color={COLORS.textPrimary} />
      <Text variant="titleMedium" style={styles.sectionTitle}>{title}</Text>
    </View>
    <Divider style={styles.sectionDivider} />
    {children}
  </View>
);

const FormInput = ({
  label,
  value,
  onChangeText,
  icon,
  error,
  ...props
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  icon: keyof typeof Feather.glyphMap;
  error?: string;
  [key: string]: any;
}) => (
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
      // High-contrast Paper theme for the input
      theme={{
        roundness: 12,
        colors: {
          primary: COLORS.textPrimary,     // active/outline
          background: COLORS.white,
          surface: COLORS.white,
          outline: COLORS.border,
          onSurface: '#0F172A',            // dark input text
          onSurfaceVariant: COLORS.slate500,
          placeholder: '#334155',          // darker placeholder
        },
      }}
      textColor="#0F172A"
      selectionColor="#0F172A"
      cursorColor="#0F172A"
      {...props}
    />
    {error ? <HelperText type="error" style={styles.errorText}>{error}</HelperText> : null}
  </View>
);

const DateField = ({
  label,
  value,
  onPress,
  error,
}: {
  label: string;
  value: Date;
  onPress: () => void;
  error?: string;
}) => (
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

const LocationField = ({
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
}) => (
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

/* ---------- Styles ---------- */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: SCREEN_HEIGHT * 0.98,
    paddingHorizontal: 18,
    marginTop: 50,
    marginBottom: 8,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  logo: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#DBEAFE', // blue-100
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#BFDBFE', // blue-200
  },
  headerTitle: {
    color: COLORS.textPrimary,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  headerSubtitle: {
    color: COLORS.textBody,
    marginTop: 2,
  },

  content: { paddingBottom: 24 },

  section: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginTop: 12,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  sectionTitle: { color: COLORS.textPrimary, fontWeight: '800' },
  sectionDivider: { backgroundColor: COLORS.border, height: 1, marginBottom: 12 },

  inputWrap: { marginBottom: 14 },
  label: { marginBottom: 6, color: COLORS.textBody, fontWeight: '600' },
  input: {
    backgroundColor: COLORS.white,
    fontSize: 16,
    color: '#0F172A', // dark text inside RN
  },
  inputOutline: { borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.border },
  errorText: { marginTop: 4 },

  dateBtn: {
    height: 50,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.textPrimary,
    backgroundColor: COLORS.white,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateBtnText: { color: COLORS.textPrimary, fontWeight: '700' },

  locationBtn: {
    height: 50,
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

  actions: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 50,
  },
  secondaryBtn: {
    flex: 1,
    height: 52,
    borderRadius: 12,
    borderWidth: 1.5,
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
    height: 52,
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
