export const MARKETS = [
  { symbol: 'BTCUSDT', name: 'Bitcoin', short: 'BTC' },
  { symbol: 'ETHUSDT', name: 'Ethereum', short: 'ETH' },
  { symbol: 'SOLUSDT', name: 'Solana', short: 'SOL' },
  { symbol: 'XRPUSDT', name: 'XRP', short: 'XRP' },
  { symbol: 'ADAUSDT', name: 'Cardano', short: 'ADA' },
  { symbol: 'DOGEUSDT', name: 'Dogecoin', short: 'DOGE' },
  { symbol: 'ONEUSDT', name: 'Harmony', short: 'ONE' },
  { symbol: 'IDOLUSDT', name: 'IDOL', short: 'IDOL' },
  { symbol: 'AKEUSDT', name: 'AKE', short: 'AKE' },
] as const

export const TIMEFRAMES = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '1h': '1H',
  '4h': '4H',
} as const

export type SymbolKey = string
export type Timeframe = keyof typeof TIMEFRAMES
export type Candle = {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export type MarketSnapshot = {
  symbol: SymbolKey
  name: string
  short: string
  timeframe: Timeframe
  source: 'Bitget USDT-M Futures'
  updatedAt: number
  price: number
  change24h: number
  candles: Candle[]
  indicators: {
    rsi: number
    ema21: number
    ema50: number
    vwap: number
    atr: number
    volumeRatio: number
    bias: number
    patterns: string[]
    patternDirection: number
  }
}

export type Ticker = {
  symbol: SymbolKey
  name: string
  short: string
  price: number
  change24h: number
  volume24h: number
  high24h: number
  low24h: number
}

export type FuturesSymbol = {
  symbol: SymbolKey
  baseCoin: string
  name: string
  quoteCoin: 'USDT'
}

const favoriteNames = new Map<string, string>(MARKETS.map((market) => [market.symbol, market.name]))
const symbolPattern = /^[A-Z0-9]{2,25}USDT$/

type BitgetEnvelope<T> = { code?: string; msg?: string; data?: T }

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
}

function ema(values: number[], period: number) {
  const multiplier = 2 / (period + 1)
  return values.reduce((result, value, index) => index === 0 ? value : value * multiplier + result * (1 - multiplier), values[0] ?? 0)
}

