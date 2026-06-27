import { useEffect, useState, useRef } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, Animated,
  ActivityIndicator, ScrollView, TextInput, Modal, Alert
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { supabase, Session, Item } from '../../lib/supabase'
import { useAuthStore } from '../../lib/store'
import { fmtCurrency } from '../../lib/utils'
import { C, radius, font } from '../../lib/theme'
import type { RecurringTemplate } from '../../lib/supabase'

export default function HistoryScreen() {
  const router = useRouter()
  const { user, profile, setPendingTemplate, saveRecurringTemplate, deleteRecurringTemplate } = useAuthStore()
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewTemplate, setShowNewTemplate] = useState(false)
  const [frequentContacts, setFrequentContacts] = useState<string[]>([])
  const fadeAnim = useRef(new Animated.Value(0)).current

  // New template form state
  const [tplName, setTplName] = useState('')
  const [tplItems, setTplItems] = useState<Item[]>([])
  const [tplContacts, setTplContacts] = useState<Set<string>>(new Set())
  const [newItemName, setNewItemName] = useState('')
  const [newItemPrice, setNewItemPrice] = useState('')
  const [savingTpl, setSavingTpl] = useState(false)

  const templates: RecurringTemplate[] = profile?.recurring_templates || []

  useEffect(() => {
    if (!user) return
    supabase
      .from('sessions')
      .select('*')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false })
      .then(async ({ data }) => {
        if (data) {
          setSessions(data)
          // Derive frequent contacts from selections
          const codes = data.map(s => s.code)
          if (codes.length > 0) {
            const { data: sels } = await supabase
              .from('selections')
              .select('guest_name')
              .in('session_code', codes)
            if (sels) {
              const counts: Record<string, number> = {}
              sels.forEach(s => { counts[s.guest_name] = (counts[s.guest_name] || 0) + 1 })
              const sorted = Object.entries(counts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 8)
                .map(([name]) => name)
              setFrequentContacts(sorted)
            }
          }
        }
        setLoading(false)
        Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start()
      })
  }, [user])

  function addTplItem() {
    const price = parseFloat(newItemPrice.replace(',', '.'))
    if (!newItemName.trim() || isNaN(price)) return
    setTplItems(prev => [...prev, { id: Date.now().toString(), name: newItemName.trim(), price, qty: 1 }])
    setNewItemName('')
    setNewItemPrice('')
  }

  function toggleContact(name: string) {
    setTplContacts(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  async function saveTemplate() {
    if (!tplName.trim() || tplItems.length === 0) return
    setSavingTpl(true)
    await saveRecurringTemplate(tplName.trim(), tplItems, [...tplContacts])
    setSavingTpl(false)
    setShowNewTemplate(false)
    setTplName(''); setTplItems([]); setTplContacts(new Set())
  }

  function useTemplate(t: RecurringTemplate) {
    setPendingTemplate(t)
    router.replace('/tabs/home')
  }

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

      <Animated.ScrollView style={{ opacity: fadeAnim, flex: 1 }} showsVerticalScrollIndicator={false}>

        {/* ── Recurring Templates ─────────────────────────────────── */}
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>Recurring Templates</Text>
          <TouchableOpacity onPress={() => setShowNewTemplate(true)} style={s.newTplBtn}>
            <Text style={s.newTplText}>+ New</Text>
          </TouchableOpacity>
        </View>

        {templates.length === 0 ? (
          <TouchableOpacity style={s.emptyTpl} onPress={() => setShowNewTemplate(true)}>
            <Text style={{ fontSize: 28, marginBottom: 6 }}>📋</Text>
            <Text style={[font.sm, { color: C.textSec }]}>Save a template for monthly rent,</Text>
            <Text style={[font.sm, { color: C.textSec }]}>utilities, subscriptions and more</Text>
            <Text style={[font.xs, { color: C.accent, marginTop: 8, fontWeight: '700' }]}>+ Create first template</Text>
          </TouchableOpacity>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tplScroll}>
            {templates.map(t => (
              <View key={t.id} style={s.tplCard}>
                <Text style={s.tplEmoji}>📋</Text>
                <Text style={s.tplName} numberOfLines={1}>{t.name}</Text>
                <Text style={s.tplMeta}>{t.items.length} items</Text>
                {t.contacts.length > 0 && (
                  <Text style={s.tplContacts} numberOfLines={1}>
                    👥 {t.contacts.slice(0, 3).join(', ')}
                  </Text>
                )}
                <TouchableOpacity style={s.tplUseBtn} onPress={() => useTemplate(t)}>
                  <Text style={s.tplUseBtnText}>Use →</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ position: 'absolute', top: 10, right: 10 }}
                  onPress={() => Alert.alert('Delete template?', `"${t.name}" will be removed.`, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: () => deleteRecurringTemplate(t.id) },
                  ])}
                >
                  <Text style={{ color: C.textMuted, fontSize: 14 }}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}

        {/* ── Sessions List ─────────────────────────────────────── */}
        <View style={[s.sectionHeader, { marginTop: 8 }]}>
          <Text style={s.sectionTitle}>History</Text>
        </View>

        {sessions.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyEmoji}>🧾</Text>
            <Text style={s.emptyText}>No sessions yet</Text>
            <Text style={s.emptySub}>Scan a receipt to get started</Text>
          </View>
        ) : (
          sessions.map((item, index) => (
            <View key={item.id} style={{ paddingHorizontal: 16, marginBottom: 8 }}>
              <SessionCard session={item} index={index} onPress={() => router.push(`/session/${item.code}`)} />
            </View>
          ))
        )}

      </Animated.ScrollView>

      {/* ── New Template Modal ─────────────────────────────────── */}
      <Modal visible={showNewTemplate} animationType="slide" transparent onRequestClose={() => setShowNewTemplate(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={[font.md, { color: C.text, fontWeight: '700' }]}>New Template</Text>
              <TouchableOpacity onPress={() => setShowNewTemplate(false)}>
                <Text style={{ color: C.textMuted, fontSize: 20 }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={s.inputLabel}>TEMPLATE NAME</Text>
              <TextInput
                style={s.input}
                placeholder="e.g. Monthly Rent"
                placeholderTextColor={C.textMuted}
                value={tplName}
                onChangeText={setTplName}
                autoFocus
              />

              <Text style={[s.inputLabel, { marginTop: 12 }]}>ITEMS</Text>
              {tplItems.map(it => (
                <View key={it.id} style={s.tplItemRow}>
                  <Text style={[font.sm, { color: C.text, flex: 1 }]}>{it.name}</Text>
                  <Text style={[font.sm, { color: C.accent }]}>{fmtCurrency(it.price, profile?.currency)}</Text>
                  <TouchableOpacity onPress={() => setTplItems(prev => prev.filter(i => i.id !== it.id))} style={{ paddingLeft: 8 }}>
                    <Text style={{ color: C.danger }}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
              <View style={s.addRow}>
                <TextInput
                  style={[s.input, { flex: 1 }]}
                  placeholder="Item name"
                  placeholderTextColor={C.textMuted}
                  value={newItemName}
                  onChangeText={setNewItemName}
                />
                <TextInput
                  style={[s.input, { width: 80 }]}
                  placeholder="Price"
                  placeholderTextColor={C.textMuted}
                  value={newItemPrice}
                  onChangeText={setNewItemPrice}
                  keyboardType="decimal-pad"
                />
                <TouchableOpacity style={s.addIconBtn} onPress={addTplItem}>
                  <Text style={{ color: C.text, fontSize: 20 }}>+</Text>
                </TouchableOpacity>
              </View>

              {/* Frequent contacts */}
              {frequentContacts.length > 0 && (
                <>
                  <Text style={[s.inputLabel, { marginTop: 12 }]}>USUAL PARTICIPANTS</Text>
                  <Text style={[font.xs, { color: C.textMuted, marginBottom: 8 }]}>
                    Select people you typically split this with
                  </Text>
                  <View style={s.contactsWrap}>
                    {frequentContacts.map(name => {
                      const active = tplContacts.has(name)
                      return (
                        <TouchableOpacity
                          key={name}
                          style={[s.contactChip, active && s.contactChipActive]}
                          onPress={() => toggleContact(name)}
                        >
                          <Text style={[s.contactChipText, active && { color: C.accent }]}>
                            {active ? '✓ ' : ''}{name}
                          </Text>
                        </TouchableOpacity>
                      )
                    })}
                  </View>
                </>
              )}

              <TouchableOpacity
                style={[s.saveBtn, { marginTop: 20 }, (savingTpl || !tplName.trim() || tplItems.length === 0) && { opacity: 0.4 }]}
                onPress={saveTemplate}
                disabled={savingTpl || !tplName.trim() || tplItems.length === 0}
              >
                <LinearGradient colors={['#7857FF', '#5537EE']} style={s.saveBtnGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                  {savingTpl
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={[font.base, { color: '#fff', fontWeight: '700' }]}>Save template</Text>}
                </LinearGradient>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

function SessionCard({ session, index, onPress }: { session: Session; index: number; onPress: () => void }) {
  const scaleAnim = useRef(new Animated.Value(1)).current
  const isTrip = session.session_type === 'trip'
  const isRestaurant = session.session_type === 'restaurant'

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
            <Text style={{ fontSize: 20 }}>{isRestaurant ? '🏪' : isTrip ? '⚖️' : '🧾'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.cardName} numberOfLines={1}>{session.name}</Text>
            <Text style={s.cardMeta}>
              {session.items?.length || 0} items
              {isTrip ? ' · Equal split' : ''}
              {isRestaurant ? ` · Table ${session.table_number}` : ''}
              {' · '}{new Date(session.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
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
  header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
  title: { ...font.xl, fontWeight: '700', color: C.text },
  count: { ...font.sm, color: C.textMuted },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 10 },
  sectionTitle: { ...font.sm, fontWeight: '700', color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
  newTplBtn: { backgroundColor: C.accentSoft, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  newTplText: { ...font.xs, color: C.accent, fontWeight: '700' },

  emptyTpl: {
    marginHorizontal: 16, marginBottom: 4,
    backgroundColor: C.card, borderRadius: radius.lg, borderWidth: 1, borderColor: C.border,
    borderStyle: 'dashed', padding: 20, alignItems: 'center',
  },

  tplScroll: { paddingHorizontal: 16, paddingBottom: 8, gap: 10 },
  tplCard: {
    width: 160, backgroundColor: C.card, borderRadius: radius.lg,
    borderWidth: 1, borderColor: C.border, padding: 14, gap: 4,
  },
  tplEmoji: { fontSize: 22, marginBottom: 4 },
  tplName: { ...font.base, fontWeight: '700', color: C.text },
  tplMeta: { ...font.xs, color: C.textMuted },
  tplContacts: { ...font.xs, color: C.textSec, marginTop: 2 },
  tplUseBtn: {
    marginTop: 10, backgroundColor: C.accentSoft,
    borderRadius: radius.sm, paddingVertical: 7, alignItems: 'center',
  },
  tplUseBtnText: { ...font.xs, color: C.accent, fontWeight: '700' },

  card: {
    backgroundColor: C.card, borderRadius: radius.lg, borderWidth: 1, borderColor: C.border,
    padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  cardLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardIcon: {
    width: 44, height: 44, borderRadius: radius.md,
    backgroundColor: C.card2, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.border,
  },
  cardName: { ...font.base, fontWeight: '600', color: C.text, marginBottom: 3 },
  cardMeta: { ...font.xs, color: C.textMuted },
  cardRight: { alignItems: 'flex-end', gap: 4 },
  cardTotal: { ...font.md, fontWeight: '700', color: C.text },
  codeBadge: {
    backgroundColor: C.card2, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2,
    borderWidth: 1, borderColor: C.border,
  },
  codeText: { ...font.xs, color: C.textMuted, fontWeight: '600' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 48, gap: 8 },
  emptyEmoji: { fontSize: 52 },
  emptyText: { ...font.md, fontWeight: '600', color: C.text },
  emptySub: { ...font.sm, color: C.textSec },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: C.card, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    borderTopWidth: 1, borderColor: C.border, padding: 24, maxHeight: '90%',
  },
  inputLabel: { ...font.xs, fontWeight: '700', color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
  input: {
    backgroundColor: C.card2, borderRadius: radius.sm, borderWidth: 1, borderColor: C.border,
    paddingVertical: 11, paddingHorizontal: 12, ...font.sm, color: C.text, marginBottom: 6,
  },
  tplItemRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: C.card2,
    borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 6,
  },
  addRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  addIconBtn: {
    width: 44, height: 44, borderRadius: radius.sm,
    backgroundColor: C.card2, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
  },
  contactsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  contactChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    backgroundColor: C.card2, borderWidth: 1, borderColor: C.border,
  },
  contactChipActive: { backgroundColor: C.accentSoft, borderColor: C.accent },
  contactChipText: { ...font.xs, color: C.textSec, fontWeight: '600' },
  saveBtn: { borderRadius: radius.md, overflow: 'hidden' },
  saveBtnGrad: { paddingVertical: 15, alignItems: 'center' },
})
