import { useEffect, useState, useRef } from 'react'
import { View, Text, ScrollView, StyleSheet, Animated } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { supabase, Session, Selection } from '../../lib/supabase'
import { useAuthStore } from '../../lib/store'
import { fmtCurrency } from '../../lib/utils'
import { C, radius, font } from '../../lib/theme'

type GuestStat = { name: string; count: number; total: number }

export default function StatsScreen() {
  const { user, profile } = useAuthStore()
  const [sessions, setSessions] = useState<Session[]>([])
  const [selections, setSelections] = useState<Selection[]>([])
  const [loading, setLoading] = useState(true)
  const fadeAnim = useRef(new Animated.Value(0)).current
  const currency = profile?.currency || 'EUR'

  useEffect(() => {
    if (!user) return
    Promise.all([
      supabase.from('sessions').select('*').eq('owner_id', user.id),
      supabase.from('selections').select('*').in(
        'session_code',
        // Will be populated after sessions load — re-fetch in sessions callback
        ['_placeholder_']
      )
    ]).then(async ([sessRes]) => {
      const sess: Session[] = sessRes.data || []
      setSessions(sess)
      if (sess.length > 0) {
        const codes = sess.map(s => s.code)
        const selRes = await supabase.from('selections').select('*').in('session_code', codes)
        setSelections(selRes.data || [])
      }
      setLoading(false)
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start()
    })
  }, [user])

  const totalHosted = sessions.reduce((s, sess) => s + (sess.total || 0), 0)
  const confirmedSels = selections.filter(s => s.confirmed)
  const totalCollected = confirmedSels.reduce((s, sel) => s + sel.total, 0)
  const avgSession = sessions.length > 0 ? totalHosted / sessions.length : 0

  const guestMap: Record<string, GuestStat> = {}
  confirmedSels.forEach(sel => {
    if (!guestMap[sel.guest_name]) guestMap[sel.guest_name] = { name: sel.guest_name, count: 0, total: 0 }
    guestMap[sel.guest_name].count++
    guestMap[sel.guest_name].total += sel.total
  })
  const topGuests = Object.values(guestMap).sort((a, b) => b.count - a.count).slice(0, 5)

  const thisMonth = new Date()
  const sessionsThisMonth = sessions.filter(s => {
    const d = new Date(s.created_at)
    return d.getMonth() === thisMonth.getMonth() && d.getFullYear() === thisMonth.getFullYear()
  })

  if (loading) return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.center}>
        <Text style={{ color: C.textMuted, ...font.base }}>Loading stats...</Text>
      </View>
    </SafeAreaView>
  )

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <Animated.ScrollView
        style={{ opacity: fadeAnim }}
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={s.title}>Stats</Text>

        {/* Hero card */}
        <LinearGradient
          colors={['#2D1B7A', '#7857FF']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.heroCard}
        >
          <Text style={s.heroLabel}>LIFETIME TOTAL SPLIT</Text>
          <Text style={s.heroAmount}>{fmtCurrency(totalHosted, currency)}</Text>
          <View style={s.heroStatsRow}>
            <View style={s.heroStat}>
              <Text style={s.heroStatNum}>{sessions.length}</Text>
              <Text style={s.heroStatLabel}>sessions</Text>
            </View>
            <View style={s.heroStatDivider} />
            <View style={s.heroStat}>
              <Text style={s.heroStatNum}>{fmtCurrency(avgSession, currency)}</Text>
              <Text style={s.heroStatLabel}>avg bill</Text>
            </View>
            <View style={s.heroStatDivider} />
            <View style={s.heroStat}>
              <Text style={s.heroStatNum}>{confirmedSels.length}</Text>
              <Text style={s.heroStatLabel}>paid</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Stat grid */}
        <View style={s.grid}>
          <StatCard
            label="Collected"
            value={fmtCurrency(totalCollected, currency)}
            sub="confirmed payments"
            emoji="💰"
          />
          <StatCard
            label="Avg session"
            value={fmtCurrency(avgSession, currency)}
            sub="per bill"
            emoji="📋"
          />
          <StatCard
            label="This month"
            value={String(sessionsThisMonth.length)}
            sub="sessions"
            emoji="📅"
          />
          <StatCard
            label="Guests"
            value={String(Object.keys(guestMap).length)}
            sub="unique people"
            emoji="👥"
          />
        </View>

        {/* Top guests */}
        {topGuests.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Top Guests</Text>
            {topGuests.map((g, i) => (
              <View key={g.name} style={s.guestRow}>
                <View style={s.guestRank}>
                  <Text style={s.guestRankText}>#{i + 1}</Text>
                </View>
                <View style={s.guestAvatar}>
                  <Text style={s.guestInitial}>{g.name[0].toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.guestName}>{g.name}</Text>
                  <Text style={s.guestSub}>{g.count} {g.count === 1 ? 'session' : 'sessions'}</Text>
                </View>
                <Text style={s.guestTotal}>{fmtCurrency(g.total, currency)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Recent sessions */}
        {sessions.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Recent Sessions</Text>
            {sessions.slice(0, 5).map(sess => {
              const sessSelections = selections.filter(sel => sel.session_code === sess.code && sel.confirmed)
              return (
                <View key={sess.id} style={s.recentRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.recentName} numberOfLines={1}>{sess.name}</Text>
                    <Text style={s.recentSub}>
                      {sessSelections.length} paid • {new Date(sess.created_at).toLocaleDateString()}
                    </Text>
                  </View>
                  <Text style={s.recentTotal}>{fmtCurrency(sess.total, sess.currency)}</Text>
                </View>
              )
            })}
          </View>
        )}

        {sessions.length === 0 && (
          <View style={s.emptyWrap}>
            <Text style={s.emptyEmoji}>📊</Text>
            <Text style={s.emptyText}>No data yet</Text>
            <Text style={s.emptySub}>Scan a receipt to see your stats here</Text>
          </View>
        )}
      </Animated.ScrollView>
    </SafeAreaView>
  )
}

function StatCard({ label, value, sub, emoji }: { label: string; value: string; sub: string; emoji: string }) {
  return (
    <View style={sc.card}>
      <Text style={sc.emoji}>{emoji}</Text>
      <Text style={sc.value} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={sc.label}>{label}</Text>
      <Text style={sc.sub}>{sub}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 20, paddingBottom: 48 },
  title: { ...font.xl, fontWeight: '700', color: C.text, marginBottom: 20 },

  heroCard: {
    borderRadius: radius.xl,
    padding: 24,
    marginBottom: 16,
    shadowColor: C.accent,
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
  },
  heroLabel: { ...font.xs, color: 'rgba(255,255,255,0.6)', fontWeight: '700', letterSpacing: 1.2, marginBottom: 6 },
  heroAmount: { fontSize: 42, fontWeight: '800', color: '#fff', marginBottom: 16 },
  heroStatsRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: radius.md, padding: 12, gap: 0,
  },
  heroStat: { flex: 1, alignItems: 'center' },
  heroStatNum: { color: '#fff', fontSize: 16, fontWeight: '800', marginBottom: 2 },
  heroStatLabel: { color: 'rgba(255,255,255,0.6)', ...font.xs },
  heroStatDivider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.15)' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },

  section: {
    backgroundColor: C.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    marginBottom: 14,
  },
  sectionTitle: { ...font.sm, fontWeight: '700', color: C.textSec, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 14 },

  guestRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  guestRank: { width: 22 },
  guestRankText: { ...font.xs, color: C.textMuted, fontWeight: '700' },
  guestAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.accentSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  guestInitial: { ...font.sm, fontWeight: '700', color: C.accent },
  guestName: { ...font.base, fontWeight: '600', color: C.text },
  guestSub: { ...font.xs, color: C.textMuted, marginTop: 1 },
  guestTotal: { ...font.base, fontWeight: '700', color: C.text },

  recentRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 10 },
  recentName: { ...font.base, fontWeight: '600', color: C.text },
  recentSub: { ...font.xs, color: C.textMuted, marginTop: 2 },
  recentTotal: { ...font.base, fontWeight: '700', color: C.text },

  emptyWrap: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyEmoji: { fontSize: 48 },
  emptyText: { ...font.md, fontWeight: '600', color: C.text },
  emptySub: { ...font.sm, color: C.textSec, textAlign: 'center' },
})

const sc = StyleSheet.create({
  card: {
    width: '47%',
    backgroundColor: C.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    gap: 2,
  },
  emoji: { fontSize: 22, marginBottom: 6 },
  value: { fontSize: 20, fontWeight: '800', color: C.text },
  label: { ...font.sm, fontWeight: '600', color: C.textSec, marginTop: 2 },
  sub: { ...font.xs, color: C.textMuted },
})
