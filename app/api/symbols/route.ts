import { NextResponse } from 'next/server'
import { getFuturesSymbols } from '@/lib/market'

export async function GET() {
  try {
    const symbols = await getFuturesSymbols()
    return NextResponse.json(symbols, { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' } })
  } catch {
    return NextResponse.json({ error: 'تعذّر تحميل قائمة عقود USDT الدائمة.' }, { status: 502 })
  }
}
