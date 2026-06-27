import { useState, useEffect, useRef } from 'react'
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, Modal, KeyboardAvoidingView, Platform
} from 'react-native'
import QRCode from 'react-native-qrcode-svg'
import { supabase, type Session, type Item, type Selection } from '../../lib/supabase'
import { useAuthStore } from '../../lib/store'
import { genCode, fmtCurrency } from '../../lib/utils'
import { C, radius, font } from '../../lib/theme'

type View = 'loading' | 'empty' | 'configure' | 'menu' | 'qrs' | 'dashboard'
type TableStatus = 'empty' | 'active' | 'confirmed'

const DEMO_MENU: Item[] = [
  { id: '1', name: 'Margherita Pizza', price: 12.00, qty: 1 },
  { id: '2', name: 'Pasta Carbonara', price: 14.00, qty: 1 },
  { id: '3', name: 'Caesar Salad', price: 9.00, qty: 1 },
  { id: '4', name: 'Grilled Salmon', price: 18.00, qty: 1 },
  { id: '5', name: 'House Wine (dl)', price: 4.50, qty: 1 },
  { id: '6', name: 'Sparkling Water', price: 3.00, qty: 1 },
  { id: '7', name: 'Tiramisu', price: 7.00, qty: 1 },
]

function tableStatus(sels: Selection[]): TableStatus {
  if (sels.length === 0) return 'empty'
  if (sels.every(s => s.confirmed)) return 'confirmed'
  return 'active'
}

const STATUS = {
  empty:     { label: 'Empty',     dot: C.textMuted, text: C.textMuted },
  active:    { label: 'Ordering',  dot: C.warn,      text: C.warn },
  confirmed: { label: 'Confirmed', dot: C.success,   text: C.success },
}

