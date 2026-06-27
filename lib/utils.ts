import * as Clipboard from 'expo-clipboard'
import * as Linking from 'expo-linking'

export function fmtCurrency(amount: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount)
}

export function genCode(): string {
  return Math.random().toString(36).substr(2, 6).toUpperCase()
}

export async function copyToClipboard(text: string) {
  await Clipboard.setStringAsync(text)
}

export function openRevolut(username: string, amount: number, note: string) {
  const url = `https://revolut.me/${username}?amount=${amount.toFixed(2)}&currency=EUR&description=${encodeURIComponent(note)}`
  Linking.openURL(url)
}

export function openWhatsApp(text: string) {
  Linking.openURL(`whatsapp://send?text=${encodeURIComponent(text)}`)
}

export async function scanReceiptWithClaude(imageBase64: string): Promise<Array<{name: string, price: number, qty: number}>> {
  const apiKey = process.env.EXPO_PUBLIC_ANTHROPIC_KEY
  if (!apiKey) throw new Error('Anthropic API key not configured (EXPO_PUBLIC_ANTHROPIC_KEY missing)')

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-opus-4-6',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 }
          },
          {
            type: 'text',
            text: `Analyze this restaurant/cafe receipt image.
Extract ALL food and drink items with their prices.
Return ONLY a JSON array, no text before or after:
[{"name":"item name","price":12.50,"qty":1}]
Rules:
- price is the price of ONE item in the local currency (number, not string)
- qty is the quantity (default 1)
- If you see "2x Coffee", use qty:2 with single item price
- Ignore tax lines, discounts, totals, service charge - only individual items
- Keep item names as they appear on the receipt
- If currency symbol is visible, note the amount without symbol`
          }
        ]
      }]
    })
  })

  // Read as text first — error responses are sometimes HTML, not JSON
  const rawText = await response.text()
  let data: any = null
  try { data = JSON.parse(rawText) } catch {}

  if (!response.ok) {
    const msg = data?.error?.message
      || `API error ${response.status}: ${rawText.slice(0, 300)}`
    throw new Error(msg)
  }

  if (!data) throw new Error(`Could not parse API response: ${rawText.slice(0, 300)}`)

  const text = data.content?.map((c: any) => c.text || '').join('') || ''

  // Strip markdown code fences Claude sometimes wraps JSON in
  const stripped = text.replace(/```[a-z]*\n?/gi, '').trim()

  // Bracket-count to find the outermost [...] block, handles nested objects correctly
  let depth = 0, start = -1
  for (let i = 0; i < stripped.length; i++) {
    if (stripped[i] === '[') { if (depth++ === 0) start = i }
    else if (stripped[i] === ']' && --depth === 0 && start !== -1) {
      try {
        const items = JSON.parse(stripped.slice(start, i + 1))
        if (Array.isArray(items) && items.length > 0) return items
      } catch {}
      start = -1
    }
  }
  throw new Error('No items found on receipt')
}

export const CURRENCIES = [
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'CHF', symbol: 'Fr', name: 'Swiss Franc' },
  { code: 'HRK', symbol: 'kn', name: 'Croatian Kuna (legacy)' },
  { code: 'BAM', symbol: 'KM', name: 'Bosnia Mark' },
  { code: 'RSD', symbol: 'din', name: 'Serbian Dinar' },
  { code: 'SEK', symbol: 'kr', name: 'Swedish Krona' },
  { code: 'NOK', symbol: 'kr', name: 'Norwegian Krone' },
  { code: 'DKK', symbol: 'kr', name: 'Danish Krone' },
  { code: 'PLN', symbol: 'zł', name: 'Polish Złoty' },
  { code: 'CZK', symbol: 'Kč', name: 'Czech Koruna' },
  { code: 'HUF', symbol: 'Ft', name: 'Hungarian Forint' },
  { code: 'RON', symbol: 'lei', name: 'Romanian Leu' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
]
