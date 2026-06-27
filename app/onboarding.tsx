import { useRef, useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Dimensions, Animated } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useRouter } from 'expo-router'
import { supabase } from '../lib/supabase'
import { C, radius, font } from '../lib/theme'

export const ONBOARDING_KEY = '@sb_onboarding_v1'

const { width } = Dimensions.get('window')

const SLIDES = [
  {
    emoji: '🧾',
    title: 'Scan any receipt',
    subtitle: 'Point your camera at a restaurant bill. AI reads every item in seconds.',
    colors: ['#7857FF', '#4F37CC'] as const,
  },
  {
    emoji: '🔗',
    title: 'Share with one tap',
    subtitle: 'Friends tap the link to pick what they had. No app download needed.',
    colors: ['#0E7CFF', '#0550CC'] as const,
  },
  {
    emoji: '💰',
    title: 'Get paid faster',
    subtitle: 'See who confirmed their share and direct them to pay you instantly.',
    colors: ['#22c55e', '#16a34a'] as const,
  },
]

export default function OnboardingScreen() {
  const router = useRouter()
  const scrollRef = useRef<ScrollView>(null)
  const [current, setCurrent] = useState(0)
  const fadeAnim = useRef(new Animated.Value(1)).current

  function goNext() {
    if (current < SLIDES.length - 1) {
      scrollRef.current?.scrollTo({ x: (current + 1) * width, animated: true })
    } else {
      finish()
    }
  }

  function onScroll(e: any) {
    const page = Math.round(e.nativeEvent.contentOffset.x / width)
    setCurrent(page)
  }

  async function finish() {
    await AsyncStorage.setItem(ONBOARDING_KEY, '1')
    const { data: { session } } = await supabase.auth.getSession()
    router.replace(session?.user ? '/tabs/home' : '/auth/login')
  }

  const slide = SLIDES[current]

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      {/* Skip */}
      <TouchableOpacity style={s.skip} onPress={finish}>
        <Text style={s.skipText}>Skip</Text>
      </TouchableOpacity>

      {/* Slides */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
      >
        {SLIDES.map((sl, i) => (
          <View key={i} style={[s.slide, { width }]}>
            <LinearGradient
              colors={sl.colors}
              style={s.iconWrap}
            >
              <Text style={s.emoji}>{sl.emoji}</Text>
            </LinearGradient>
            <Text style={s.title}>{sl.title}</Text>
            <Text style={s.subtitle}>{sl.subtitle}</Text>
          </View>
        ))}
      </ScrollView>

      {/* Dots */}
      <View style={s.dots}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[s.dot, current === i && s.dotActive]}
          />
        ))}
      </View>

      {/* CTA */}
      <View style={s.footer}>
        <TouchableOpacity onPress={goNext} activeOpacity={0.88}>
          <LinearGradient
            colors={slide.colors}
            style={s.btn}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Text style={s.btnText}>
              {current === SLIDES.length - 1 ? 'Get started →' : 'Next →'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  skip: { alignSelf: 'flex-end', paddingHorizontal: 24, paddingTop: 12, paddingBottom: 4 },
  skipText: { ...font.sm, color: C.textMuted, fontWeight: '600' },

  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 24,
  },
  iconWrap: {
    width: 120,
    height: 120,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#7857FF',
    shadowOpacity: 0.5,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 10 },
    marginBottom: 8,
  },
  emoji: { fontSize: 56 },
  title: { ...font.xxl, fontWeight: '800', color: C.text, textAlign: 'center' },
  subtitle: { ...font.base, color: C.textSec, textAlign: 'center', lineHeight: 24 },

  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingVertical: 24 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.border },
  dotActive: { width: 24, backgroundColor: C.accent },

  footer: { paddingHorizontal: 24, paddingBottom: 8 },
  btn: { borderRadius: radius.md, paddingVertical: 16, alignItems: 'center' },
  btnText: { color: '#fff', ...font.base, fontWeight: '700' },
})