function findPatterns(candles: Candle[]) {
  const index = candles.length - 2
  const current = candles[index]
  const previous = candles[index - 1]
  const first = candles[index - 2]
  if (!current || !previous || !first) return { patterns: ['لا يوجد نمط مكتمل بعد'], direction: 0 }

  const range = Math.max(current.high - current.low, Number.EPSILON)
  const body = Math.abs(current.close - current.open)
  const upperWick = current.high - Math.max(current.open, current.close)
  const lowerWick = Math.min(current.open, current.close) - current.low
  const prevRange = Math.max(previous.high - previous.low, Number.EPSILON)
  const prevBody = Math.abs(previous.close - previous.open)
  const firstRange = Math.max(first.high - first.low, Number.EPSILON)
  const firstBody = Math.abs(first.close - first.open)
  const trendAnchor = candles[Math.max(0, index - 7)]
  const downtrend = trendAnchor && current.close < trendAnchor.close
  const uptrend = trendAnchor && current.close > trendAnchor.close
  const patterns: string[] = []
  let direction = 0

  if (body / range <= 0.12) patterns.push('دوجي — تردد')
  if (body / range <= 0.16 && lowerWick > range * 0.55 && upperWick < range * 0.18) {
    if (downtrend) { patterns.push('مطرقة صاعدة'); direction += 1 }
    else if (uptrend) { patterns.push('رجل مشنوق'); direction -= 1 }
  }
  if (body / range <= 0.2 && upperWick > range * 0.55 && lowerWick < range * 0.18) {
    if (uptrend) { patterns.push('نجمة ساقطة'); direction -= 1 }
    else if (downtrend) { patterns.push('مطرقة مقلوبة'); direction += 1 }
  }
  if (previous.close < previous.open && current.close > current.open && current.open <= previous.close && current.close >= previous.open) {
    patterns.push('ابتلاع صاعد'); direction += 2
  }
  if (previous.close > previous.open && current.close < current.open && current.open >= previous.close && current.close <= previous.open) {
    patterns.push('ابتلاع هابط'); direction -= 2
  }
  if (first.close < first.open && firstBody / firstRange > 0.55 && prevBody / prevRange < 0.35 && current.close > current.open && current.close > (first.open + first.close) / 2) {
    patterns.push('نجمة الصباح'); direction += 2
  }
  if (first.close > first.open && firstBody / firstRange > 0.55 && prevBody / prevRange < 0.35 && current.close < current.open && current.close < (first.open + first.close) / 2) {
    patterns.push('نجمة المساء'); direction -= 2
  }
  if (previous.close < previous.open && current.close > current.open && current.open < previous.low && current.close > (previous.open + previous.close) / 2 && current.close < previous.open) {
    patterns.push('خط الاختراق الصاعد'); direction += 1
  }
  if (previous.close > previous.open && current.close < current.open && current.open > previous.high && current.close < (previous.open + previous.close) / 2 && current.close > previous.open) {
    patterns.push('غطاء السحابة الداكن'); direction -= 1
  }
  const three = candles.slice(index - 2, index + 1)
  if (three.length === 3 && three.every((candle) => candle.close > candle.open) && three[0].close < three[1].close && three[1].close < three[2].close && three.every((candle) => Math.abs(candle.close - candle.open) / Math.max(candle.high - candle.low, Number.EPSILON) > 0.5)) {
    patterns.push('ثلاثة جنود بيض'); direction += 2
  }
  if (three.length === 3 && three.every((candle) => candle.close < candle.open) && three[0].close > three[1].close && three[1].close > three[2].close && three.every((candle) => Math.abs(candle.close - candle.open) / Math.max(candle.high - candle.low, Number.EPSILON) > 0.5)) {
    patterns.push('ثلاثة غربان سود'); direction -= 2
  }
  if (current.high < previous.high && current.low > previous.low) patterns.push('شمعة داخلية — ترقّب الاختراق')
  if (body / range > 0.82) {
    patterns.push(current.close > current.open ? 'ماروبوزو صاعدة' : 'ماروبوزو هابطة')
    direction += current.close > current.open ? 1 : -1
  }
  if (!patterns.length) patterns.push('لا يوجد نمط انعكاسي واضح')
  return { patterns, direction: Math.sign(direction) }
}

function calculateIndicators(candles: Candle[]) {
  const closes = candles.map((candle) => candle.close)
  const last = candles.at(-1)!
  const recent = candles.slice(-15)
  const gains: number[] = []
  const losses: number[] = []
  for (let index = Math.max(1, closes.length - 14); index < closes.length; index += 1) {
    const delta = closes[index] - closes[index - 1]
    gains.push(Math.max(0, delta))
    losses.push(Math.max(0, -delta))
  }
  const avgGain = average(gains)
  const avgLoss = average(losses)
  const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  const typical = candles.slice(-48)
  const volumeSum = typical.reduce((sum, candle) => sum + candle.volume, 0)
  const vwap = volumeSum > 0
    ? typical.reduce((sum, candle) => sum + ((candle.high + candle.low + candle.close) / 3) * candle.volume, 0) / volumeSum
    : last.close
  const atr = average(recent.map((candle, index) => {
    const previousClose = candles[candles.length - recent.length + index - 1]?.close ?? candle.close
    return Math.max(candle.high - candle.low, Math.abs(candle.high - previousClose), Math.abs(candle.low - previousClose))
  }))
  const volumeBase = average(candles.slice(-21, -1).map((candle) => candle.volume))
  const volumeRatio = volumeBase > 0 ? last.volume / volumeBase : 1
  const ema21 = ema(closes.slice(-80), 21)
  const ema50 = ema(closes.slice(-120), 50)
  const candlePattern = findPatterns(candles)
  const signalCandle = candles.at(-2) ?? last
  const bias = [
    signalCandle.close > vwap ? 1 : signalCandle.close < vwap ? -1 : 0,
    rsi > 52 ? 1 : rsi < 48 ? -1 : 0,
    signalCandle.close > ema21 && ema21 > ema50 ? 1 : signalCandle.close < ema21 && ema21 < ema50 ? -1 : 0,
    candlePattern.direction,
    volumeRatio >= 1.2 ? Math.sign(signalCandle.close - signalCandle.open) : 0,
  ].reduce((sum, item) => sum + item, 0)

  return { rsi, ema21, ema50, vwap, atr, volumeRatio, bias, patterns: candlePattern.patterns, patternDirection: candlePattern.direction }
}