export default function RestaurantTab() {
  const { user, profile } = useAuthStore()

  const [view, setView] = useState<View>('loading')
  const [restaurantName, setRestaurantName] = useState('')
  const [tableCount, setTableCount] = useState(4)
  const [menuItems, setMenuItems] = useState<Item[]>([])
  const [newName, setNewName] = useState('')
  const [newPrice, setNewPrice] = useState('')
  const [sessions, setSessions] = useState<Session[]>([])
  const [selections, setSelections] = useState<Record<string, Selection[]>>({})
  const [expandedCode, setExpandedCode] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [qrModal, setQrModal] = useState<{ url: string; label: string } | null>(null)

  const channels = useRef<ReturnType<typeof supabase.channel>[]>([])

  // ─── Load existing restaurant sessions ─────────────────────────────────────
  useEffect(() => {
    if (!user) return
    loadSessions()
    return () => { channels.current.forEach(ch => supabase.removeChannel(ch)) }
  }, [user])

  async function loadSessions() {
    setView('loading')
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('owner_id', user!.id)
      .eq('session_type', 'restaurant')
      .eq('is_active', true)
      .order('table_number', { ascending: true })

    if (error) {
      // is_active column might not exist yet — column missing shows as schema error
      if (error.message?.includes('is_active') || error.message?.includes('column')) {
        Alert.alert(
          'Setup Required',
          'Please run the restaurant mode SQL migrations in your Supabase dashboard first.\n\nSee the comment at the bottom of lib/supabase.ts for the exact SQL.',
        )
        setView('empty')
        return
      }
      setView('empty')
      return
    }

    if (data && data.length > 0) {
      setSessions(data)
      setView('dashboard')
      loadSelections(data.map(s => s.code))
      subscribeToSelections(data.map(s => s.code))
    } else {
      setView('empty')
    }
  }

  async function loadSelections(codes: string[]) {
    if (codes.length === 0) return
    const { data } = await supabase
      .from('selections')
      .select('*')
      .in('session_code', codes)

    if (data) {
      const map: Record<string, Selection[]> = {}
      data.forEach(sel => {
        if (!map[sel.session_code]) map[sel.session_code] = []
        map[sel.session_code].push(sel)
      })
      setSelections(map)
    }
  }

  function subscribeToSelections(codes: string[]) {
    channels.current.forEach(ch => supabase.removeChannel(ch))
    channels.current = codes.map(code =>
      supabase
        .channel(`rest-${code}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'selections',
          filter: `session_code=eq.${code}`,
        }, payload => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const sel = payload.new as Selection
            setSelections(prev => {
              const current = prev[code] || []
              const exists = current.find(s => s.id === sel.id)
              return {
                ...prev,
                [code]: exists
                  ? current.map(s => s.id === sel.id ? sel : s)
                  : [...current, sel],
              }
            })
          }
        })
        .subscribe()
    )
  }

  // ─── Create all table sessions ──────────────────────────────────────────────
  async function createTables() {
    if (!user || !profile || !restaurantName.trim() || menuItems.length === 0) return
    setCreating(true)

    const total = menuItems.reduce((s, it) => s + it.price * it.qty, 0)
    const rows = Array.from({ length: tableCount }, (_, i) => ({
      code: genCode(),
      name: `${restaurantName.trim()} — Table ${i + 1}`,
      items: menuItems,
      owner_id: user.id,
      owner_name: restaurantName.trim(),
      owner_payment_methods: profile.payment_methods || [],
      owner_push_token: profile.push_token ?? null,
      currency: profile.currency || 'EUR',
      total,
      session_type: 'restaurant',
      table_number: String(i + 1),
      restaurant_name: restaurantName.trim(),
      is_active: true,
    }))

    const { data, error } = await supabase.from('sessions').insert(rows).select()
    setCreating(false)

    if (error) {
      Alert.alert('Error', error.message)
      return
    }

    setSessions(data!)
    subscribeToSelections(data!.map(s => s.code))
    setView('qrs')
  }

  // ─── Reset a table (new round of guests) ───────────────────────────────────
  async function newRound(session: Session) {
    Alert.alert(
      'New Round?',
      `Clear Table ${session.table_number} and start fresh for the next guests?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'New Round', style: 'destructive',
          onPress: async () => {
            // Deactivate old session
            await supabase.from('sessions').update({ is_active: false }).eq('id', session.id)

            // Create replacement with same menu
            const code = genCode()
            const { data, error } = await supabase.from('sessions').insert({
              code,
              name: session.name,
              items: session.items,
              owner_id: session.owner_id,
              owner_name: session.owner_name,
              owner_payment_methods: session.owner_payment_methods,
              owner_push_token: session.owner_push_token ?? null,
              currency: session.currency,
              total: session.total,
              session_type: 'restaurant',
              table_number: session.table_number,
              restaurant_name: session.restaurant_name,
              is_active: true,
            }).select().single()

            if (error) { Alert.alert('Error', error.message); return }

            setSessions(prev => prev.map(s => s.id === session.id ? data! : s))
            setSelections(prev => {
              const next = { ...prev }
              delete next[session.code]
              return next
            })
            if (expandedCode === session.code) setExpandedCode(data!.code)

            // Re-subscribe with updated codes
            const newCodes = sessions.map(s => s.id === session.id ? data!.code : s.code)
            subscribeToSelections(newCodes)
          },
        },
      ]
    )
  }

  // ─── Reset everything (new restaurant setup) ────────────────────────────────
  async function resetAll() {
    Alert.alert(
      'Delete Restaurant Setup?',
      'This will deactivate all tables. You\'ll need to set up again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All', style: 'destructive',
          onPress: async () => {
            const ids = sessions.map(s => s.id)
            await supabase.from('sessions').update({ is_active: false }).in('id', ids)
            channels.current.forEach(ch => supabase.removeChannel(ch))
            channels.current = []
            setSessions([])
            setSelections({})
            setMenuItems([])
            setRestaurantName('')
            setTableCount(4)
            setView('empty')
          },
        },
      ]
    )
  }

  function addMenuItem() {
    const name = newName.trim()
    const price = parseFloat(newPrice)
    if (!name || isNaN(price) || price <= 0) return
    setMenuItems(prev => [...prev, { id: String(Date.now()), name, price, qty: 1 }])
    setNewName('')
    setNewPrice('')
  }

  function removeMenuItem(id: string) {
    setMenuItems(prev => prev.filter(it => it.id !== id))
  }

  function tableQrUrl(session: Session) {
    // Permanent URL — redirects to current active session for this table
    return `https://splitbill.app/table?rid=${encodeURIComponent(session.owner_id)}&t=${encodeURIComponent(session.table_number || '')}`
  }

  // ─── Render helpers ─────────────────────────────────────────────────────────

  if (view === 'loading') {
    return (
      <View style={[s.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={C.accent} size="large" />
      </View>
    )
  }

  if (view === 'empty') {
    return (
      <View style={s.screen}>
        <View style={s.header}>
          <Text style={[font.xl, { color: C.text }]}>Restaurant</Text>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <Text style={{ fontSize: 64, marginBottom: 20 }}>🏪</Text>
          <Text style={[font.lg, { color: C.text, textAlign: 'center', marginBottom: 10 }]}>
            Restaurant Mode
          </Text>
          <Text style={[font.sm, { color: C.textSec, textAlign: 'center', marginBottom: 36, lineHeight: 20 }]}>
            Create table sessions with a QR code for each table. Guests scan to view the menu and confirm their order.
          </Text>
          <TouchableOpacity style={s.primaryBtn} onPress={() => setView('configure')}>
            <Text style={[font.base, { color: '#fff', fontWeight: '700' }]}>Set up restaurant</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  if (view === 'configure') {
    return (
      <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => setView('empty')}>
            <Text style={[font.sm, { color: C.accent }]}>← Back</Text>
          </TouchableOpacity>
          <Text style={[font.md, { color: C.text }]}>Restaurant Setup</Text>
          <View style={{ width: 50 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, gap: 24 }}>
          <View style={s.card}>
            <Text style={[font.xs, { color: C.textMuted, letterSpacing: 1, marginBottom: 10 }]}>RESTAURANT NAME</Text>
            <TextInput
              style={s.input}
              placeholder="e.g. Bella Vista"
              placeholderTextColor={C.textMuted}
              value={restaurantName}
              onChangeText={setRestaurantName}
              autoFocus
            />
          </View>

          <View style={s.card}>
            <Text style={[font.xs, { color: C.textMuted, letterSpacing: 1, marginBottom: 16 }]}>NUMBER OF TABLES</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28 }}>
              <TouchableOpacity
                style={s.countBtn}
                onPress={() => setTableCount(n => Math.max(1, n - 1))}
              >
                <Text style={[font.lg, { color: C.text }]}>−</Text>
              </TouchableOpacity>
              <Text style={[font.xxl, { color: C.accent, width: 60, textAlign: 'center' }]}>{tableCount}</Text>
              <TouchableOpacity
                style={s.countBtn}
                onPress={() => setTableCount(n => Math.min(30, n + 1))}
              >
                <Text style={[font.lg, { color: C.text }]}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[s.primaryBtn, !restaurantName.trim() && { opacity: 0.4 }]}
            onPress={() => {
              if (!restaurantName.trim()) return
              setView('menu')
            }}
            disabled={!restaurantName.trim()}
          >
            <Text style={[font.base, { color: '#fff', fontWeight: '700' }]}>Next: Build Menu →</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    )
  }

  if (view === 'menu') {
    return (
      <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => setView('configure')}>
            <Text style={[font.sm, { color: C.accent }]}>← Back</Text>
          </TouchableOpacity>
          <Text style={[font.md, { color: C.text }]}>Menu Items</Text>
          <TouchableOpacity onPress={() => setMenuItems(DEMO_MENU)}>
            <Text style={[font.xs, { color: C.accent }]}>Demo</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }} keyboardShouldPersistTaps="handled">
          {/* Add item row */}
          <View style={[s.card, { flexDirection: 'row', gap: 10 }]}>
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
            <TouchableOpacity style={s.addBtn} onPress={addMenuItem}>
              <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700' }}>+</Text>
            </TouchableOpacity>
          </View>

          {/* Menu list */}
          {menuItems.length === 0 ? (
            <Text style={[font.sm, { color: C.textMuted, textAlign: 'center', marginTop: 20 }]}>
              Add items or tap Demo to load a sample menu
            </Text>
          ) : (
            menuItems.map(item => (
              <View key={item.id} style={[s.card, { flexDirection: 'row', alignItems: 'center' }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[font.base, { color: C.text }]}>{item.name}</Text>
                  <Text style={[font.sm, { color: C.accent, marginTop: 2 }]}>
                    {fmtCurrency(item.price, profile?.currency)}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => removeMenuItem(item.id)} style={{ padding: 6 }}>
                  <Text style={{ color: C.danger, fontSize: 18 }}>×</Text>
                </TouchableOpacity>
              </View>
            ))
          )}

          <TouchableOpacity
            style={[s.primaryBtn, { marginTop: 8 }, menuItems.length === 0 && { opacity: 0.4 }]}
            onPress={createTables}
            disabled={menuItems.length === 0 || creating}
          >
            {creating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={[font.base, { color: '#fff', fontWeight: '700' }]}>
                Create {tableCount} Tables →
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    )
  }

  if (view === 'qrs') {
    return (
      <View style={s.screen}>
        <View style={s.header}>
          <View style={{ width: 50 }} />
          <Text style={[font.md, { color: C.text }]}>Table QR Codes</Text>
          <TouchableOpacity onPress={() => setView('dashboard')}>
            <Text style={[font.xs, { color: C.accent }]}>Dashboard</Text>
          </TouchableOpacity>
        </View>

        <Text style={[font.sm, { color: C.textSec, textAlign: 'center', marginHorizontal: 24, marginBottom: 12 }]}>
          Place these QR codes on each table. They always redirect to the current active session.
        </Text>

        <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }}>
          {sessions.map(sess => (
            <View key={sess.id} style={[s.card, { alignItems: 'center', gap: 16 }]}>
              <Text style={[font.md, { color: C.text }]}>Table {sess.table_number}</Text>
              <View style={{ padding: 12, backgroundColor: '#fff', borderRadius: radius.md }}>
                <QRCode value={tableQrUrl(sess)} size={160} />
              </View>
              <Text style={[font.xs, { color: C.textMuted, textAlign: 'center' }]}>
                {sess.restaurant_name}
              </Text>
            </View>
          ))}

          <TouchableOpacity style={s.primaryBtn} onPress={() => setView('dashboard')}>
            <Text style={[font.base, { color: '#fff', fontWeight: '700' }]}>Go to Dashboard →</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    )
  }

  // ─── Dashboard ──────────────────────────────────────────────────────────────
  const restName = sessions[0]?.restaurant_name || 'Restaurant'

  return (
    <View style={s.screen}>
      <View style={s.header}>
        <Text style={[font.xl, { color: C.text }]}>{restName}</Text>
        <TouchableOpacity onPress={resetAll}>
          <Text style={[font.xs, { color: C.danger }]}>Reset</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        {sessions.map(sess => {
          const sels = selections[sess.code] || []
          const status = tableStatus(sels)
          const cfg = STATUS[status]
          const confirmedTotal = sels.filter(s => s.confirmed).reduce((sum, s) => sum + s.total, 0)
          const isExpanded = expandedCode === sess.code

          return (
            <TouchableOpacity
              key={sess.id}
              style={s.card}
              onPress={() => setExpandedCode(isExpanded ? null : sess.code)}
              activeOpacity={0.85}
            >
              {/* Table header row */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <View style={[s.dot, { backgroundColor: cfg.dot }]} />
                <Text style={[font.md, { color: C.text, flex: 1 }]}>Table {sess.table_number}</Text>
                <Text style={[font.xs, { color: cfg.text, fontWeight: '700' }]}>{cfg.label}</Text>
              </View>

              {/* Stats row */}
              <View style={{ flexDirection: 'row', gap: 16, marginBottom: 12 }}>
                <View>
                  <Text style={[font.xs, { color: C.textMuted }]}>GUESTS</Text>
                  <Text style={[font.base, { color: C.text }]}>{sels.length}</Text>
                </View>
                <View>
                  <Text style={[font.xs, { color: C.textMuted }]}>CONFIRMED</Text>
                  <Text style={[font.base, { color: C.success }]}>
                    {fmtCurrency(confirmedTotal, sess.currency)}
                  </Text>
                </View>
                <View>
                  <Text style={[font.xs, { color: C.textMuted }]}>MENU TOTAL</Text>
                  <Text style={[font.base, { color: C.textSec }]}>
                    {fmtCurrency(sess.total, sess.currency)}
                  </Text>
                </View>
              </View>

              {/* Expanded: QR + guest list */}
              {isExpanded && (
                <View style={{ borderTopWidth: 1, borderTopColor: C.border, paddingTop: 14, gap: 14 }}>
                  {/* QR Code */}
                  <TouchableOpacity
                    style={{ alignItems: 'center', gap: 8 }}
                    onPress={() => setQrModal({ url: tableQrUrl(sess), label: `Table ${sess.table_number}` })}
                  >
                    <View style={{ padding: 10, backgroundColor: '#fff', borderRadius: radius.sm }}>
                      <QRCode value={tableQrUrl(sess)} size={120} />
                    </View>
                    <Text style={[font.xs, { color: C.textMuted }]}>Tap to enlarge</Text>
                  </TouchableOpacity>

                  {/* Guest list */}
                  {sels.length > 0 && (
                    <View style={{ gap: 6 }}>
                      {sels.map(sel => (
                        <View key={sel.id} style={[s.guestRow]}>
                          <View style={[s.dot, {
                            backgroundColor: sel.confirmed ? C.success : C.warn,
                            marginRight: 8,
                          }]} />
                          <Text style={[font.sm, { color: C.text, flex: 1 }]}>{sel.guest_name}</Text>
                          <Text style={[font.sm, { color: sel.confirmed ? C.success : C.textSec }]}>
                            {fmtCurrency(sel.total, sess.currency)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {/* Action row */}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <TouchableOpacity
                  style={[s.actionBtn, { flex: 1 }]}
                  onPress={() => setQrModal({ url: tableQrUrl(sess), label: `Table ${sess.table_number}` })}
                >
                  <Text style={[font.xs, { color: C.accent, fontWeight: '700' }]}>Show QR</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.actionBtn, { flex: 1, borderColor: C.danger + '40' }]}
                  onPress={() => newRound(sess)}
                >
                  <Text style={[font.xs, { color: C.danger, fontWeight: '700' }]}>New Round</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      {/* QR fullscreen modal */}
      <Modal
        visible={!!qrModal}
        transparent
        animationType="fade"
        onRequestClose={() => setQrModal(null)}
      >
        <TouchableOpacity
          style={s.modalOverlay}
          activeOpacity={1}
          onPress={() => setQrModal(null)}
        >
          <View style={s.modalCard}>
            <Text style={[font.md, { color: C.text, marginBottom: 20 }]}>{qrModal?.label}</Text>
            <View style={{ padding: 16, backgroundColor: '#fff', borderRadius: radius.md }}>
              <QRCode value={qrModal?.url || 'https://splitbill.app'} size={220} />
            </View>
            <Text style={[font.xs, { color: C.textMuted, marginTop: 16, textAlign: 'center' }]}>
              Guests scan to join and order
            </Text>
            <TouchableOpacity style={[s.primaryBtn, { marginTop: 20 }]} onPress={() => setQrModal(null)}>
              <Text style={[font.sm, { color: '#fff', fontWeight: '700' }]}>Close</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  )
}

const s = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.bg,
    paddingTop: 60,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  card: {
    backgroundColor: C.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
  },
  input: {
    backgroundColor: C.card2,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: C.border,
    color: C.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  primaryBtn: {
    backgroundColor: C.accent,
    borderRadius: radius.md,
    paddingVertical: 16,
    alignItems: 'center',
  },
  addBtn: {
    backgroundColor: C.accent,
    borderRadius: radius.sm,
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtn: {
    borderWidth: 1,
    borderColor: C.accent + '40',
    borderRadius: radius.sm,
    paddingVertical: 10,
    alignItems: 'center',
  },
  countBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: C.card2,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 10,
  },
  guestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card2,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: C.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: C.border,
    padding: 28,
    alignItems: 'center',
    width: '100%',
  },
})
