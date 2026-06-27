import { useEffect, useState, useRef } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Share, Alert, Animated, Linking
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { useLocalSearchParams, useRouter } from 'expo-router'
import QRCode from 'react-native-qrcode-svg'
import { supabase, Session, Selection } from '../../lib/supabase'
import { fmtCurrency, copyToClipboard } from '../../lib/utils'
import { C, radius, font } from '../../lib/theme'
import type { PaymentMethod } from '../../lib/supabase'

type Tab = 'share' | 'guests' | 'payment'

export default function SessionScreen() {
  const { code } = useLocalSearchParams<{ code: string }>()
  const router = useRouter()
  const [session, setSession] = useState<Session | null>(null)
  const [selections, setSelections] = useState<Selection[]>([])
  const [tab, setTab] = useState<Tab>('share')
  const [linkCopied, setLinkCopied] = useState(false)
  const fadeAnim = useRef(new Animated.Value(0)).current
  const tabAnim = useRef(new Animated.Value(0)).current

  const guestUrl = `https://splitbill.app/guest/${code}`

  useEffect(() => {
    supabase.from('sessions').select('*').eq('code', code).single().then(({ data }) => {
      if (data) {
        setSession(data)
        Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start()
      }
    })
    supabase.from('selections').select('*').eq('session_code', code).then(({ data }) => {
      if (data) setSelections(data)
    })

    const channel = supabase
      .channel('sel-' + code)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'selections',
        filter: `session_code=eq.${code}`
      }, payload => {
        if (payload.eventType === 'INSERT') setSelections(prev => [...prev, payload.new as Selection])
        if (payload.eventType === 'UPDATE') setSelections(prev =>
          prev.map(s => s.id === (payload.new as Selection).id ? payload.new as Selection : s)
        )
      }).subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [code])

  function switchTab(t: Tab) {
    setTab(t)
    Animated.spring(tabAnim, { toValue: 0, useNativeDriver: true }).start()
    Animated.timing(tabAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start()
  }

  async function copyLink() {
    await copyToClipboard(guestUrl)
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 2500)
  }

  async function shareLink() {
    await Share.share({
      message: `${session?.name}\nPick what you had and pay in one tap 👇\n${guestUrl}`,
      url: guestUrl,
    })
  }

  async function shareReceipt() {
    if (!session) return
    const confirmed = selections.filter(s => s.confirmed)
    const lines = [
      `🧾 ${session.name}`,
      `Code: #${session.code}`,
      `──────────────────`,
      ...session.items.map(it => `${it.name}${it.qty > 1 ? ` ×${it.qty}` : ''}\t${fmtCurrency(it.price * it.qty, session.currency)}`),
      `──────────────────`,
      `TOTAL: ${fmtCurrency(session.total, session.currency)}`,
      ``,
      confirmed.length > 0 ? `Who paid:` : '',
      ...confirmed.map(sel => `• ${sel.guest_name}: ${fmtCurrency(sel.total, session.currency)}`),
      ``,
      `Powered by SplitBill ⚡`,
    ].filter(Boolean)

    const text = lines.join('\n')
    try {
      await Share.share({ message: text })
    } catch {
      Alert.alert('Share', text)
    }
  }

  function requestPayment(sel: Selection, pm: PaymentMethod) {
    if (pm.type === 'revolut') {
      const note = encodeURIComponent(`${session?.name} - ${sel.guest_name}`)
      Linking.openURL(`https://revolut.me/${pm.value}?amount=${sel.total.toFixed(2)}&currency=${session?.currency || 'EUR'}&description=${note}`)
    } else {
      Alert.alert(
        pm.label,
        `${pm.value}\nAmount: ${fmtCurrency(sel.total, session?.currency)}\nFrom: ${sel.guest_name}`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Copy', onPress: () => copyToClipboard(pm.value) }
        ]
      )
    }
  }

  if (!session) return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.center}><Text style={{ color: C.textSec, fontSize: 28 }}>⏳</Text></View>
    </SafeAreaView>
  )

  const confirmed = selections.filter(sel => sel.confirmed)
  const isTrip = session.session_type === 'trip'

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Text style={s.backArrow}>←</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.sessionName} numberOfLines={1}>{session.name}</Text>
            <Text style={s.sessionMeta}>
              #{session.code} · {isTrip ? `✈️ Trip · ${session.trip_people} people` : `${session.items?.length} items`}
            </Text>
          </View>
          <TouchableOpacity style={s.shareIconBtn} onPress={shareReceipt}>
            <Text style={{ fontSize: 18 }}>📤</Text>
          </TouchableOpacity>
        </View>

        {/* Tab bar */}
        <View style={s.tabs}>
          {(['share', 'guests', 'payment'] as Tab[]).map(t => (
            <TouchableOpacity
              key={t}
              style={[s.tab, tab === t && s.tabActive]}
              onPress={() => switchTab(t)}
            >
              <Text style={[s.tabText, tab === t && s.tabTextActive]}>
                {t === 'share' ? '🔗 Share' : t === 'guests' ? `👥 Guests (${selections.length})` : '💰 Payment'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

          {/* SHARE TAB */}
          {tab === 'share' && (
            <>
              {/* QR code */}
              <View style={s.qrCard}>
                <Text style={s.qrLabel}>SCAN TO JOIN</Text>
                <View style={s.qrWrap}>
                  <QRCode
                    value={guestUrl}
                    size={180}
                    color={C.text}
                    backgroundColor="transparent"
                    quietZone={0}
                  />
                </View>
                <Text style={s.qrUrl} numberOfLines={1}>{guestUrl}</Text>
              </View>

              {/* Action buttons */}
              <TouchableOpacity onPress={shareLink} activeOpacity={0.85}>
                <LinearGradient
                  colors={['#7857FF', '#5537EE']}
                  style={s.primaryBtn}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <Text style={s.primaryBtnText}>📤 Share link with guests</Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity style={s.secondaryBtn} onPress={copyLink}>
                <Text style={s.secondaryBtnText}>
                  {linkCopied ? '✓  Link copied!' : '📋  Copy link'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.receiptBtn} onPress={shareReceipt}>
                <Text style={s.receiptBtnText}>🧾  Share receipt summary</Text>
              </TouchableOpacity>

              {/* Live status */}
              <View style={s.statusRow}>
                <View style={[s.statusDot, { backgroundColor: selections.length > 0 ? C.success : C.warn }]} />
                <Text style={s.statusText}>
                  {selections.length === 0
                    ? 'Waiting for guests to join...'
                    : `${confirmed.length}/${selections.length} guests confirmed`
                  }
                </Text>
              </View>
            </>
          )}

          {/* GUESTS TAB */}
          {tab === 'guests' && (
            <>
              {selections.length === 0 ? (
                <View style={s.emptyCard}>
                  <Text style={{ fontSize: 36, marginBottom: 10 }}>⏳</Text>
                  <Text style={s.emptyTitle}>Waiting for guests</Text>
                  <Text style={s.emptyText}>Share the QR code or link to get started</Text>
                </View>
              ) : (
                selections.map(sel => {
                  const itemNames = (sel.item_ids as unknown as string[])
                    .map(id => session.items.find(it => it.id === id)?.name)
                    .filter(Boolean)
                  return (
                    <View key={sel.id} style={s.guestCard}>
                      <View style={s.guestCardTop}>
                        <View style={[s.guestStatus, { backgroundColor: sel.confirmed ? C.successSoft : C.warnSoft }]}>
                          <View style={[s.guestDot, { backgroundColor: sel.confirmed ? C.success : C.warn }]} />
                          <Text style={[s.guestStatusText, { color: sel.confirmed ? C.success : C.warn }]}>
                            {sel.confirmed ? 'Confirmed' : 'Pending'}
                          </Text>
                        </View>
                        <Text style={s.guestName}>{sel.guest_name}</Text>
                        <Text style={s.guestTotal}>{fmtCurrency(sel.total, session.currency)}</Text>
                      </View>
                      {itemNames.length > 0 && (
                        <Text style={s.guestItems} numberOfLines={2}>
                          {isTrip
                            ? `Equal share${sel.tip_percent > 0 ? ` + ${sel.tip_percent}% tip` : ''}`
                            : itemNames.join(', ')
                          }
                        </Text>
                      )}
                    </View>
                  )
                })
              )}
            </>
          )}

          {/* PAYMENT TAB */}
          {tab === 'payment' && (
            <>
              {confirmed.length === 0 ? (
                <View style={s.emptyCard}>
                  <Text style={{ fontSize: 36, marginBottom: 10 }}>💬</Text>
                  <Text style={s.emptyTitle}>No confirmations yet</Text>
                  <Text style={s.emptyText}>Share the link and wait for guests to confirm</Text>
                </View>
              ) : (
                confirmed.map(sel => (
                  <View key={sel.id} style={s.payCard}>
                    <View style={s.payCardTop}>
                      <View style={s.payAvatar}>
                        <Text style={s.payAvatarText}>{sel.guest_name[0].toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.payGuestName}>{sel.guest_name}</Text>
                        <Text style={s.payItems} numberOfLines={1}>
                          {isTrip ? 'Equal share' : (sel.item_ids as unknown as string[]).map(id => session.items.find(it => it.id === id)?.name).filter(Boolean).join(', ')}
                          {sel.tip_percent > 0 ? ` + ${sel.tip_percent}% tip` : ''}
                        </Text>
                      </View>
                      <Text style={s.payTotal}>{fmtCurrency(sel.total, session.currency)}</Text>
                    </View>
                    <View style={s.payBtns}>
                      {session.owner_payment_methods?.map((pm: PaymentMethod) => (
                        <TouchableOpacity
                          key={pm.id}
                          style={[s.payBtn, pm.is_default && s.payBtnDefault]}
                          onPress={() => requestPayment(sel, pm)}
                        >
                          <Text style={s.payBtnText}>
                            {pm.type === 'revolut' ? '💳' : pm.type === 'iban' ? '🏦' : '🅿️'} {pm.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ))
              )}

              {confirmed.length > 0 && (
                <LinearGradient colors={['#13103a', '#0f0f23']} style={s.totalBar}>
                  <Text style={s.totalLabel}>Total to collect</Text>
                  <Text style={s.totalAmount}>
                    {fmtCurrency(confirmed.reduce((s, sel) => s + sel.total, 0), session.currency)}
                  </Text>
                </LinearGradient>
              )}
            </>
          )}
        </ScrollView>
      </Animated.View>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: radius.md,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
  },
  backArrow: { fontSize: 18, color: C.textSec },
  sessionName: { ...font.md, fontWeight: '700', color: C.text },
  sessionMeta: { ...font.xs, color: C.textMuted, marginTop: 2 },
  shareIconBtn: {
    width: 36, height: 36, borderRadius: radius.md,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
  },

  tabs: {
    flexDirection: 'row', gap: 6, paddingHorizontal: 16,
    marginBottom: 8,
  },
  tab: {
    flex: 1, paddingVertical: 9, borderRadius: radius.md,
    borderWidth: 1, borderColor: C.border, alignItems: 'center',
    backgroundColor: C.card,
  },
  tabActive: { backgroundColor: C.card2, borderColor: C.accent },
  tabText: { ...font.xs, fontWeight: '600', color: C.textMuted },
  tabTextActive: { color: C.accent },

  scroll: { padding: 16, paddingBottom: 48 },

  // Share tab
  qrCard: {
    backgroundColor: C.card, borderRadius: radius.xl, borderWidth: 1, borderColor: C.border,
    padding: 24, alignItems: 'center', marginBottom: 14,
  },
  qrLabel: { ...font.xs, fontWeight: '700', color: C.textMuted, letterSpacing: 1, marginBottom: 20 },
  qrWrap: {
    backgroundColor: 'rgba(240,240,255,0.04)',
    borderRadius: radius.lg,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  qrUrl: { ...font.xs, color: C.textMuted, maxWidth: 220 },

  primaryBtn: { borderRadius: radius.md, paddingVertical: 15, alignItems: 'center', marginBottom: 8 },
  primaryBtnText: { color: '#fff', ...font.base, fontWeight: '700' },
  secondaryBtn: {
    borderWidth: 1, borderColor: C.border, borderRadius: radius.md,
    paddingVertical: 13, alignItems: 'center', backgroundColor: C.card, marginBottom: 8,
  },
  secondaryBtnText: { ...font.base, color: C.text, fontWeight: '600' },
  receiptBtn: {
    borderWidth: 1, borderColor: C.border, borderRadius: radius.md,
    paddingVertical: 13, alignItems: 'center', backgroundColor: C.card, marginBottom: 20,
  },
  receiptBtnText: { ...font.base, color: C.textSec, fontWeight: '500' },
  statusRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.card, borderRadius: radius.md, padding: 12,
    borderWidth: 1, borderColor: C.border,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { ...font.sm, color: C.textSec },

  // Guests tab
  emptyCard: {
    backgroundColor: C.card, borderRadius: radius.lg, padding: 32,
    alignItems: 'center', borderWidth: 1, borderColor: C.border,
  },
  emptyTitle: { ...font.base, fontWeight: '600', color: C.text, marginBottom: 4 },
  emptyText: { ...font.sm, color: C.textSec, textAlign: 'center' },
  guestCard: {
    backgroundColor: C.card, borderRadius: radius.lg, padding: 14,
    borderWidth: 1, borderColor: C.border, marginBottom: 8,
  },
  guestCardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 8 },
  guestStatus: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4 },
  guestDot: { width: 6, height: 6, borderRadius: 3 },
  guestStatusText: { ...font.xs, fontWeight: '700' },
  guestName: { flex: 1, ...font.base, fontWeight: '600', color: C.text },
  guestTotal: { ...font.base, fontWeight: '800', color: C.text },
  guestItems: { ...font.sm, color: C.textMuted },

  // Payment tab
  payCard: {
    backgroundColor: C.card, borderRadius: radius.lg, padding: 14,
    borderWidth: 1, borderColor: C.border, marginBottom: 8,
  },
  payCardTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  payAvatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center',
  },
  payAvatarText: { ...font.sm, fontWeight: '800', color: C.accent },
  payGuestName: { ...font.base, fontWeight: '600', color: C.text },
  payItems: { ...font.xs, color: C.textMuted, marginTop: 2 },
  payTotal: { ...font.lg, fontWeight: '800', color: C.text },
  payBtns: { flexDirection: 'row', gap: 8 },
  payBtn: {
    flex: 1, paddingVertical: 9, borderWidth: 1, borderColor: C.border,
    borderRadius: radius.md, alignItems: 'center', backgroundColor: C.card2,
  },
  payBtnDefault: { borderColor: C.accentSoft },
  payBtnText: { ...font.xs, fontWeight: '600', color: C.text },

  totalBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderRadius: radius.md, padding: 16, marginTop: 4,
    borderWidth: 1, borderColor: C.border,
  },
  totalLabel: { ...font.sm, color: C.textSec },
  totalAmount: { ...font.lg, fontWeight: '800', color: C.text },
})