async function getBitgetData<T>(url: string, revalidate = 1): Promise<T> {
  const response = await fetch(url, { next: { revalidate } })
  if (!response.ok) throw new Error('تعذّر الوصول إلى بيانات Bitget Futures.')
  const payload = await response.json() as BitgetEnvelope<T>
  if (payload.code !== '00000' || payload.data === undefined) throw new Error(payload.msg || 'أعاد مصدر العقود استجابة غير صالحة.')
  return payload.data
}

export async function getFuturesSymbols(): Promise<FuturesSymbol[]> {
  const contracts = await getBitgetData<Array<{ symbol: string; baseCoin: string; quoteCoin: string; symbolStatus: string }>>(
    'https://api.bitget.com/api/v2/mix/market/contracts?productType=USDT-FUTURES', 3600,
  )
  return contracts
    .filter((contract) => contract.quoteCoin === 'USDT' && contract.symbolStatus === 'normal' && symbolPattern.test(contract.symbol))
    .map((contract) => ({
      symbol: contract.symbol,
      baseCoin: contract.baseCoin,
      name: favoriteNames.get(contract.symbol) ?? contract.baseCoin,
      quoteCoin: 'USDT' as const,
    }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol))
}

export async function getMarketTickers(): Promise<Ticker[]> {
  const raw = await getBitgetData<Array<{
    symbol: string
    lastPr: string
    change24h: string
    quoteVolume?: string
    usdtVolume?: string
    high24h?: string
    low24h?: string
  }>>('https://api.bitget.com/api/v2/mix/market/tickers?productType=USDT-FUTURES', 1)

  return raw.flatMap((ticker) => {
    const price = Number(ticker.lastPr)
    const volume24h = Number(ticker.quoteVolume ?? ticker.usdtVolume ?? 0)
    if (!symbolPattern.test(ticker.symbol) || !Number.isFinite(price) || price <= 0) return []
    const baseCoin = ticker.symbol.slice(0, -4)
    return [{
      symbol: ticker.symbol,
      name: favoriteNames.get(ticker.symbol) ?? baseCoin,
      short: baseCoin,
      price,
      change24h: Number(ticker.change24h) * 100,
      volume24h: Number.isFinite(volume24h) ? volume24h : 0,
      high24h: Number(ticker.high24h ?? price),
      low24h: Number(ticker.low24h ?? price),
    }]
  })
}

export async function getMarketSnapshot(symbol: string, timeframe: string): Promise<MarketSnapshot> {
  const normalizedSymbol = symbol.toUpperCase()
  const interval = TIMEFRAMES[timeframe as Timeframe]
  if (!symbolPattern.test(normalizedSymbol) || !interval) throw new Error('العملة أو الإطار الزمني غير مدعوم.')

  const query = new URLSearchParams({ symbol: normalizedSymbol, granularity: interval, limit: '300', productType: 'USDT-FUTURES' })
  const raw = await getBitgetData<string[][]>(`https://api.bitget.com/api/v2/mix/market/candles?${query}`, 1)
  if (raw.length < 55) throw new Error('البيانات التاريخية غير كافية لهذا العقد.')

  const candles = raw.map((row) => ({
    time: Number(row[0]),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5]),
  })).filter((candle) => Object.values(candle).every(Number.isFinite)).sort((a, b) => a.time - b.time) as Candle[]
  const market = MARKETS.find((item) => item.symbol === normalizedSymbol)
  const price = candles.at(-1)!.close
  const previous = candles.at(-2) ?? candles.at(-1)!

  return {
    symbol: normalizedSymbol,
    name: market?.name ?? normalizedSymbol.slice(0, -4),
    short: market?.short ?? normalizedSymbol.slice(0, -4),
    timeframe: timeframe as Timeframe,
    source: 'Bitget USDT-M Futures',
    updatedAt: Date.now(),
    price,
    change24h: previous.close ? ((price - previous.close) / previous.close) * 100 : 0,
    candles,
    indicators: calculateIndicators(candles),
  }
}

export function isFuturesSymbol(symbol: string) {
  return symbolPattern.test(symbol.toUpperCase())
}
