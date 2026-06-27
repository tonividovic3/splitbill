import { create } from 'zustand'
import { supabase, UserProfile } from './supabase'
import type { User } from '@supabase/supabase-js'

type AuthStore = {
  user: User | null
  profile: UserProfile | null
  loading: boolean
  setUser: (user: User | null) => void
  fetchProfile: (userId: string) => Promise<void>
  signOut: () => Promise<void>
  updateProfile: (data: Partial<UserProfile>) => Promise<void>
  savePushToken: (token: string) => Promise<void>
  addPaymentMethod: (method: Omit<import('./supabase').PaymentMethod, 'id'>) => Promise<void>
  removePaymentMethod: (id: string) => Promise<void>
  setDefaultPayment: (id: string) => Promise<void>
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  profile: null,
  loading: true,

  setUser: (user) => set({ user }),

  fetchProfile: async (userId) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    if (data) set({ profile: data })
    set({ loading: false })
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null, profile: null })
  },

  updateProfile: async (data) => {
    const { user, profile } = get()
    if (!user) return
    const updated = { ...profile, ...data }
    await supabase.from('profiles').upsert({ id: user.id, ...data })
    set({ profile: updated as UserProfile })
  },

  savePushToken: async (token: string) => {
    const { user, profile } = get()
    if (!user) return
    // Silently fails if push_token column doesn't exist yet
    await supabase.from('profiles').upsert({ id: user.id, push_token: token })
    if (profile) set({ profile: { ...profile, push_token: token } })
  },

  addPaymentMethod: async (method) => {
    const { user, profile } = get()
    if (!user || !profile) return
    const newMethod = { ...method, id: Date.now().toString() }
    const methods = [...(profile.payment_methods || []), newMethod]
    await supabase.from('profiles').upsert({ id: user.id, payment_methods: methods })
    set({ profile: { ...profile, payment_methods: methods } })
  },

  removePaymentMethod: async (id) => {
    const { user, profile } = get()
    if (!user || !profile) return
    const methods = profile.payment_methods.filter(m => m.id !== id)
    await supabase.from('profiles').upsert({ id: user.id, payment_methods: methods })
    set({ profile: { ...profile, payment_methods: methods } })
  },

  setDefaultPayment: async (id) => {
    const { user, profile } = get()
    if (!user || !profile) return
    const methods = profile.payment_methods.map(m => ({ ...m, is_default: m.id === id }))
    await supabase.from('profiles').upsert({ id: user.id, payment_methods: methods })
    set({ profile: { ...profile, payment_methods: methods } })
  }
}))
