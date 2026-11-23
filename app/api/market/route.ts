import { NextResponse } from 'next/server'
import { getMarketSnapshot, TIMEFRAMES } from '@/lib/market'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const interval = url.searchParams.get('interval') ?? '1m'
  if (!Object.hasOwn(TIMEFRAMES, interval)) {
    return NextResponse.json({ error: 'إطار زمني غير مدعوم.' }, { status: 400 })
  }

  try {
    const symbol = url.searchParams.get('symbol') ?? 'BTCUSDT'
    const snapshot = await getMarketSnapshot(symbol, interval)
    return NextResponse.json(snapshot, { headers: { 'Cache-Control': 'public, s-maxage=1, stale-while-revalidate=2' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'تعذّر تحميل بيانات السوق.'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
