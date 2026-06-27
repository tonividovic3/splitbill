import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  'https://cnolxnfxgdlsdfoeeiqy.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNub2x4bmZ4Z2Rsc2Rmb2VlaXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1MDUyMTMsImV4cCI6MjA5ODA4MTIxM30.KVW3q7HMNtqMhc8x5GWAiT8jW09oJalnuomC6MownZ0'
)

export type PaymentMethod = {
  id: string
  type: 'iban' | 'revolut' | 'paypal'
  label: string
  value: string
  is_default: boolean
}

export type RecurringTemplate = {
  id: string
  name: string
  items: Item[]
  contacts: string[]   // frequent participant names
  created_at: string
}

export type UserProfile = {
  id: string
  email: string
  full_name: string
  avatar_url?: string
  payment_methods: PaymentMethod[]
  currency: string
  push_token?: string
  recurring_templates?: RecurringTemplate[]
  created_at: string
}

export type Item = {
  id: string
  name: string
  price: number
  qty: number
}

export type Session = {
  id: string
  code: string
  name: string
  items: Item[]
  owner_id: string
  owner_name: string
  owner_payment_methods: PaymentMethod[]
  owner_push_token?: string
  currency: string
  total: number
  session_type?: 'split' | 'trip' | 'restaurant'
  trip_people?: number
  table_number?: string
  restaurant_name?: string
  is_active?: boolean
  created_at: string
}

export type Selection = {
  id: string
  session_code: string
  guest_name: string
  guest_user_id?: string
  item_ids: string[]
  total: number
  tip_percent: number
  confirmed: boolean
  created_at: string
}

/*
  Required Supabase SQL (run once in dashboard):

  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS push_token TEXT;

  ALTER TABLE sessions ADD COLUMN IF NOT EXISTS owner_push_token TEXT;
  ALTER TABLE sessions ADD COLUMN IF NOT EXISTS session_type TEXT DEFAULT 'split';
  ALTER TABLE sessions ADD COLUMN IF NOT EXISTS trip_people INTEGER DEFAULT 2;

  -- Restaurant mode columns:
  ALTER TABLE sessions ADD COLUMN IF NOT EXISTS table_number TEXT;
  ALTER TABLE sessions ADD COLUMN IF NOT EXISTS restaurant_name TEXT;
  ALTER TABLE sessions ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

  -- Recurring templates:
  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS recurring_templates JSONB DEFAULT '[]';
*/
