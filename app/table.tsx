import { useEffect } from 'react'
import { View, Text, ActivityIndicator } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { supabase } from '../lib/supabase'
import { C, font } from '../lib/theme'

export default function TableRedirect() {
  const { rid, t } = useLocalSearchParams<{ rid: string; t: string }>()
  const router = useRouter()

  useEffect(() => {
    if (!rid || !t) {
      router.replace('/auth/login')
      return
    }

    supabase
      .from('sessions')
      .select('code')
      .eq('owner_id', rid)
      .eq('table_number', t)
      .eq('session_type', 'restaurant')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
      .then(({ data, error }) => {
        if (data?.code) {
          router.replace(`/guest/${data.code}`)
        } else {
          router.replace('/auth/login')
        }
      })
  }, [rid, t])

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }}>
      <ActivityIndicator color={C.accent} size="large" />
      <Text style={[font.sm, { color: C.textSec, marginTop: 14 }]}>Finding your table...</Text>
    </View>
  )
}
