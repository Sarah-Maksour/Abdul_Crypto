import { NextResponse } from 'next/server'
import { getMarketSnapshot, isFuturesSymbol } from '@/lib/market'

const recentScans = new Map<string, number>()

type ScanSignal = {
  symbol: string
  name: string
  direction: 'up' | 'down' | 'watch'
  confidence: number
  entry: number | null
  target: number | null
  stop: number | null
  patterns: string[]
  volumeRatio: number
  candleTime: number
  confirmed: boolean
  available: boolean
}

export async function GET(request: Request) {
  const address = request.headers.get('x-real-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const now = Date.now()
  if (process.env.NODE_ENV !== 'development' && now - (recentScans.get(address) ?? 0) < 4000) {
    return NextResponse.json({ error: 'جارٍ تحديث رادار الشموع؛ انتظر لحظات.' }, { status: 429, headers: { 'Retry-After': '4' } })
  }
  recentScans.set(address, now)
  if (recentScans.size > 500) {
    for (const [key, timestamp] of recentScans) {
      if (now - timestamp > 60000) recentScans.delete(key)
    }
  }

  const params = new URL(request.url).searchParams
  const symbols = [...new Set((params.get('symbols') ?? '').split(',').map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))]
  const directions = (params.get('directions') ?? '').split(',')
  if (!symbols.length || symbols.length > 5 || symbols.some((symbol) => !isFuturesSymbol(symbol)) || (directions.length > 1 && (directions.length !== symbols.length || directions.some((direction) => direction !== 'up' && direction !== 'down')))) {
    return NextResponse.json({ error: 'يسمح بفحص خمسة عقود USDT دائمة كحد أقصى في كل دفعة.' }, { status: 400 })
  }

  const results = await Promise.allSettled(symbols.map(async (symbol, index): Promise<ScanSignal> => {
    const market = await getMarketSnapshot(symbol, '1m')
    const { indicators } = market
    const directionSign = Math.sign(indicators.bias)
    const momentumSign = directions[index] === 'down' ? -1 : 1
    const confirmed = Math.abs(indicators.bias) >= 3
      && directionSign === momentumSign
      && indicators.patternDirection === directionSign
      && indicators.volumeRatio >= 1.1
    const direction = confirmed ? directionSign > 0 ? 'up' : 'down' : 'watch'
    const candle = market.candles.at(-2) ?? market.candles.at(-1)!
    const entry = market.price
    const risk = Math.max(indicators.atr * 1.15, entry * 0.0018)
    const confidence = Math.min(82, Math.round(43 + Math.abs(indicators.bias) * 7 + (indicators.patternDirection ? 7 : 0) + (indicators.volumeRatio >= 1.4 ? 5 : 0)))

    return {
      symbol,
      name: market.name,
      direction,
      confidence,
      entry: confirmed ? entry : null,
      target: confirmed ? Math.max(0, entry + directionSign * risk * 1.5) : null,
      stop: confirmed ? Math.max(0, entry - directionSign * risk) : null,
      patterns: indicators.patterns,
      volumeRatio: indicators.volumeRatio,
      candleTime: candle.time,
      confirmed,
      available: true,
    }
  }))

  const signals = results.map((result, index): ScanSignal => result.status === 'fulfilled' ? result.value : {
    symbol: symbols[index],
    name: symbols[index].slice(0, -4),
    direction: 'watch',
    confidence: 0,
    entry: null,
    target: null,
    stop: null,
    patterns: ['تعذّر تحميل بيانات الشموع'],
    volumeRatio: 0,
    candleTime: 0,
    confirmed: false,
    available: false,
  })
  return NextResponse.json(signals, { headers: { 'Cache-Control': 'public, s-maxage=1, stale-while-revalidate=2' } })
}
