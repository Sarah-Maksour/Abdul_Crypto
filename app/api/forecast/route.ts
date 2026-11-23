import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getMarketSnapshot, isFuturesSymbol, type MarketSnapshot } from '@/lib/market'

const requestSchema = z.object({
  symbol: z.string().transform((value) => value.toUpperCase()).refine(isFuturesSymbol, 'عقد USDT غير صالح.'),
  interval: z.enum(['1m', '5m', '15m', '1h', '4h']),
})

const recentForecasts = new Map<string, number>()

function isRateLimited(request: Request) {
  const address = request.headers.get('x-real-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const now = Date.now()
  const previous = recentForecasts.get(address) ?? 0
  if (now - previous < 12000) return true
  recentForecasts.set(address, now)
  if (recentForecasts.size > 500) {
    for (const [key, timestamp] of recentForecasts) {
      if (now - timestamp > 60000) recentForecasts.delete(key)
    }
  }
  return false
}

type CandleWindow = {
  open: number
  high: number
  low: number
  close: number
  volume: number
}

/**
 * Local technical forecast computed from the last 32 candles and the
 * indicators already available in the market snapshot. No external AI
 * API is involved, so the prediction always works offline.
 */
function buildLocalForecast(
  price: number,
  candles: CandleWindow[],
  indicators: MarketSnapshot['indicators'],
) {
  const window = candles.slice(-32)
  const closes = window.map((c) => c.close)
  const last = window.at(-1)!

  // Short-term momentum over the last 8 candles.
  const momentumLookback = Math.min(8, window.length - 1)
  const momentumSlice = closes.slice(-momentumLookback - 1)
  const momentum = momentumSlice.length > 1
    ? (momentumSlice.at(-1)! - momentumSlice[0]) / momentumSlice[0]
    : 0

  // Average true range of the window for range estimation.
  const ranges = window.slice(-15).map((c) => c.high - c.low)
  const avgRange = ranges.length ? ranges.reduce((s, v) => s + v, 0) / ranges.length : price * 0.004
  const atr = Math.max(indicators.atr, avgRange)

  // Volume pressure over the last 5 candles vs the window average.
  const recentVolume = window.slice(-5).reduce((s, c) => s + c.volume, 0) / 5
  const baseVolume = window.reduce((s, c) => s + c.volume, 0) / window.length
  const volumeSurge = baseVolume > 0 ? recentVolume / baseVolume : 1

  // Direction: combine indicator bias, momentum, RSI and EMA alignment.
  const biasScore = indicators.bias
  const momentumScore = Math.sign(momentum) * Math.min(2, Math.abs(momentum) / Math.max(0.001, Math.abs(momentumSlice[0] ?? 1)) * 100)
  const rsiSignal = indicators.rsi > 55 ? 1 : indicators.rsi < 45 ? -1 : 0
  const emaSignal = price > indicators.ema21 && indicators.ema21 > indicators.ema50 ? 1 : price < indicators.ema21 && indicators.ema21 < indicators.ema50 ? -1 : 0

  const composite = biasScore * 1.2 + momentumScore * 0.8 + rsiSignal * 0.6 + emaSignal * 0.6
  const direction: 'up' | 'down' | 'sideways' = composite > 1.2 ? 'up' : composite < -1.2 ? 'down' : 'sideways'

  // Confidence: base 48, scaled by signal agreement, clamped 38–74.
  const agreement = Math.min(4, Math.abs(composite))
  const confidence = Math.round(Math.min(74, Math.max(38, 46 + agreement * 7 + Math.min(1, Math.abs(indicators.rsi - 50) / 15) * 6 + (volumeSurge >= 1.3 ? 4 : 0))))

  // Expected range for the next candle, as an ATR multiple influenced by volume.
  const rangeAtrMultiple = Math.min(2.2, Math.max(0.7, 1.0 + Math.min(1, volumeSurge / 2) * 0.6))
  const range = Math.max(price * 0.0005, atr * rangeAtrMultiple)
  const directionalOffset = direction === 'up' ? range * 0.18 : direction === 'down' ? -range * 0.18 : 0
  const low = Math.max(0, price + directionalOffset - range * 0.8)
  const high = price + directionalOffset + range * 0.8

  const directionLabel = direction === 'up' ? 'صعود' : direction === 'down' ? 'هبوط' : 'حركة جانبية'

  // Evidence signals in Arabic.
  const signals: string[] = []
  signals.push(indicators.patterns[0] ?? 'لا يوجد نمط واضح')
  if (Math.abs(momentum) > 0.0008) signals.push(`زخم ${momentum > 0 ? 'صاعد' : 'هابط'} على آخر ${momentumLookback} شموع`)
  signals.push(`RSI عند ${indicators.rsi.toFixed(0)}${indicators.rsi >= 70 ? ' (تشبّع شراء)' : indicators.rsi <= 30 ? ' (تشبّع بيع)' : ''}`)
  if (volumeSurge >= 1.3) signals.push(`ارتفاع حجم التداول ${volumeSurge.toFixed(1)}× فوق المتوسط`)
  if (Math.abs(indicators.bias) >= 3) signals.push(`توافق فني ${Math.min(5, Math.abs(indicators.bias))}/5`)

  const summary = `القراءة الفنية على آخر ${window.length} شمعة تميل إلى ${directionLabel}؛ النطاق مبني على متوسط التذبذب (ATR) وحجم التداول. هذا توقع تعليمي احتمالي وليس توصية.`

  // Trade levels only for directional calls.
  const risk = Math.max(atr * 1.15, price * 0.0018)
  const directionSign = direction === 'up' ? 1 : direction === 'down' ? -1 : 0
  const entry = directionSign ? price : null
  const target = directionSign > 0 ? price + risk * 1.5 : directionSign < 0 ? Math.max(0, price - risk * 1.5) : null
  const stop = directionSign > 0 ? Math.max(0, price - risk) : directionSign < 0 ? price + risk : null

  return {
    direction,
    confidence,
    summary,
    signals: signals.slice(0, 4),
    low,
    high,
    currentPrice: price,
    entry,
    target,
    stop,
    atr,
    rangeAtrMultiple,
  }
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== 'development' && isRateLimited(request)) {
    return NextResponse.json({ error: 'انتظر قليلاً قبل طلب توقع آخر.' }, { status: 429, headers: { 'Retry-After': '12' } })
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'طلب التوقع غير صالح.' }, { status: 400 })

  try {
    const { symbol, interval } = parsed.data
    const snapshot = await getMarketSnapshot(symbol, interval)
    const { candles, indicators } = snapshot
    const window = candles.slice(-32).map(({ open, high, low, close, volume }) => ({ open, high, low, close, volume }))
    const forecast = buildLocalForecast(snapshot.price, window, indicators)

    return NextResponse.json({
      ...forecast,
      source: 'technical' as const,
      generatedAt: new Date().toISOString(),
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[forecast] Local computation failed:', error)
    const detail = process.env.NODE_ENV === 'development' && error instanceof Error ? ` (${error.message})` : ''
    return NextResponse.json({ error: `تعذّر إنشاء التوقع الآن. تحقّق من الاتصال ثم أعد المحاولة.${detail}` }, { status: 503 })
  }
}
