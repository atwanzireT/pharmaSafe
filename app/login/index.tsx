// app/login.tsx
import { auth } from '@/firebase';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useRouter } from 'expo-router';
import {
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
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
  HelperText,
  Text,
  TextInput,
} from 'react-native-paper';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

type ThemeMode = 'light' | 'dark';

// Tailwind references
// gray-50:  #F9FAFB
// blue-800: #1E40AF
// slate-500: #64748B
// slate-700: #334155
// slate-900: #0F172A
const COLORS = {
  bg: '#F9FAFB', // gray-50
  textPrimary: '#1E40AF', // blue-800
  textBody: '#334155', // slate-700
  border: '#E5E7EB', // gray-200
  white: '#FFFFFF',
  slate500: '#64748B',
  slate700: '#334155',
  slate900: '#0F172A',
  dangerBg: '#FEE2E2',
  dangerBorder: '#FCA5A5',
  dangerText: '#B91C1C',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const options = {
  headerShown: false,
};

const LoginScreen = () => {
  const router = useRouter();
  const navigation = useNavigation();

  // Hide header using useLayoutEffect
  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  // Theme (kept for paper input theme)
  const [mode] = useState<ThemeMode>('light');

  // Auth fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [secureTextEntry, setSecureTextEntry] = useState(true);

  // Validation/flow state
  const [errors, setErrors] = useState({ email: '', password: '', general: '' });
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);

  // Subtle entrance animation (kept but simplified)
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(12)).current;

  // Refs for focusing between fields
  const emailRef = useRef<any>(null);
  const passRef = useRef<any>(null);

  // Redirect if already signed in
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) {
        router.replace('/(tabs)');
      } else {
        setBooting(false);
      }
    });
    return unsub;
  }, [router]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 350, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  // —— Theme-aware input theme (simple, light) ——
  const inputTheme = useMemo(() => makeInputTheme(mode), [mode]);

  // Helpers
  const validateForm = () => {
    let valid = true;
    const newErrors = { email: '', password: '', general: '' };

    const val = email.trim();
    if (!val) { newErrors.email = 'Email is required'; valid = false; }
    else if (!EMAIL_RE.test(val)) { newErrors.email = 'Enter a valid email address'; valid = false; }

    if (!password) { newErrors.password = 'Password is required'; valid = false; }
    else if (password.length < 6) { newErrors.password = 'Minimum 6 characters'; valid = false; }

    setErrors(newErrors);
    return valid;
  };

  const mapAuthError = (code?: string) => {
    switch (code) {
      case 'auth/user-not-found':
        return 'No account found with this email';
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return 'Incorrect credentials';
      case 'auth/invalid-email':
        return 'Invalid email format';
      case 'auth/too-many-requests':
        return 'Too many failed attempts. Try again later';
      case 'auth/user-disabled':
        return 'This account has been disabled';
      case 'auth/network-request-failed':
        return 'Network error. Check your connection';
      default:
        return 'Something went wrong. Please try again';
    }
  };

  const handleLogin = async () => {
    if (loading) return; // guard double taps
    Keyboard.dismiss();
    if (!validateForm()) return;

    setLoading(true);
    setErrors({ email: '', password: '', general: '' });

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      router.replace('/(tabs)');
    } catch (error: any) {
      setErrors((prev) => ({ ...prev, general: mapAuthError(error?.code) }));
      console.log('Login error:', error?.code, error?.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const val = email.trim();
    if (!EMAIL_RE.test(val)) {
      Alert.alert('Reset password', 'Enter a valid email first.');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, val);
      Alert.alert('Check your inbox', 'We sent a password reset email.');
    } catch (e: any) {
      Alert.alert('Reset failed', mapAuthError(e?.code));
    }
  };

  const PrimaryButton = ({ onPress, disabled, loading, children }: any) => (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.primaryButton,
        pressed && { opacity: 0.9 },
        (disabled || loading) && { opacity: 0.7 },
      ]}
      accessibilityRole="button"
      accessibilityLabel="Sign in"
    >
      <View style={styles.primaryButtonInner}>
        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.primaryButtonText}>Signing In...</Text>
          </View>
        ) : (
          <View style={styles.loadingRow}>
            <Text style={styles.primaryButtonText}>{children}</Text>
            <Feather name="arrow-right" size={18} color="#fff" />
          </View>
        )}
      </View>
    </Pressable>
  );

  if (booting) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={COLORS.textPrimary} />
      </View>
    );
  }

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={styles.root}>
        <StatusBar barStyle="dark-content" />
        <SafeAreaView style={{ flex: 1 }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <ScrollView
              contentContainerStyle={styles.scroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Brand / Logo */}
              <Animated.View style={[styles.logoWrap, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
                <View style={styles.logoCircle}>
                  <Feather name="shield" size={28} color={COLORS.textPrimary} />
                </View>
                <Text variant="headlineMedium" style={styles.brandTitle}>PharmaSafe</Text>
                <Text variant="bodyMedium" style={styles.brandSubtitle}>Drug Inspection Portal</Text>
              </Animated.View>

              {/* Card */}
              <Animated.View style={[{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardTitle}>Welcome back</Text>
                    <Text style={styles.cardSubtitle}>Sign in to continue your work</Text>
                  </View>

                  {/* Email */}
                  <View style={styles.fieldBlock}>
                    <TextInput
                      ref={emailRef}
                      label="Email address"
                      value={email}
                      onChangeText={(t) => {
                        setEmail(t);
                        if (errors.email) setErrors((p) => ({ ...p, email: '' }));
                      }}
                      mode="outlined"
                      autoCapitalize="none"
                      autoComplete="email"
                      keyboardType="email-address"
                      textContentType="emailAddress"
                      returnKeyType="next"
                      onSubmitEditing={() => passRef.current?.focus()}
                      left={<TextInput.Icon icon="email-outline" />}
                      error={!!errors.email}
                      outlineStyle={styles.inputOutline}
                      style={styles.input}
                      theme={inputTheme}
                      // ensure dark, high-contrast text
                      textColor={COLORS.slate900}
                      selectionColor={COLORS.slate900}
                      cursorColor={COLORS.slate900}
                    />
                    <HelperText type="error" visible={!!errors.email} style={styles.helper}>
                      {errors.email}
                    </HelperText>
                  </View>

                  {/* Password */}
                  <View style={styles.fieldBlock}>
                    <TextInput
                      ref={passRef}
                      label="Password"
                      value={password}
                      onChangeText={(t) => {
                        setPassword(t);
                        if (errors.password) setErrors((p) => ({ ...p, password: '' }));
                      }}
                      mode="outlined"
                      secureTextEntry={secureTextEntry}
                      autoCapitalize="none"
                      autoComplete="password"
                      textContentType="password"
                      returnKeyType="go"
                      onSubmitEditing={handleLogin}
                      left={<TextInput.Icon icon="lock-outline" />}
                      right={
                        <TextInput.Icon
                          icon={secureTextEntry ? 'eye-off-outline' : 'eye-outline'}
                          onPress={() => setSecureTextEntry((s) => !s)}
                          accessibilityLabel={secureTextEntry ? 'Show password' : 'Hide password'}
                        />
                      }
                      error={!!errors.password}
                      outlineStyle={styles.inputOutline}
                      style={styles.input}
                      theme={inputTheme}
                      // ensure dark, high-contrast text
                      textColor={COLORS.slate900}
                      selectionColor={COLORS.slate900}
                      cursorColor={COLORS.slate900}
                    />
                    <HelperText type="error" visible={!!errors.password} style={styles.helper}>
                      {errors.password}
                    </HelperText>
                  </View>

                  {/* General error */}
                  {!!errors.general && (
                    <View style={styles.generalError} accessible accessibilityRole="alert">
                      <Feather name="alert-circle" size={16} color={COLORS.dangerText} />
                      <Text style={styles.generalErrorText}>{errors.general}</Text>
                    </View>
                  )}

                  {/* CTA */}
                  <PrimaryButton
                    onPress={handleLogin}
                    disabled={!email.trim() || !password}
                    loading={loading}
                  >
                    Sign In
                  </PrimaryButton>

                  {/* Links */}
                  <View style={styles.linksRow}>
                    <Pressable onPress={handleForgotPassword} hitSlop={8}>
                      <Text style={styles.linkText}>Forgot password?</Text>
                    </Pressable>
                  </View>
                </View>
              </Animated.View>

              {/* Footer */}
              <View style={styles.footer}>
                <Text style={styles.footerText}>© {new Date().getFullYear()} PharmaSafe</Text>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    </TouchableWithoutFeedback>
  );
};

/* ---------------- helpers ---------------- */
const makeInputTheme = (mode: ThemeMode) =>
  ({
    roundness: 12,
    colors: {
      primary: COLORS.textPrimary, // outline/active
      background: COLORS.white,
      surface: COLORS.white,
      surfaceVariant: COLORS.white,
      outline: '#E5E7EB', // gray-200

      // Stronger contrast for text/labels/placeholders
      onSurface: COLORS.slate900,        // main input text color Paper uses
      onSurfaceVariant: COLORS.slate700, // helper/labels
      placeholder: COLORS.slate700,      // darker placeholder
    },
    isV3: true, // if you're on Paper v5 (MD3), this helps variants render nicely
  } as const);

/* ---------------- styles ---------------- */
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  scroll: {
    minHeight: SCREEN_HEIGHT * 0.98,
    paddingHorizontal: 22,
    paddingVertical: Platform.OS === 'ios' ? 42 : 28,
    justifyContent: 'center',
  },

  // Branding
  logoWrap: { alignItems: 'center', marginBottom: 16 },
  logoCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EFF6FF', // blue-50
    borderWidth: 1,
    borderColor: '#DBEAFE', // blue-100
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTitle: {
    marginTop: 12,
    color: COLORS.textPrimary, // blue-800
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  brandSubtitle: { color: COLORS.textBody, marginTop: 4 },

  // Card
  card: {
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  cardHeader: { marginBottom: 8, alignItems: 'center' },
  cardTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.textPrimary,
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  cardSubtitle: { textAlign: 'center', color: COLORS.textBody, marginTop: 4 },

  // Inputs
  fieldBlock: { marginTop: 12 },
  input: {
    backgroundColor: COLORS.white,
    fontSize: 16,
    color: COLORS.slate900, // <-- ensure RN text itself is dark
  },
  inputOutline: { borderRadius: 12, borderColor: COLORS.border, borderWidth: 1 },
  helper: { marginTop: 4, marginLeft: 4 },

  // Errors
  generalError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    marginTop: 10,
    backgroundColor: COLORS.dangerBg,
    borderWidth: 1,
    borderColor: COLORS.dangerBorder,
  },
  generalErrorText: { color: COLORS.dangerText, flex: 1 },

  // Button
  primaryButton: {
    marginTop: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  primaryButtonInner: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    backgroundColor: COLORS.textPrimary, // solid blue-800
  },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  primaryButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // Links
  linksRow: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginTop: 14 },
  linkText: { color: COLORS.textPrimary, textDecorationLine: 'underline', fontWeight: '600' },

  // Footer
  footer: { alignItems: 'center', marginTop: 18 },
  footerText: { color: COLORS.slate500 },
});

export default LoginScreen;