import { NextResponse } from 'next/server'
import { getMarketTickers } from '@/lib/market'

export async function GET() {
  try {
    const tickers = await getMarketTickers()
    return NextResponse.json(tickers, { headers: { 'Cache-Control': 'public, s-maxage=1, stale-while-revalidate=2' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'تعذّر تحميل قائمة الأسواق.'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
