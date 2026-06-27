import { useState, useRef, useEffect } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, TextInput, Alert, Modal, Animated
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { useAuthStore } from '../../lib/store'
import { C, radius, font } from '../../lib/theme'

const PAY_ICONS: Record<string, string> = { iban: '🏦', revolut: '💳', paypal: '🅿️' }
const PAY_COLORS: Record<string, string> = { iban: '#1a3a5c', revolut: '#191c7a', paypal: '#002f80' }

export default function ProfileScreen() {
  const { profile, signOut, addPaymentMethod, removePaymentMethod, setDefaultPayment } = useAuthStore()
  const [showAddModal, setShowAddModal] = useState(false)
  const [payType, setPayType] = useState<'iban' | 'revolut' | 'paypal'>('iban')
  const [payValue, setPayValue] = useState('')
  const [payLabel, setPayLabel] = useState('')
  const fadeAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start()
  }, [])

  async function handleAdd() {
    if (!payValue.trim()) return
    await addPaymentMethod({
      type: payType,
      label: payLabel.trim() || payType.toUpperCase(),
      value: payValue.trim(),
      is_default: (profile?.payment_methods?.length || 0) === 0
    })
    setPayValue('')
    setPayLabel('')
    setShowAddModal(false)
  }

  const initials = (profile?.full_name || profile?.email || 'U')
    .split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <Animated.ScrollView
        style={{ opacity: fadeAnim }}
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={s.title}>Profile</Text>

        {/* User card */}
        <LinearGradient
          colors={['#1a0e3d', '#0d0d23']}
          style={s.userCard}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={s.avatarWrap}>
            <LinearGradient colors={['#7857FF', '#4F37CC']} style={s.avatar}>
              <Text style={s.avatarText}>{initials}</Text>
            </LinearGradient>
          </View>
          <Text style={s.userName}>{profile?.full_name || '—'}</Text>
          <Text style={s.userEmail}>{profile?.email || '—'}</Text>
        </LinearGradient>

        {/* Payment methods */}
        <View style={s.sectionHeader}>
          <Text style={s.sectionLabel}>PAYMENT METHODS</Text>
          <TouchableOpacity style={s.addBtn} onPress={() => setShowAddModal(true)}>
            <Text style={s.addBtnText}>+ Add</Text>
          </TouchableOpacity>
        </View>

        {(!profile?.payment_methods || profile.payment_methods.length === 0) ? (
          <View style={s.emptyCard}>
            <Text style={{ fontSize: 28, marginBottom: 10 }}>💳</Text>
            <Text style={s.emptyText}>No payment methods</Text>
            <Text style={s.emptySub}>Add IBAN or Revolut so guests can pay you</Text>
          </View>
        ) : (
          profile.payment_methods.map(pm => (
            <View key={pm.id} style={s.payCard}>
              <View style={[s.payIconWrap, { backgroundColor: PAY_COLORS[pm.type] }]}>
                <Text style={{ fontSize: 20 }}>{PAY_ICONS[pm.type]}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={s.payLabel}>{pm.label}</Text>
                  {pm.is_default && <View style={s.defaultBadge}><Text style={s.defaultText}>Default</Text></View>}
                </View>
                <Text style={s.payValue} numberOfLines={1}>{pm.value}</Text>
              </View>
              <View style={s.payActions}>
                {!pm.is_default && (
                  <TouchableOpacity onPress={() => setDefaultPayment(pm.id)} style={s.payActionBtn}>
                    <Text style={s.payActionText}>★</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={() => Alert.alert('Remove', `Remove ${pm.label}?`, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Remove', style: 'destructive', onPress: () => removePaymentMethod(pm.id) }
                  ])}
                  style={s.payActionBtn}
                >
                  <Text style={[s.payActionText, { color: C.danger }]}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}

        {/* Sign out */}
        <TouchableOpacity
          style={s.signOutBtn}
          onPress={() => Alert.alert('Sign out', 'Are you sure?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign out', style: 'destructive', onPress: signOut }
          ])}
        >
          <Text style={s.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </Animated.ScrollView>

      {/* Add payment modal */}
      <Modal visible={showAddModal} animationType="slide" presentationStyle="pageSheet">
        <View style={s.modal}>
          <View style={s.modalHandle} />
          <View style={s.modalHeader}>
            <TouchableOpacity onPress={() => setShowAddModal(false)}>
              <Text style={s.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={s.modalTitle}>Add payment method</Text>
            <TouchableOpacity onPress={handleAdd}>
              <Text style={s.modalSave}>Save</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20 }}>
            <Text style={s.sectionLabel}>TYPE</Text>
            <View style={s.typeRow}>
              {(['iban', 'revolut', 'paypal'] as const).map(type => (
                <TouchableOpacity
                  key={type}
                  style={[s.typeBtn, payType === type && s.typeBtnActive]}
                  onPress={() => setPayType(type)}
                >
                  <Text style={{ fontSize: 22 }}>{PAY_ICONS[type]}</Text>
                  <Text style={[s.typeBtnText, payType === type && s.typeBtnTextActive]}>
                    {type.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.sectionLabel}>LABEL</Text>
            <TextInput
              style={s.input}
              placeholder="e.g. My IBAN"
              placeholderTextColor={C.textMuted}
              value={payLabel}
              onChangeText={setPayLabel}
            />
            <Text style={s.sectionLabel}>VALUE</Text>
            <TextInput
              style={s.input}
              placeholder={payType === 'iban' ? 'HR12...' : payType === 'revolut' ? '@username' : 'email@paypal.com'}
              placeholderTextColor={C.textMuted}
              value={payValue}
              onChangeText={setPayValue}
              autoCapitalize="none"
            />
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  scroll: { padding: 20, paddingBottom: 60 },
  title: { ...font.xl, fontWeight: '700', color: C.text, marginBottom: 20 },

  userCard: {
    borderRadius: radius.xl,
    padding: 24,
    alignItems: 'center',
    marginBottom: 28,
    borderWidth: 1,
    borderColor: C.border,
  },
  avatarWrap: {
    shadowColor: C.accent,
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    marginBottom: 14,
  },
  avatar: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 26, fontWeight: '800', color: '#fff' },
  userName: { ...font.md, fontWeight: '700', color: C.text, marginBottom: 4 },
  userEmail: { ...font.sm, color: C.textSec },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionLabel: { ...font.xs, fontWeight: '700', color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  addBtn: { backgroundColor: C.accentSoft, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 5 },
  addBtnText: { ...font.sm, color: C.accent, fontWeight: '700' },

  emptyCard: {
    backgroundColor: C.card, borderRadius: radius.lg, padding: 28,
    alignItems: 'center', borderWidth: 1, borderColor: C.border, marginBottom: 16,
  },
  emptyText: { ...font.base, fontWeight: '600', color: C.text },
  emptySub: { ...font.sm, color: C.textSec, textAlign: 'center', marginTop: 4 },

  payCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.card, borderRadius: radius.lg, padding: 14,
    borderWidth: 1, borderColor: C.border, marginBottom: 8,
  },
  payIconWrap: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  payLabel: { ...font.base, fontWeight: '600', color: C.text },
  payValue: { ...font.sm, color: C.textSec, marginTop: 2 },
  defaultBadge: { backgroundColor: C.successSoft, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  defaultText: { ...font.xs, color: C.success, fontWeight: '700' },
  payActions: { flexDirection: 'row', gap: 6 },
  payActionBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  payActionText: { fontSize: 16, color: C.textMuted },

  signOutBtn: {
    borderWidth: 1, borderColor: C.dangerSoft, borderRadius: radius.lg,
    paddingVertical: 14, alignItems: 'center', marginTop: 32,
    backgroundColor: 'rgba(248,113,113,0.06)',
  },
  signOutText: { color: C.danger, ...font.base, fontWeight: '600' },

  modal: { flex: 1, backgroundColor: C.card },
  modalHandle: { width: 36, height: 4, backgroundColor: C.border, borderRadius: 2, alignSelf: 'center', marginTop: 12 },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  modalCancel: { ...font.base, color: C.textSec },
  modalTitle: { ...font.base, fontWeight: '600', color: C.text },
  modalSave: { ...font.base, fontWeight: '700', color: C.accent },
  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  typeBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 14,
    borderWidth: 1, borderColor: C.border, borderRadius: radius.md, gap: 4,
    backgroundColor: C.card2,
  },
  typeBtnActive: { borderColor: C.accent, backgroundColor: C.accentSoft },
  typeBtnText: { ...font.xs, fontWeight: '700', color: C.textMuted },
  typeBtnTextActive: { color: C.accent },
  input: {
    backgroundColor: C.card2, borderRadius: radius.md, borderWidth: 1, borderColor: C.border,
    paddingVertical: 13, paddingHorizontal: 15, ...font.base, color: C.text, marginBottom: 16,
  },
})
