import { useState, useRef, useEffect } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, TextInput, Alert, ActivityIndicator, Image, Animated
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import * as ImagePicker from 'expo-image-picker'
import * as ImageManipulator from 'expo-image-manipulator'
import { useRouter } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../lib/store'
import { genCode, scanReceiptWithClaude, fmtCurrency } from '../../lib/utils'
import { C, radius, font } from '../../lib/theme'
import type { Item } from '../../lib/supabase'

type Screen = 'home' | 'scanning' | 'items'

const DEMO_ITEMS: Item[] = [
  { id: '0', name: 'Grilled sea bass', price: 24.00, qty: 1 },
  { id: '1', name: 'Black risotto', price: 18.00, qty: 1 },
  { id: '2', name: 'Bruschetta', price: 8.50, qty: 2 },
  { id: '3', name: 'House white wine', price: 5.00, qty: 3 },
  { id: '4', name: 'Sparkling water', price: 3.50, qty: 2 },
  { id: '5', name: 'Tiramisu', price: 7.00, qty: 2 },
]

export default function HomeScreen() {
  const router = useRouter()
  const { user, profile, pendingTemplate, setPendingTemplate, saveRecurringTemplate } = useAuthStore()
  const [screen, setScreen] = useState<Screen>('home')
  const [preview, setPreview] = useState<string | null>(null)
  const [previewBase64, setPreviewBase64] = useState<string | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [sessionName, setSessionName] = useState('')
  const [scanMsg, setScanMsg] = useState('')
  const [newName, setNewName] = useState('')
  const [newPrice, setNewPrice] = useState('')
  const [saving, setSaving] = useState(false)
  const [splitMode, setSplitMode] = useState<'per_item' | 'equal'>('per_item')
  const [tripPeople, setTripPeople] = useState(2)
  const [templateName, setTemplateName] = useState('')
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)
  const fadeAnim = useRef(new Animated.Value(0)).current
  const scanPulse = useRef(new Animated.Value(1)).current
  const currency = profile?.currency || 'EUR'

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start()
  }, [])

  useEffect(() => {
    if (pendingTemplate) {
      setItems(pendingTemplate.items)
      setSessionName(pendingTemplate.name)
      setSplitMode('per_item')
      setScreen('items')
      setPendingTemplate(null)
    }
  }, [pendingTemplate])

  useEffect(() => {
    if (screen !== 'scanning') return
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(scanPulse, { toValue: 1.1, duration: 700, useNativeDriver: true }),
        Animated.timing(scanPulse, { toValue: 1.0, duration: 700, useNativeDriver: true }),
      ])
    )
    pulse.start()
    return () => pulse.stop()
  }, [screen])

  async function pickImage(fromCamera: boolean) {
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.8 })
    if (result.canceled) return
    const compressed = await ImageManipulator.manipulateAsync(
      result.assets[0].uri,
      [{ resize: { width: 1200 } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    )
    setPreview(compressed.uri)
    setPreviewBase64(compressed.base64 ?? null)
  }

  async function scanReceipt() {
    if (!preview || !previewBase64) return
    setScreen('scanning')
    const msgs = ['Analyzing receipt...', 'Recognizing text...', 'Extracting items...']
    let i = 0
    setScanMsg(msgs[0])
    const iv = setInterval(() => { if (++i < msgs.length) setScanMsg(msgs[i]) }, 1400)
    try {
      clearInterval(iv)
      const parsed = await scanReceiptWithClaude(previewBase64)
      setItems(parsed.map((it, idx) => ({ ...it, id: String(idx) })))
      setScreen('items')
    } catch (err: any) {
      clearInterval(iv)
      Alert.alert('Could not scan', err?.message || 'Loading demo receipt instead.')
      loadDemo()
    }
  }

  function loadDemo() {
    setItems(DEMO_ITEMS)
    setSessionName('Dinner at Konoba, June 26')
    setPreview(null)
    setPreviewBase64(null)
    setScreen('items')
  }

  function removeItem(id: string) { setItems(prev => prev.filter(it => it.id !== id)) }

  function addItem() {
    const price = parseFloat(newPrice.replace(',', '.'))
    if (!newName.trim() || isNaN(price)) return
    setItems(prev => [...prev, { id: Date.now().toString(), name: newName.trim(), price, qty: 1 }])
    setNewName('')
    setNewPrice('')
  }

  async function createSession() {
    if (!sessionName.trim() || !user || !profile) return
    setSaving(true)
    const code = genCode()
    const isTrip = splitMode === 'equal'
    const { data, error } = await supabase.from('sessions').insert({
      code,
      name: sessionName.trim(),
      items,
      owner_id: user.id,
      owner_name: profile.full_name || 'Host',
      owner_payment_methods: profile.payment_methods || [],
      owner_push_token: profile.push_token || null,
      currency,
      total: items.reduce((s, it) => s + it.price * it.qty, 0),
      session_type: isTrip ? 'trip' : 'split',
      trip_people: isTrip ? tripPeople : null,
    }).select().single()

    setSaving(false)
    if (error) { Alert.alert('Error', error.message); return }
    setScreen('home')
    setItems([])
    setSessionName('')
    setPreview(null)
    setPreviewBase64(null)
    setSplitMode('per_item')
    setTripPeople(2)
    router.push(`/session/${data.code}`)
  }

  const total = items.reduce((s, it) => s + it.price * it.qty, 0)
  const perPerson = splitMode === 'equal' ? total / tripPeople : 0

  // ── Scanning screen ───────────────────────────────────────────
  if (screen === 'scanning') return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.center}>
        <Animated.View style={{ transform: [{ scale: scanPulse }] }}>
          <LinearGradient colors={['#7857FF', '#4F37CC']} style={s.scanOrb}>
            <Text style={{ fontSize: 36 }}>✨</Text>
          </LinearGradient>
        </Animated.View>
        <Text style={s.scanTitle}>AI is reading your receipt</Text>
        <Text style={s.scanMsg}>{scanMsg}</Text>
      </View>
    </SafeAreaView>
  )

  // ── Items screen ──────────────────────────────────────────────
  if (screen === 'items') return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView contentContainerStyle={s.itemsScroll} showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => setScreen('home')} style={s.backBtn}>
            <Text style={s.backArrow}>←</Text>
          </TouchableOpacity>
          <Text style={s.heading}>Bill Items</Text>
        </View>

        {/* Split mode toggle */}
        <View style={s.modeRow}>
          {(['per_item', 'equal'] as const).map(m => (
            <TouchableOpacity
              key={m}
              style={[s.modeBtn, splitMode === m && s.modeBtnActive]}
              onPress={() => setSplitMode(m)}
            >
              <Text style={[s.modeBtnText, splitMode === m && s.modeBtnTextActive]}>
                {m === 'per_item' ? '📋 Per item' : '⚖️ Equal split'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {splitMode === 'equal' && (
          <View style={s.tripCard}>
            <Text style={s.tripLabel}>NUMBER OF PEOPLE</Text>
            <View style={s.tripCounter}>
              <TouchableOpacity
                style={s.counterBtn}
                onPress={() => setTripPeople(Math.max(2, tripPeople - 1))}
              >
                <Text style={s.counterBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={s.counterValue}>{tripPeople}</Text>
              <TouchableOpacity
                style={s.counterBtn}
                onPress={() => setTripPeople(tripPeople + 1)}
              >
                <Text style={s.counterBtnText}>+</Text>
              </TouchableOpacity>
            </View>
            <View style={s.perPersonRow}>
              <Text style={s.perPersonLabel}>Each person pays</Text>
              <Text style={s.perPersonAmount}>{fmtCurrency(perPerson, currency)}</Text>
            </View>
          </View>
        )}

        {/* Items list */}
        <View style={s.card}>
          {items.map((item, idx) => (
            <View key={item.id} style={[s.itemRow, idx === items.length - 1 && s.itemRowLast]}>
              <Text style={s.itemName} numberOfLines={1}>{item.name}</Text>
              {item.qty > 1 && <View style={s.qtyBadge}><Text style={s.qtyText}>×{item.qty}</Text></View>}
              <Text style={s.itemPrice}>{fmtCurrency(item.price * item.qty, currency)}</Text>
              <TouchableOpacity onPress={() => removeItem(item.id)} style={s.removeBtn}>
                <Text style={s.removeText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {/* Add item row */}
        <View style={s.addRow}>
          <TextInput
            style={[s.input, { flex: 1 }]}
            placeholder="Item name"
            placeholderTextColor={C.textMuted}
            value={newName}
            onChangeText={setNewName}
          />
          <TextInput
            style={[s.input, { width: 80 }]}
            placeholder="Price"
            placeholderTextColor={C.textMuted}
            value={newPrice}
            onChangeText={setNewPrice}
            keyboardType="decimal-pad"
          />
          <TouchableOpacity style={s.addIconBtn} onPress={addItem}>
            <Text style={s.addIconText}>+</Text>
          </TouchableOpacity>
        </View>

        {/* Total */}
        <LinearGradient colors={['#13103a', '#0f0f23']} style={s.totalBar}>
          <Text style={s.totalLabel}>Total</Text>
          <Text style={s.totalAmount}>{fmtCurrency(total, currency)}</Text>
        </LinearGradient>

        {/* Session name */}
        <Text style={s.inputLabel}>SESSION NAME</Text>
        <TextInput
          style={[s.input, { marginBottom: 8 }]}
          placeholder="e.g. Dinner at Mario's, June 26"
          placeholderTextColor={C.textMuted}
          value={sessionName}
          onChangeText={setSessionName}
        />

        {/* Save as recurring template */}
        {!showSaveTemplate ? (
          <TouchableOpacity onPress={() => { setTemplateName(sessionName); setShowSaveTemplate(true) }} style={{ marginBottom: 16 }}>
            <Text style={{ ...font.xs, color: C.accent, fontWeight: '600' }}>💾 Save as recurring template</Text>
          </TouchableOpacity>
        ) : (
          <View style={[s.card, { marginBottom: 16, padding: 12, gap: 8 }]}>
            <Text style={[font.xs, { color: C.textMuted, fontWeight: '700', letterSpacing: 0.8 }]}>TEMPLATE NAME</Text>
            <TextInput
              style={s.input}
              placeholder="e.g. Monthly Rent, Netflix Split"
              placeholderTextColor={C.textMuted}
              value={templateName}
              onChangeText={setTemplateName}
              autoFocus
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                style={[s.addIconBtn, { flex: 1, borderRadius: radius.sm, height: 40 }]}
                onPress={() => setShowSaveTemplate(false)}
              >
                <Text style={[font.xs, { color: C.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.addIconBtn, { flex: 2, borderRadius: radius.sm, height: 40, backgroundColor: C.accentSoft }]}
                onPress={async () => {
                  if (!templateName.trim()) return
                  await saveRecurringTemplate(templateName.trim(), items, [])
                  setShowSaveTemplate(false)
                  Alert.alert('Saved!', `"${templateName.trim()}" saved as a recurring template.`)
                }}
              >
                <Text style={[font.xs, { color: C.accent, fontWeight: '700' }]}>Save template</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <TouchableOpacity
          disabled={!sessionName.trim() || saving}
          onPress={createSession}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={!sessionName.trim() || saving ? ['#2a2040', '#1a1530'] : ['#7857FF', '#5537EE']}
            style={s.primaryBtn}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.primaryBtnText}>🔗 Create sharing link</Text>
            }
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )

  // ── Home screen ───────────────────────────────────────────────
  const name = profile?.full_name?.split(' ')[0] || 'there'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <Animated.ScrollView
        style={{ opacity: fadeAnim }}
        contentContainerStyle={s.homeScroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.homeHeader}>
          <Text style={s.greeting}>{greeting}, {name} 👋</Text>
          <Text style={s.homeTitle}>Scan a receipt</Text>
          <Text style={s.homeSub}>Claude AI reads your bill instantly</Text>
        </View>

        <TouchableOpacity onPress={() => pickImage(true)} activeOpacity={0.85}>
          <LinearGradient
            colors={['#7857FF', '#5537EE']}
            style={s.mainBtn}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Text style={s.mainBtnEmoji}>📷</Text>
            <Text style={s.mainBtnText}>Take a photo</Text>
            <Text style={s.mainBtnSub}>Camera</Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity style={s.secondaryBtn} onPress={() => pickImage(false)} activeOpacity={0.85}>
          <Text style={{ fontSize: 24 }}>🖼</Text>
          <Text style={s.secondaryBtnText}>Upload from gallery</Text>
        </TouchableOpacity>

        {preview && (
          <View style={s.previewWrap}>
            <Image source={{ uri: preview }} style={s.preview} />
            <TouchableOpacity onPress={scanReceipt} activeOpacity={0.85}>
              <LinearGradient
                colors={['#7857FF', '#5537EE']}
                style={s.primaryBtn}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={s.primaryBtnText}>✨ Scan receipt with AI</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}

        <View style={s.divider}>
          <View style={s.dividerLine} />
          <Text style={s.dividerText}>or</Text>
          <View style={s.dividerLine} />
        </View>

        <TouchableOpacity style={s.demoBtn} onPress={loadDemo} activeOpacity={0.85}>
          <Text style={s.demoBtnText}>Load demo receipt</Text>
        </TouchableOpacity>
      </Animated.ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 },

  // Scanning
  scanOrb: {
    width: 100, height: 100, borderRadius: 50,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: C.accent, shadowOpacity: 0.7, shadowRadius: 30, shadowOffset: { width: 0, height: 10 },
  },
  scanTitle: { ...font.md, fontWeight: '700', color: C.text },
  scanMsg: { ...font.sm, color: C.textSec },

  // Items
  itemsScroll: { padding: 20, paddingBottom: 48 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  backBtn: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },
  backArrow: { fontSize: 18, color: C.textSec },
  heading: { ...font.md, fontWeight: '700', color: C.text },

  modeRow: {
    flexDirection: 'row',
    backgroundColor: C.card,
    borderRadius: radius.md,
    padding: 3,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  modeBtn: { flex: 1, paddingVertical: 9, borderRadius: radius.sm + 1, alignItems: 'center' },
  modeBtnActive: { backgroundColor: C.card2 },
  modeBtnText: { ...font.sm, color: C.textMuted, fontWeight: '500' },
  modeBtnTextActive: { color: C.text, fontWeight: '700' },

  tripCard: {
    backgroundColor: C.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: C.accentSoft,
    padding: 18,
    marginBottom: 16,
  },
  tripLabel: { ...font.xs, fontWeight: '700', color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 },
  tripCounter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24, marginBottom: 14 },
  counterBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: C.card2, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
  },
  counterBtnText: { fontSize: 22, color: C.text, fontWeight: '300' },
  counterValue: { fontSize: 36, fontWeight: '800', color: C.text, minWidth: 60, textAlign: 'center' },
  perPersonRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border },
  perPersonLabel: { ...font.sm, color: C.textSec },
  perPersonAmount: { ...font.lg, fontWeight: '800', color: C.accent },

  card: {
    backgroundColor: C.card, borderRadius: radius.lg,
    borderWidth: 1, borderColor: C.border, marginBottom: 12, overflow: 'hidden',
  },
  itemRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 13,
    paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: C.border, gap: 8,
  },
  itemRowLast: { borderBottomWidth: 0 },
  itemName: { flex: 1, ...font.base, color: C.text },
  qtyBadge: { backgroundColor: C.card2, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  qtyText: { ...font.xs, color: C.textSec, fontWeight: '600' },
  itemPrice: { ...font.base, fontWeight: '700', color: C.text, minWidth: 64, textAlign: 'right' },
  removeBtn: { padding: 4 },
  removeText: { color: C.textMuted, fontSize: 13 },

  addRow: { flexDirection: 'row', gap: 8, marginBottom: 14, alignItems: 'center' },
  addIconBtn: {
    width: 44, height: 44, borderRadius: radius.md,
    backgroundColor: C.card2, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
  },
  addIconText: { fontSize: 22, color: C.text, fontWeight: '300' },

  totalBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 14,
    marginBottom: 20, borderWidth: 1, borderColor: C.border,
  },
  totalLabel: { ...font.sm, color: C.textSec },
  totalAmount: { ...font.lg, fontWeight: '800', color: C.text },

  inputLabel: { ...font.xs, fontWeight: '700', color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  input: {
    backgroundColor: C.card, borderRadius: radius.md, borderWidth: 1, borderColor: C.border,
    paddingVertical: 13, paddingHorizontal: 14, ...font.base, color: C.text, marginBottom: 8,
  },
  primaryBtn: { borderRadius: radius.md, paddingVertical: 16, alignItems: 'center' },
  primaryBtnText: { color: '#fff', ...font.base, fontWeight: '700' },

  // Home
  homeScroll: { padding: 20, paddingBottom: 48 },
  homeHeader: { marginBottom: 28 },
  greeting: { ...font.sm, color: C.textSec, marginBottom: 4 },
  homeTitle: { ...font.xl, fontWeight: '800', color: C.text, marginBottom: 4 },
  homeSub: { ...font.base, color: C.textSec },

  mainBtn: {
    borderRadius: radius.xl, padding: 28, marginBottom: 10,
    shadowColor: C.accent, shadowOpacity: 0.4, shadowRadius: 20, shadowOffset: { width: 0, height: 8 },
  },
  mainBtnEmoji: { fontSize: 40, marginBottom: 10 },
  mainBtnText: { ...font.lg, fontWeight: '800', color: '#fff', marginBottom: 2 },
  mainBtnSub: { ...font.sm, color: 'rgba(255,255,255,0.6)' },

  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.card, borderRadius: radius.lg, padding: 18,
    borderWidth: 1, borderColor: C.border, marginBottom: 16,
  },
  secondaryBtnText: { ...font.base, fontWeight: '600', color: C.text },

  previewWrap: { marginBottom: 16, gap: 10 },
  preview: { width: '100%', height: 200, borderRadius: radius.lg, resizeMode: 'cover' },

  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 8, marginBottom: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: C.border },
  dividerText: { ...font.xs, color: C.textMuted },

  demoBtn: {
    borderWidth: 1, borderColor: C.border, borderRadius: radius.lg,
    paddingVertical: 14, alignItems: 'center', backgroundColor: C.card,
  },
  demoBtnText: { ...font.base, color: C.textSec, fontWeight: '500' },
})
