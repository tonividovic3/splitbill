import { useEffect, useState, useRef } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Animated, FlatList, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { supabase, Session } from '../../lib/supabase'
import { useAuthStore } from '../../lib/store'
import { fmtCurrency } from '../../lib/utils'
import { C, radius, font } from '../../lib/theme'

export default function HistoryScreen() {
  const router = useRouter()
  const { user } = useAuthStore()
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const fadeAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (!user) return
    supabase
      .from('sessions')
      .select('*')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setSessions(data)
        setLoading(false)
        Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start()
      })
  }, [user])

  if (loading) return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.center}><ActivityIndicator color={C.accent} size="large" /></View>
    </SafeAreaView>
  )

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <Text style={s.title}>Sessions</Text>
        <Text style={s.count}>{sessions.length} total</Text>
      </View>

      {sessions.length === 0 ? (
        <Animated.View style={[s.empty, { opacity: fadeAnim }]}>
          <Text style={s.emptyEmoji}>🧾</Text>
          <Text style={s.emptyText}>No sessions yet</Text>
          <Text style={s.emptySub}>Scan a receipt to get started</Text>
        </Animated.View>
      ) : (
        <Animated.View style={[{ flex: 1 }, { opacity: fadeAnim }]}>
          <FlatList
            data={sessions}
            keyExtractor={s => s.id}
            contentContainerStyle={s.list}
            showsVerticalScrollIndicator={false}
            renderItem={({ item, index }) => (
              <SessionCard session={item} index={index} onPress={() => router.push(`/session/${item.code}`)} />
            )}
          />
        </Animated.View>
      )}
    </SafeAreaView>
  )
}

function SessionCard({ session, index, onPress }: { session: Session; index: number; onPress: () => void }) {
  const scaleAnim = useRef(new Animated.Value(1)).current
  const isTrip = session.session_type === 'trip'

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={s.card}
        onPress={onPress}
        onPressIn={() => Animated.spring(scaleAnim, { toValue: 0.97, useNativeDriver: true, speed: 50 }).start()}
        onPressOut={() => Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 50 }).start()}
        activeOpacity={1}
      >
        <View style={s.cardLeft}>
          <View style={s.cardIcon}>
            <Text style={{ fontSize: 20 }}>{isTrip ? '✈️' : '🧾'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.cardName} numberOfLines={1}>{session.name}</Text>
            <Text style={s.cardMeta}>
              {session.items?.length || 0} items{isTrip ? ' · Trip mode' : ''} · {new Date(session.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
            </Text>
          </View>
        </View>
        <View style={s.cardRight}>
          <Text style={s.cardTotal}>{fmtCurrency(session.total, session.currency)}</Text>
          <View style={s.codeBadge}>
            <Text style={s.codeText}>#{session.code}</Text>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  )
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  title: { ...font.xl, fontWeight: '700', color: C.text },
  count: { ...font.sm, color: C.textMuted },
  list: { padding: 16, paddingBottom: 40, gap: 10 },
  card: {
    backgroundColor: C.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardIcon: {
    width: 44, height: 44, borderRadius: radius.md,
    backgroundColor: C.card2,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.border,
  },
  cardName: { ...font.base, fontWeight: '600', color: C.text, marginBottom: 3 },
  cardMeta: { ...font.xs, color: C.textMuted },
  cardRight: { alignItems: 'flex-end', gap: 4 },
  cardTotal: { ...font.md, fontWeight: '700', color: C.text },
  codeBadge: {
    backgroundColor: C.card2,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: C.border,
  },
  codeText: { ...font.xs, color: C.textMuted, fontWeight: '600' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyEmoji: { fontSize: 52 },
  emptyText: { ...font.md, fontWeight: '600', color: C.text },
  emptySub: { ...font.sm, color: C.textSec },
})
