import { useEffect, useRef } from 'react'
import { AppState } from 'react-native'
import { Stack, useRouter, useSegments } from 'expo-router'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../lib/store'
import * as Notifications from 'expo-notifications'
import '../lib/i18n'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

async function registerPushToken(saveFn: (token: string) => Promise<void>) {
  try {
    const { status } = await Notifications.requestPermissionsAsync()
    if (status !== 'granted') return
    const token = await Notifications.getExpoPushTokenAsync()
    await saveFn(token.data)
  } catch {
    // Push notifications unavailable (e.g. simulator without config)
  }
}

export default function RootLayout() {
  const router = useRouter()
  const segments = useSegments()
  const { fetchProfile, savePushToken, setUser } = useAuthStore()
  const appState = useRef(AppState.currentState)

  useEffect(() => {
    // Guest and table routes are public — no auth redirect
    const isPublicRoute = segments[0] === 'guest' || segments[0] === 'table'

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user)
        await fetchProfile(session.user.id)
        registerPushToken(savePushToken)
        if (!isPublicRoute) router.replace('/tabs/home')
      } else {
        if (!isPublicRoute) router.replace('/auth/login')
      }
    })

    // Use explicit event types so this doesn't fire on the initial "no session" state
    // and accidentally redirect a guest user who landed via deep link
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        setUser(session.user)
        await fetchProfile(session.user.id)
        registerPushToken(savePushToken)
        router.replace('/tabs/home')
      } else if (event === 'SIGNED_OUT') {
        setUser(null)
        router.replace('/auth/login')
      }
    })

    const sub = AppState.addEventListener('change', state => {
      if (appState.current.match(/inactive|background/) && state === 'active') {
        supabase.auth.startAutoRefresh()
      } else {
        supabase.auth.stopAutoRefresh()
      }
      appState.current = state
    })

    return () => {
      authListener.subscription.unsubscribe()
      sub.remove()
    }
  }, [])

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#08081A' } }}>
      <Stack.Screen name="auth" />
      <Stack.Screen name="tabs" />
      <Stack.Screen name="session/[code]" />
      <Stack.Screen name="guest/[code]" />
      <Stack.Screen name="table" />
    </Stack>
  )
}
