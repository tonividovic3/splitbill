import { useState, useRef, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, Animated, KeyboardAvoidingView, Platform
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { supabase } from '../../lib/supabase'
import { C, radius, font } from '../../lib/theme'

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [fullName, setFullName] = useState('')

  const fadeAnim = useRef(new Animated.Value(0)).current
  const slideAnim = useRef(new Animated.Value(30)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 60, friction: 10, useNativeDriver: true }),
    ]).start()
  }, [])

  async function handleAuth() {
    if (!email || !password) return
    setLoading(true)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password.trim()
        })
        if (error) Alert.alert('Error', error.message)
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password: password.trim()
        })
        if (error) { Alert.alert('Error', error.message); return }
        if (data.user) {
          await supabase.from('profiles').insert({
            id: data.user.id,
            email: email.trim(),
            full_name: fullName || email.split('@')[0],
            payment_methods: [],
            currency: 'EUR'
          })
        }
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <LinearGradient colors={['#0D0B2A', '#08081A']} style={StyleSheet.absoluteFill} />
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.View style={[s.container, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

          <View style={s.logoWrap}>
            <LinearGradient colors={['#7857FF', '#4F37CC']} style={s.logoGrad}>
              <Text style={s.logoIcon}>⚡</Text>
            </LinearGradient>
            <Text style={s.appName}>SplitBill</Text>
            <Text style={s.tagline}>Split any bill in seconds</Text>
          </View>

          <View style={s.card}>
            <View style={s.modeRow}>
              {(['login', 'register'] as const).map(m => (
                <TouchableOpacity
                  key={m}
                  style={[s.modeBtn, mode === m && s.modeBtnActive]}
                  onPress={() => setMode(m)}
                >
                  <Text style={[s.modeBtnText, mode === m && s.modeBtnTextActive]}>
                    {m === 'login' ? 'Sign in' : 'Create account'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {mode === 'register' && (
              <TextInput
                style={s.input}
                placeholder="Full name"
                placeholderTextColor={C.textMuted}
                value={fullName}
                onChangeText={setFullName}
                autoCapitalize="words"
              />
            )}

            <TextInput
              style={s.input}
              placeholder="Email address"
              placeholderTextColor={C.textMuted}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <TextInput
              style={s.input}
              placeholder="Password"
              placeholderTextColor={C.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />

            <TouchableOpacity
              onPress={handleAuth}
              disabled={loading}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={loading ? ['#3A2E8A', '#2A1E6A'] : ['#7857FF', '#5537EE']}
                style={s.primaryBtn}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.primaryBtnText}>{mode === 'login' ? 'Sign in' : 'Create account'} →</Text>
                }
              </LinearGradient>
            </TouchableOpacity>
          </View>

        </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  flex: { flex: 1 },
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  logoWrap: { alignItems: 'center', marginBottom: 36 },
  logoGrad: {
    width: 72, height: 72, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
    shadowColor: '#7857FF', shadowOpacity: 0.6, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }
  },
  logoIcon: { fontSize: 36 },
  appName: { ...font.xl, fontWeight: '700', color: C.text, marginBottom: 6 },
  tagline: { ...font.sm, color: C.textSec },
  card: {
    backgroundColor: C.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: C.border,
    padding: 20,
  },
  modeRow: {
    flexDirection: 'row',
    backgroundColor: C.bg,
    borderRadius: radius.md,
    padding: 3,
    marginBottom: 20,
  },
  modeBtn: {
    flex: 1, paddingVertical: 9, borderRadius: radius.sm + 1, alignItems: 'center'
  },
  modeBtnActive: { backgroundColor: C.card2 },
  modeBtnText: { ...font.sm, color: C.textMuted, fontWeight: '500' },
  modeBtnTextActive: { color: C.text, fontWeight: '600' },
  input: {
    backgroundColor: C.card2,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
    ...font.base,
    color: C.text,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  primaryBtn: {
    borderRadius: radius.md,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryBtnText: { color: '#fff', ...font.base, fontWeight: '700' },
})
