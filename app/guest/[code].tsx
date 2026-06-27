import { useEffect, useState, useRef } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, TextInput, ActivityIndicator, Linking, Animated, Alert
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { useLocalSearchParams } from 'expo-router'
import { supabase, Session } from '../../lib/supabase'
import { fmtCurrency, copyToClipboard } from '../../lib/utils'
import { C, radius, font } from '../../lib/theme'
import type { PaymentMethod } from '../../lib/supabase'

type Screen = 'name' | 'select' | 'confirmed'

async function sendPushNotification(pushToken: string, title: string, body: string, data: object) {
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ to: pushToken, title, body, data, sound: 'default' }),
    })
  } catch {
    // Push notification failed silently
  }
}

export default function GuestScreen() {
  const { code } = useLocalSearchParams<{ code: string }>()
  const [session, setSession] = useState<Session | null>(null)
  const [screen, setScreen] = useState<Screen>('name')
  const [name, setName] = useState('')
  const [itemQty, setItemQty] = useState<Record<string, number>>({})
  const [tipPct, setTipPct] = useState(0)
  const [saving, setSaving] = useState(false)
  const [myTotal, setMyTotal] = useState(0)
  const fadeAnim = useRef(new Animated.Value(0)).current
  const successScale = useRef(new Animated.Value(0)).current

  useEffect(() => {
    supabase.from('sessions').select('*').eq('code', code).single().then(({ data }) => {
      if (data) {
        setSession(data)
        // In trip mode, pre-calculate equal share
        if (data.session_type === 'trip' && data.trip_people) {
          const share = data.total / data.trip_people
          setMyTotal(parseFloat(share.toFixed(2)))
        }
        Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start()
      }
    })
  }, [code])

  useEffect(() => {
    if (!session || session.session_type === 'trip') return
    const base = Object.entries(itemQty).reduce((s, [id, qty]) => {
      const item = session.items.find(it => it.id === id)
      return s + (item ? item.price * qty : 0)
    }, 0)
    setMyTotal(parseFloat((base * (1 + tipPct / 100)).toFixed(2)))
  }, [itemQty, tipPct, session])

  useEffect(() => {
    if (session?.session_type === 'trip' && tipPct > 0) {
      const base = session.total / (session.trip_people || 2)
      setMyTotal(parseFloat((base * (1 + tipPct / 100)).toFixed(2)))
    }
  }, [tipPct, session])

  function setQty(id: string, qty: number) {
    setItemQty(prev => ({ ...prev, [id]: Math.max(0, qty) }))
  }

  function toggleItem(id: string) {
    setItemQty(prev => ({ ...prev, [id]: prev[id] ? 0 : 1 }))
  }

  const hasSelection = Object.values(itemQty).some(q => q > 0)

  async function confirm() {
    if (!name.trim()) return
    if (session?.session_type !== 'trip' && !hasSelection) return
    setSaving(true)

    const flatItemIds = session?.session_type === 'trip'
      ? []
      : Object.entries(itemQty).flatMap(([id, qty]) => Array(qty).fill(id))

    const payload = {
      session_code: code,
      guest_name: name.trim(),
      item_ids: flatItemIds,
      total: myTotal,
      tip_percent: tipPct,
      confirmed: true
    }

    const { data: existing } = await supabase
      .from('selections').select('id').eq('session_code', code).eq('guest_name', name.trim()).single()

    if (existing) {
      await supabase.from('selections').update(payload).eq('id', existing.id)
    } else {
      await supabase.from('selections').insert(payload)
    }

    // Push notification to host
    if (session?.owner_push_token) {
      await sendPushNotification(
        session.owner_push_token,
        '💰 New payment confirmed!',
        `${name.trim()} confirmed ${fmtCurrency(myTotal, session.currency)}`,
        { sessionCode: code }
      )
    }

    setSaving(false)
    setScreen('confirmed')
    Animated.spring(successScale, { toValue: 1, tension: 50, friction: 6, useNativeDriver: true }).start()
  }

  function pay(pm: PaymentMethod) {
    if (pm.type === 'revolut') {
      const note = encodeURIComponent(`${session?.name} - ${name}`)
      Linking.openURL(`https://revolut.me/${pm.value}?amount=${myTotal}&currency=${session?.currency || 'EUR'}&description=${note}`)
    } else {
      copyToClipboard(pm.value)
      Alert.alert('Copied!', `${pm.label}: ${pm.value}`)
    }
  }

  if (!session) return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <View style={s.center}><ActivityIndicator color={C.accent} size="large" /></View>
    </SafeAreaView>
  )

  const isEqualSplit = session.session_type === 'trip'
  const payMethods: PaymentMethod[] = session.owner_payment_methods || []

  // ── Name screen ───────────────────────────────────────────────
  if (screen === 'name') return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <Animated.View style={[s.nameContainer, { opacity: fadeAnim }]}>
        <LinearGradient colors={['#7857FF', '#4F37CC']} style={s.sessionBadge}>
          <Text style={{ fontSize: 28 }}>{isEqualSplit ? '⚖️' : '🧾'}</Text>
        </LinearGradient>
        <Text style={s.sessionTitle}>{session.name}</Text>
        <Text style={s.sessionHost}>{session.owner_name} invites you to split the bill</Text>
        {isEqualSplit && (
          <View style={s.tripInfo}>
            <Text style={s.tripInfoText}>
              Equal split · {session.trip_people} people · {fmtCurrency(session.total / (session.trip_people || 2), session.currency)} each
            </Text>
          </View>
        )}

        <View style={s.nameInputWrap}>
          <Text style={s.inputLabel}>YOUR NAME</Text>
          <TextInput
            style={s.input}
            placeholder="Enter your name..."
            placeholderTextColor={C.textMuted}
            value={name}
            onChangeText={setName}
            autoFocus
          />
          <TouchableOpacity
            disabled={!name.trim()}
            onPress={() => name.trim() && setScreen('select')}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={!name.trim() ? ['#2a2040', '#1a1530'] : ['#7857FF', '#5537EE']}
              style={s.primaryBtn}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={s.primaryBtnText}>Continue →</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </SafeAreaView>
  )

  // ── Select screen ─────────────────────────────────────────────
  if (screen === 'select') return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView contentContainerStyle={s.selectScroll} showsVerticalScrollIndicator={false}>
        <View style={s.selectHeader}>
          <TouchableOpacity onPress={() => setScreen('name')} style={s.backBtn}>
            <Text style={s.backArrow}>←</Text>
          </TouchableOpacity>
          <View>
            <Text style={s.greeting}>Hi, {name}! 👋</Text>
            <Text style={s.subGreeting}>{session.name}</Text>
          </View>
        </View>

        {isEqualSplit ? (
          /* Equal split — equal share, just confirm */
          <View style={s.tripCard}>
            <Text style={s.tripCardEmoji}>⚖️</Text>
            <Text style={s.tripCardTitle}>Equal Split</Text>
            <Text style={s.tripCardSub}>The total is split equally between {session.trip_people} people</Text>
            <View style={s.tripShareRow}>
              <Text style={s.tripShareLabel}>Your share</Text>
              <Text style={s.tripShareAmount}>{fmtCurrency(session.total / (session.trip_people || 2), session.currency)}</Text>
            </View>
          </View>
        ) : (
          /* Per-item mode */
          <>
            <Text style={s.sectionLabel}>WHAT DID YOU HAVE?</Text>
            <View style={s.itemsCard}>
              {session.items.map((item, idx) => {
                const qty = itemQty[item.id] || 0
                const isLast = idx === session.items.length - 1

                if (item.qty > 1) {
                  // Stepper for multi-quantity items
                  return (
                    <View
                      key={item.id}
                      style={[
                        s.itemRow,
                        isLast && s.itemRowLast,
                        qty > 0 && s.itemRowSelected,
                      ]}
                    >
                      <View style={s.stepper}>
                        <TouchableOpacity
                          style={[s.stepBtn, qty === 0 && { opacity: 0.3 }]}
                          onPress={() => setQty(item.id, qty - 1)}
                          disabled={qty === 0}
                        >
                          <Text style={s.stepBtnText}>−</Text>
                        </TouchableOpacity>
                        <Text style={[s.stepCount, qty > 0 && { color: C.accent }]}>{qty}</Text>
                        <TouchableOpacity
                          style={[s.stepBtn, qty >= item.qty && { opacity: 0.3 }]}
                          onPress={() => setQty(item.id, qty + 1)}
                          disabled={qty >= item.qty}
                        >
                          <Text style={s.stepBtnText}>+</Text>
                        </TouchableOpacity>
                      </View>
                      <Text style={[s.itemName, qty > 0 && { color: C.text }]} numberOfLines={1}>{item.name}</Text>
                      <View style={s.qtyBadge}><Text style={s.qtyText}>max {item.qty}</Text></View>
                      <Text style={[s.itemPrice, qty > 0 && { color: C.text }]}>{fmtCurrency(item.price, session.currency)}</Text>
                    </View>
                  )
                }

                // Checkbox for single items
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      s.itemRow,
                      isLast && s.itemRowLast,
                      qty > 0 && s.itemRowSelected,
                    ]}
                    onPress={() => toggleItem(item.id)}
                    activeOpacity={0.8}
                  >
                    <View style={[s.checkbox, qty > 0 && s.checkboxActive]}>
                      {qty > 0 && <Text style={s.checkMark}>✓</Text>}
                    </View>
                    <Text style={[s.itemName, qty > 0 && { color: C.text }]} numberOfLines={1}>{item.name}</Text>
                    <Text style={[s.itemPrice, qty > 0 && { color: C.text }]}>{fmtCurrency(item.price, session.currency)}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </>
        )}

        {/* Tip selector */}
        <Text style={s.sectionLabel}>TIP</Text>
        <View style={s.tipRow}>
          {[0, 10, 15, 20].map(pct => (
            <TouchableOpacity
              key={pct}
              style={[s.tipBtn, tipPct === pct && s.tipBtnActive]}
              onPress={() => setTipPct(pct)}
            >
              <Text style={[s.tipBtnText, tipPct === pct && s.tipBtnTextActive]}>
                {pct === 0 ? 'None' : `${pct}%`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Total */}
        <LinearGradient colors={['#13103a', '#0f0f23']} style={s.totalBar}>
          <View>
            <Text style={s.totalLabel}>My total</Text>
            {tipPct > 0 && <Text style={s.tipNote}>incl. {tipPct}% tip</Text>}
          </View>
          <Text style={s.totalAmount}>{fmtCurrency(myTotal, session.currency)}</Text>
        </LinearGradient>

        <TouchableOpacity
          disabled={(!hasSelection && !isEqualSplit) || saving}
          onPress={confirm}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={(!hasSelection && !isEqualSplit) || saving ? ['#2a2040', '#1a1530'] : ['#7857FF', '#5537EE']}
            style={s.primaryBtn}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.primaryBtnText}>✓ Confirm selection</Text>
            }
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )

  // ── Confirmed screen ──────────────────────────────────────────
  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <View style={s.confirmedContainer}>
        <Animated.View style={{ transform: [{ scale: successScale }] }}>
          <LinearGradient colors={['#22c55e', '#16a34a']} style={s.successCircle}>
            <Text style={{ fontSize: 36 }}>✓</Text>
          </LinearGradient>
        </Animated.View>
        <Text style={s.confirmedTitle}>All done!</Text>
        <Text style={s.confirmedSub}>Now send the money to {session.owner_name}</Text>

        <LinearGradient colors={['#13103a', '#0f0f23']} style={s.confirmedTotal}>
          <Text style={s.totalLabel}>Amount to pay</Text>
          <Text style={s.totalAmount}>{fmtCurrency(myTotal, session.currency)}</Text>
        </LinearGradient>

        <View style={s.payMethodsWrap}>
          {payMethods.length > 0 ? payMethods.map(pm => (
            <TouchableOpacity key={pm.id} onPress={() => pay(pm)} activeOpacity={0.85}>
              <LinearGradient
                colors={pm.is_default ? ['#7857FF', '#5537EE'] : [C.card, C.card2]}
                style={s.payMethodBtn}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={{ fontSize: 18 }}>
                  {pm.type === 'revolut' ? '💳' : pm.type === 'iban' ? '🏦' : '🅿️'}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.payMethodLabel}>{pm.label}</Text>
                  <Text style={s.payMethodSub}>
                    {pm.type === 'revolut' ? 'Open Revolut' : `Copy ${pm.type.toUpperCase()}`}
                  </Text>
                </View>
                <Text style={{ color: pm.is_default ? '#fff' : C.textSec, fontSize: 18 }}>→</Text>
              </LinearGradient>
            </TouchableOpacity>
          )) : (
            <View style={s.noPayCard}>
              <Text style={s.noPayText}>Contact {session.owner_name} directly to arrange payment.</Text>
            </View>
          )}
        </View>
      </View>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Name
  nameContainer: { flex: 1, padding: 28, alignItems: 'center', justifyContent: 'center' },
  sessionBadge: {
    width: 72, height: 72, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
    shadowColor: C.accent, shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 6 },
  },
  sessionTitle: { ...font.lg, fontWeight: '800', color: C.text, textAlign: 'center', marginBottom: 6 },
  sessionHost: { ...font.base, color: C.textSec, textAlign: 'center', marginBottom: 16 },
  tripInfo: {
    backgroundColor: C.accentSoft, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: 'rgba(120,87,255,0.2)', marginBottom: 8,
  },
  tripInfoText: { ...font.sm, color: C.accent, fontWeight: '600', textAlign: 'center' },
  nameInputWrap: { width: '100%', marginTop: 32, gap: 8 },
  inputLabel: { ...font.xs, fontWeight: '700', color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
  input: {
    backgroundColor: C.card, borderRadius: radius.md, borderWidth: 1, borderColor: C.border,
    paddingVertical: 14, paddingHorizontal: 16, ...font.base, color: C.text,
  },
  primaryBtn: { borderRadius: radius.md, paddingVertical: 16, alignItems: 'center' },
  primaryBtnText: { color: '#fff', ...font.base, fontWeight: '700' },

  // Select
  selectScroll: { padding: 20, paddingBottom: 48 },
  selectHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
  backBtn: {
    width: 36, height: 36, borderRadius: radius.md,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
  },
  backArrow: { fontSize: 18, color: C.textSec },
  greeting: { ...font.md, fontWeight: '700', color: C.text },
  subGreeting: { ...font.sm, color: C.textSec },

  sectionLabel: { ...font.xs, fontWeight: '700', color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },

  tripCard: {
    backgroundColor: C.card, borderRadius: radius.xl, borderWidth: 1,
    borderColor: C.accentSoft, padding: 24, alignItems: 'center', marginBottom: 20,
  },
  tripCardEmoji: { fontSize: 36, marginBottom: 10 },
  tripCardTitle: { ...font.md, fontWeight: '700', color: C.text, marginBottom: 4 },
  tripCardSub: { ...font.sm, color: C.textSec, textAlign: 'center', marginBottom: 16 },
  tripShareRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', paddingTop: 14, borderTopWidth: 1, borderTopColor: C.border },
  tripShareLabel: { ...font.base, color: C.textSec },
  tripShareAmount: { ...font.lg, fontWeight: '800', color: C.accent },

  itemsCard: {
    backgroundColor: C.card, borderRadius: radius.lg, borderWidth: 1, borderColor: C.border,
    marginBottom: 20, overflow: 'hidden',
  },
  itemRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 14,
    paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: C.border, gap: 10,
  },
  itemRowLast: { borderBottomWidth: 0 },
  itemRowSelected: { backgroundColor: C.accentGlow },
  checkbox: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center', backgroundColor: C.card2,
  },
  checkboxActive: { backgroundColor: C.accent, borderColor: C.accent },
  checkMark: { color: '#fff', fontSize: 12, fontWeight: '800' },
  itemName: { flex: 1, ...font.base, color: C.textSec },
  qtyBadge: { backgroundColor: C.card2, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  qtyText: { ...font.xs, color: C.textMuted, fontWeight: '600' },

  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepBtn: {
    width: 26, height: 26, borderRadius: 8,
    backgroundColor: C.card2, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
  },
  stepBtnText: { color: C.text, fontSize: 15, fontWeight: '700', lineHeight: 18 },
  stepCount: { ...font.base, fontWeight: '800', color: C.textSec, minWidth: 18, textAlign: 'center' },
  itemPrice: { ...font.base, fontWeight: '700', color: C.textSec },

  tipRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  tipBtn: {
    flex: 1, paddingVertical: 11, borderRadius: radius.md,
    borderWidth: 1, borderColor: C.border, alignItems: 'center', backgroundColor: C.card,
  },
  tipBtnActive: { backgroundColor: C.accentSoft, borderColor: C.accent },
  tipBtnText: { ...font.sm, fontWeight: '600', color: C.textMuted },
  tipBtnTextActive: { color: C.accent },

  totalBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderRadius: radius.md, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: C.border,
  },
  totalLabel: { ...font.sm, color: C.textSec },
  tipNote: { ...font.xs, color: C.textMuted, marginTop: 2 },
  totalAmount: { ...font.xl, fontWeight: '800', color: C.text },

  // Confirmed
  confirmedContainer: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center' },
  successCircle: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
    shadowColor: C.success, shadowOpacity: 0.6, shadowRadius: 20, shadowOffset: { width: 0, height: 8 },
  },
  confirmedTitle: { ...font.xl, fontWeight: '800', color: C.text, marginBottom: 6 },
  confirmedSub: { ...font.base, color: C.textSec, marginBottom: 24 },
  confirmedTotal: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderRadius: radius.md, padding: 16, marginBottom: 20, width: '100%',
    borderWidth: 1, borderColor: C.border,
  },
  payMethodsWrap: { width: '100%', gap: 8 },
  payMethodBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: radius.md, paddingVertical: 14, paddingHorizontal: 16,
    borderWidth: 1, borderColor: C.border,
  },
  payMethodLabel: { ...font.base, fontWeight: '600', color: C.text },
  payMethodSub: { ...font.xs, color: C.textSec, marginTop: 1 },
  noPayCard: { backgroundColor: C.card, borderRadius: radius.md, padding: 18, borderWidth: 1, borderColor: C.border },
  noPayText: { ...font.sm, color: C.textSec, textAlign: 'center' },
})
