'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import useSWRMutation from 'swr/mutation'
import LiveScanner, { type FuturesSignal, type MomentumCandidate } from '@/components/live-scanner'
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronUp,
  Clipboard,
  Clock3,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Waves,
  Zap,
} from 'lucide-react'
import type { Candle, FuturesSymbol, MarketSnapshot, Ticker, Timeframe, SymbolKey } from '@/lib/market'

const timeframes: Timeframe[] = ['1m', '5m', '15m', '1h', '4h']
const timeframeLabels: Record<Timeframe, string> = { '1m': 'دقيقة', '5m': '5 دقائق', '15m': '15 دقيقة', '1h': 'ساعة', '4h': '4 ساعات' }
async function fetcher<T>(url: string): Promise<T> {
  const response = await fetch(url)
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error || 'تعذّر تحميل البيانات.')
  return payload as T
}

async function forecastFetcher(url: string, { arg }: { arg: { symbol: SymbolKey; interval: Timeframe } }) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(arg),
  })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error || 'تعذّر إنشاء التوقع.')
  return payload as Forecast
}

type Forecast = {
  direction: 'up' | 'down' | 'sideways'
  confidence: number
  summary: string
  signals: string[]
  low: number
  high: number
  currentPrice: number
  generatedAt: string
  source: 'ai' | 'technical'
  entry: number | null
  target: number | null
  stop: number | null
}

function formatPrice(value: number) {
  if (!Number.isFinite(value)) return '—'
  const digits = value >= 1000 ? 2 : value >= 1 ? 3 : 5
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: digits }).format(value)
}

function formatUsd(value: number) {
  return `$${formatPrice(value)}`
}

function formatChange(value: number) {
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
}

function CandleChart({ candles, forecast, loading }: { candles: Candle[]; forecast?: Forecast; loading: boolean }) {
  const chart = useMemo(() => {
    const visible = candles.slice(-64)
    if (visible.length < 2) return null
    const highs = visible.map((item) => item.high)
    const lows = visible.map((item) => item.low)
    if (forecast) {
      highs.push(forecast.high)
      lows.push(forecast.low)
    }
    const max = Math.max(...highs)
    const min = Math.min(...lows)
    const pad = Math.max((max - min) * 0.11, max * 0.001)
    const top = max + pad
    const bottom = min - pad
    const left = 70
    const right = 12
    const plotTop = 14
    const plotBottom = 242
    const volumeTop = 260
    const volumeBottom = 296
    const plotHeight = plotBottom - plotTop
    const plotWidth = 840 - left - right
    const maxVolume = Math.max(...visible.map((item) => item.volume))
    const step = plotWidth / visible.length
    const y = (price: number) => plotTop + ((top - price) / (top - bottom)) * plotHeight
    return { visible, top, bottom, left, right, plotTop, plotBottom, volumeTop, volumeBottom, plotHeight, plotWidth, maxVolume, step, y }
  }, [candles, forecast])

  if (loading && !chart) return <div className="chart-loading"><span className="spinner" /> جاري تحميل الشموع...</div>
  if (!chart) return <div className="chart-loading">لا توجد شموع كافية للرسم.</div>

  const { visible, top, bottom, left, right, plotTop, plotBottom, volumeTop, volumeBottom, plotHeight, plotWidth, maxVolume, step, y } = chart
  const gridPrices = Array.from({ length: 5 }, (_, index) => top - ((top - bottom) * index) / 4)

  return (
    <div className="chart-wrap" aria-busy={loading}>
      {loading && <div className="chart-refresh"><RefreshCw className="spin-soft" /> تحديث</div>}
      <svg className="candle-chart" viewBox="0 0 840 310" role="img" aria-label="رسم الشموع اليابانية للزوج المحدد">
        <defs>
          <linearGradient id="volume-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#4caa8b" stopOpacity=".68" />
            <stop offset="100%" stopColor="#4caa8b" stopOpacity=".16" />
          </linearGradient>
        </defs>
        {gridPrices.map((price, index) => (
          <g key={price}>
            <line x1={left} x2={840 - right} y1={y(price)} y2={y(price)} className="chart-grid" />
            <text x={left - 10} y={y(price) + 4} textAnchor="end" className="chart-axis-label">{formatPrice(price)}</text>
            {index === 0 && <text x={left} y={plotTop - 3} className="chart-axis-label">السعر</text>}
          </g>
        ))}
        {forecast && [forecast.high, forecast.low].map((price, index) => (
          <g key={index}>
            <line x1={left} x2={840 - right} y1={y(price)} y2={y(price)} className={index === 0 ? 'forecast-line forecast-high' : 'forecast-line forecast-low'} />
            <text x={840 - right - 4} y={y(price) - 5} textAnchor="end" className="forecast-chart-label">{index === 0 ? 'الحد الأعلى' : 'الحد الأدنى'}</text>
          </g>
        ))}
        {visible.map((candle, index) => {
          const x = left + index * step + step / 2
          const rising = candle.close >= candle.open
          const color = rising ? '#47d7a5' : '#fb7185'
          const bodyTop = y(Math.max(candle.open, candle.close))
          const bodyBottom = y(Math.min(candle.open, candle.close))
          const bodyHeight = Math.max(1.5, bodyBottom - bodyTop)
          const bodyWidth = Math.max(2, Math.min(8, step * 0.54))
          const volumeHeight = (candle.volume / (maxVolume || 1)) * (volumeBottom - volumeTop)
          return (
            <g key={`${candle.time}-${index}`}>
              <line x1={x} x2={x} y1={y(candle.high)} y2={y(candle.low)} stroke={color} strokeWidth="1.2" />
              <rect x={x - bodyWidth / 2} y={bodyTop} width={bodyWidth} height={bodyHeight} rx=".7" fill={color} />
              <rect x={x - bodyWidth / 2} y={volumeBottom - volumeHeight} width={bodyWidth} height={volumeHeight} fill="url(#volume-fill)" opacity={rising ? 0.95 : 0.7} />
            </g>
          )
        })}
        <line x1={left} x2={840 - right} y1={plotBottom + 8} y2={plotBottom + 8} className="chart-divider" />
        <text x={left} y={volumeTop - 4} className="chart-axis-label">الحجم</text>
        <text x={left} y={307} className="chart-axis-label">{new Date(visible[0].time).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })}</text>
        <text x={840 - right} y={307} textAnchor="end" className="chart-axis-label">{new Date(visible.at(-1)!.time).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })}</text>
      </svg>
    </div>
  )
}

function MarketSidebar({ tickers, contracts, selected, onSelect, busy }: { tickers?: Ticker[]; contracts?: FuturesSymbol[]; selected: SymbolKey; onSelect: (symbol: SymbolKey) => void; busy: boolean }) {
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState(false)
  const [copiedSymbol, setCopiedSymbol] = useState<string | null>(null)
  const tickerBySymbol = new Map((tickers ?? []).map((ticker) => [ticker.symbol, ticker]))
  const normalizedQuery = query.trim().toLowerCase()
  const rows = (contracts ?? [])
    .filter((contract) => !normalizedQuery || `${contract.symbol} ${contract.baseCoin} ${contract.name}`.toLowerCase().includes(normalizedQuery))
    .sort((left, right) => {
      if (normalizedQuery) return left.symbol.localeCompare(right.symbol)
      return (tickerBySymbol.get(right.symbol)?.volume24h ?? 0) - (tickerBySymbol.get(left.symbol)?.volume24h ?? 0)
    })
    .slice(0, normalizedQuery ? 24 : 12)

  async function copySymbol(event: React.MouseEvent, contractSymbol: string) {
    event.stopPropagation()
    try {
      await navigator.clipboard.writeText(contractSymbol)
      setCopiedSymbol(contractSymbol)
      setTimeout(() => setCopiedSymbol((current) => current === contractSymbol ? null : current), 1500)
    } catch {
      // Clipboard API may be unavailable; silently ignore.
    }
  }

  return (
    <aside className="panel watch-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">بحث ومتابعة</p>
          <h2>عقود USDT الدائمة</h2>
        </div>
        <div className="watch-heading-actions">
          <span className="market-count">{contracts?.length.toLocaleString('en-US') ?? '—'} عقد</span>
          <button type="button" className="collapse-toggle" aria-label={collapsed ? 'إظهار القائمة' : 'طيّ القائمة'} aria-expanded={!collapsed} onClick={() => setCollapsed((value) => !value)}>
            {collapsed ? <ChevronDown /> : <ChevronUp />}
          </button>
        </div>
      </div>
      {!collapsed && (
        <>
          <label className="symbol-search">
            <Search aria-hidden="true" />
            <input aria-label="ابحث باسم العملة أو رمز العقد" placeholder="ابحث بالاسم أو الرمز…" value={query} onChange={(event) => setQuery(event.target.value)} />
            {query && <button type="button" aria-label="مسح البحث" onClick={() => setQuery('')}>×</button>}
          </label>
          {!contracts && busy ? (
            <div className="watch-loading"><span className="spinner" /> تحميل عقود الفيوتشر</div>
          ) : rows.length ? (
            <div className="watch-list">
              {rows.map((contract) => {
                const ticker = tickerBySymbol.get(contract.symbol)
                const active = contract.symbol === selected
                const positive = (ticker?.change24h ?? 0) >= 0
                const copied = copiedSymbol === contract.symbol
                return (
                  <button key={contract.symbol} type="button" className={`watch-row ${active ? 'watch-row-active' : ''}`} onClick={() => onSelect(contract.symbol)} aria-pressed={active}>
                    <span className={`coin-mark coin-${contract.baseCoin.toLowerCase()}`}>{contract.baseCoin.slice(0, 1)}</span>
                    <span className="watch-name">
                      <span className="watch-name-row">
                        <b>{contract.baseCoin}<small>/ USDT PERP</small></b>
                        <button type="button" className={`copy-symbol-button ${copied ? 'copy-symbol-done' : ''}`} aria-label={copied ? 'تم النسخ' : `نسخ ${contract.symbol}`} onClick={(event) => copySymbol(event, contract.symbol)} title={copied ? 'تم النسخ' : 'نسخ الرمز'}>
                          {copied ? <Check /> : <Clipboard />}
                        </button>
                      </span>
                      <small>{contract.name}</small>
                    </span>
                    <span className="watch-quote"><b>{ticker ? `$${formatPrice(ticker.price)}` : '—'}</b><small className={positive ? 'tone-positive' : 'tone-negative'}>{ticker ? formatChange(ticker.change24h) : '—'}</small></span>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="watch-loading">{normalizedQuery ? 'لا توجد عقود تطابق البحث.' : 'تعذّر تحميل عقود USDT الدائمة.'}</div>
          )}
          <div className="watch-footer"><span className="live-dot" /> {query ? `نتائج البحث: ${rows.length}` : 'الأسعار تُحدّث كل 10 ثوانٍ'}</div>
        </>
      )}
    </aside>
  )
}: { tickers?: Ticker[]; contracts?: FuturesSymbol[]; selected: SymbolKey; onSelect: (symbol: SymbolKey) => void; busy: boolean }) {
  const [query, setQuery] = useState('')
  const tickerBySymbol = new Map((tickers ?? []).map((ticker) => [ticker.symbol, ticker]))
  const normalizedQuery = query.trim().toLowerCase()
  const rows = (contracts ?? [])
    .filter((contract) => !normalizedQuery || `${contract.symbol} ${contract.baseCoin} ${contract.name}`.toLowerCase().includes(normalizedQuery))
    .sort((left, right) => {
      if (normalizedQuery) return left.symbol.localeCompare(right.symbol)
      return (tickerBySymbol.get(right.symbol)?.volume24h ?? 0) - (tickerBySymbol.get(left.symbol)?.volume24h ?? 0)
    })
    .slice(0, normalizedQuery ? 24 : 12)

  return (
    <aside className="panel watch-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">بحث ومتابعة</p>
          <h2>عقود USDT الدائمة</h2>
        </div>
        <span className="market-count">{contracts?.length.toLocaleString('en-US') ?? '—'} عقد</span>
      </div>
      <label className="symbol-search">
        <Search aria-hidden="true" />
        <input aria-label="ابحث باسم العملة أو رمز العقد" placeholder="ابحث بالاسم أو الرمز…" value={query} onChange={(event) => setQuery(event.target.value)} />
        {query && <button type="button" aria-label="مسح البحث" onClick={() => setQuery('')}>×</button>}
      </label>
      {!contracts && busy ? (
        <div className="watch-loading"><span className="spinner" /> تحميل عقود الفيوتشر</div>
      ) : rows.length ? (
        <div className="watch-list">
          {rows.map((contract) => {
            const ticker = tickerBySymbol.get(contract.symbol)
            const active = contract.symbol === selected
            const positive = (ticker?.change24h ?? 0) >= 0
            return (
              <button key={contract.symbol} type="button" className={`watch-row ${active ? 'watch-row-active' : ''}`} onClick={() => onSelect(contract.symbol)} aria-pressed={active}>
                <span className={`coin-mark coin-${contract.baseCoin.toLowerCase()}`}>{contract.baseCoin.slice(0, 1)}</span>
                <span className="watch-name"><b>{contract.baseCoin}<small>/ USDT PERP</small></b><small>{contract.name}</small></span>
                <span className="watch-quote"><b>{ticker ? `$${formatPrice(ticker.price)}` : '—'}</b><small className={positive ? 'tone-positive' : 'tone-negative'}>{ticker ? formatChange(ticker.change24h) : '—'}</small></span>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="watch-loading">{normalizedQuery ? 'لا توجد عقود تطابق البحث.' : 'تعذّر تحميل عقود USDT الدائمة.'}</div>
      )}
      <div className="watch-footer"><span className="live-dot" /> {query ? `نتائج البحث: ${rows.length}` : 'الأسعار تُحدّث كل ثانية'}</div>
    </aside>
  )
}

function ForecastPanel({
  forecast,
  loading,
  error,
  onGenerate,
  generating,
  currentPrice,
}: {
  forecast?: Forecast
  loading: boolean
  error?: Error
  onGenerate: () => void
  generating: boolean
  currentPrice?: number
}) {
  const trend = forecast?.direction ?? 'sideways'
  const colors = trend === 'up' ? 'direction-up' : trend === 'down' ? 'direction-down' : 'direction-flat'
  const labels = trend === 'up' ? 'صعود متوقع' : trend === 'down' ? 'هبوط متوقع' : 'حركة جانبية'
  const price = forecast?.currentPrice ?? currentPrice

  return (
    <aside className="panel forecast-panel" id="forecast">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">تحليل النموذج</p>
          <h2 className="forecast-title"><Sparkles /> توقع الشمعة القادمة</h2>
        </div>
        <span className="ai-chip"><span className="ai-dot" />{forecast?.source === 'technical' ? 'تقدير فني' : 'AI'}</span>
      </div>

      {!forecast ? (
        <div className="forecast-empty">
          <div className="forecast-orbit"><Waves /></div>
          <p>حوّل بيانات السوق والمؤشرات إلى قراءة احتمالية واضحة للشمعة التالية.</p>
          <button type="button" className="primary-button" onClick={onGenerate} disabled={generating || loading}>
            {generating ? <><span className="spinner spinner-dark" /> جارٍ التحليل</> : <><Sparkles /> حلّل بالذكاء الاصطناعي</>}
          </button>
          {error && <p className="inline-error" role="alert">{error.message}</p>}
          <span className="forecast-source-note">التحليل مبني على آخر 32 شمعة ومؤشرات قابلة للفحص</span>
        </div>
      ) : (
        <div className="forecast-result" aria-live="polite">
          <div className={`direction-card ${colors}`}>
            <span className="direction-icon">{trend === 'up' ? <TrendingUp /> : trend === 'down' ? <TrendingDown /> : <Activity />}</span>
            <span><small>الاتجاه الأرجح</small><b>{labels}</b></span>
            <span className="confidence"><b>{forecast.confidence}%</b><small>تقدير الثقة</small></span>
          </div>
          <div className="confidence-track" role="img" aria-label={`ثقة النموذج ${forecast.confidence} بالمئة`}><span style={{ width: `${forecast.confidence}%` }} /></div>
          <p className="forecast-summary">{forecast.summary}</p>
          <div className="range-box">
            <div className="range-heading"><span>النطاق السعري المتوقع</span><span>للشمعة القادمة</span></div>
            <div className="range-prices"><b>{formatUsd(forecast.low)}</b><span className="range-track"><i /></span><b>{formatUsd(forecast.high)}</b></div>
            <div className="range-endpoints"><span>منخفض</span><span>مرتفع</span></div>
            <div className="range-reference">السعر الحالي {formatUsd(price ?? 0)}</div>
          </div>
          {forecast.entry !== null && forecast.target !== null && forecast.stop !== null && (
            <div className="scenario-levels">
              <div><small>دخول مرجعي</small><b>{formatUsd(forecast.entry)}</b></div>
              <div><small>هدف مبدئي</small><b className="tone-positive">{formatUsd(forecast.target)}</b></div>
              <div><small>وقف تقديري</small><b className="tone-negative">{formatUsd(forecast.stop)}</b></div>
            </div>
          )}
          <div className="evidence-list">
            <p className="section-mini-title"><ShieldCheck /> إشارات داعمة</p>
            {forecast.signals.map((signal, index) => <div className="evidence-item" key={`${index}-${signal}`}><Check /> <span>{signal}</span></div>)}
          </div>
          <button type="button" className="secondary-button regenerate" onClick={onGenerate} disabled={generating || loading}>
            {generating ? <><span className="spinner" /> تحديث التوقع</> : <><RefreshCw /> أعد التحليل</>}
          </button>
          {error && <p className="inline-error" role="alert">{error.message}</p>}
          <p className="forecast-disclaimer">{forecast.source === 'technical' ? 'المعاينة المحلية تستخدم تقديراً فنياً بديلاً؛ توليد AI يتطلب نشر التطبيق على Vercel.' : 'توقع احتمالي تعليمي، وليس توصية استثمارية أو ضماناً للنتيجة.'}</p>
        </div>
      )}
    </aside>
  )
}

export default function TradeDashboard() {
  const [symbol, setSymbol] = useState<SymbolKey>('BTCUSDT')
  const [timeframe, setTimeframe] = useState<Timeframe>('1m')
  const [forecastFor, setForecastFor] = useState('')
  const [scanSymbols, setScanSymbols] = useState<string[]>([])
  const [scanDirections, setScanDirections] = useState<Array<'up' | 'down'>>([])
  const [momentumCandidates, setMomentumCandidates] = useState<MomentumCandidate[]>([])
  const [scannerRefreshing, setScannerRefreshing] = useState(false)
  const priceHistory = useRef(new Map<string, { time: number; price: number }[]>())
  const lastScanBatchAt = useRef(0)
  const marketKey = `/api/market?symbol=${encodeURIComponent(symbol)}&interval=${timeframe}`
  const activeForecastKey = `${symbol}:${timeframe}`
  const { data: market, error: marketError, isLoading: marketLoading, mutate: refreshMarket } = useSWR<MarketSnapshot>(marketKey, fetcher, {
    refreshInterval: 10000,
    dedupingInterval: 9000,
    revalidateOnFocus: false,
    keepPreviousData: true,
  })
  const { data: tickers, error: tickersError, isLoading: tickersLoading, mutate: refreshTickers } = useSWR<Ticker[]>('/api/markets', fetcher, {
    refreshInterval: 10000,
    dedupingInterval: 9000,
    revalidateOnFocus: false,
    keepPreviousData: true,
  })
  const { data: contracts, error: contractsError, isLoading: contractsLoading } = useSWR<FuturesSymbol[]>('/api/symbols', fetcher, { revalidateOnFocus: false })
  const scannerKey = scanSymbols.length
    ? `/api/scanner?symbols=${encodeURIComponent(scanSymbols.join(','))}&directions=${scanDirections.join(',')}`
    : null
  const { data: scannerSignals, isLoading: scannerLoading } = useSWR<FuturesSignal[]>(scannerKey, fetcher, {
    refreshInterval: 10000,
    dedupingInterval: 9000,
    revalidateOnFocus: false,
  })
  const { trigger, data: forecast, error: forecastError, isMutating } = useSWRMutation('/api/forecast', forecastFetcher)
  const currentForecast = forecastFor === activeForecastKey ? forecast : undefined
  const indicators = market?.indicators
  const dashboardError = marketError ?? tickersError ?? contractsError
  const current = market?.candles.at(-1)
  const currentTicker = tickers?.find((item) => item.symbol === symbol)
  const displayedPrice = currentTicker?.price ?? market?.price
  const displayedChange = currentTicker?.change24h
  const intervalMs = { '1m': 60_000, '5m': 5 * 60_000, '15m': 15 * 60_000, '1h': 60 * 60_000, '4h': 4 * 60 * 60_000 }[timeframe]
  const candleElapsed = current ? Math.max(0, Date.now() - current.time) % intervalMs : 0
  const timeRemaining = Math.max(0, intervalMs - candleElapsed)
  const remainingLabel = `${String(Math.floor(timeRemaining / 60_000)).padStart(2, '0')}:${String(Math.floor((timeRemaining % 60_000) / 1000)).padStart(2, '0')}`
  const bullish = (indicators?.bias ?? 0) > 0
  const bearish = (indicators?.bias ?? 0) < 0
  const biasScore = indicators ? `${Math.min(5, Math.abs(indicators.bias))}/5` : '—'
  useEffect(() => {
    if (!tickers?.length) return
    const now = Date.now()
    for (const ticker of tickers) {
      if (!Number.isFinite(ticker.price) || ticker.price <= 0) continue
      const samples = priceHistory.current.get(ticker.symbol) ?? []
      if (!samples.length || now - samples[samples.length - 1].time >= 850) {
        samples.push({ time: now, price: ticker.price })
        if (samples.length > 24) samples.shift()
        priceHistory.current.set(ticker.symbol, samples)
      }
    }

    const candidates = tickers.flatMap((ticker) => {
      const samples = priceHistory.current.get(ticker.symbol) ?? []
      if (samples.length < 5 || ticker.volume24h < 25000) return []
      const latest = samples[samples.length - 1]
      const baseline = samples.find((sample) => now - sample.time >= 6000) ?? samples[0]
      if (!baseline || now - baseline.time < 3500 || baseline.price <= 0) return []
      const changePct = ((latest.price - baseline.price) / baseline.price) * 100
      if (Math.abs(changePct) < 0.1) return []
      const sign = Math.sign(changePct)
      const recent = samples.slice(-6)
      const steps = recent.slice(1).map((sample, index) => Math.sign(sample.price - recent[index].price))
      const alignedSteps = steps.filter((step) => step === sign).length
      if (!steps.length || alignedSteps / steps.length < 0.6) return []
      return [{
        symbol: ticker.symbol,
        short: ticker.short,
        name: ticker.name,
        price: ticker.price,
        changePct,
        direction: sign > 0 ? 'up' as const : 'down' as const,
        score: Math.abs(changePct) * (1 + alignedSteps / steps.length) + Math.min(0.5, Math.log10(ticker.volume24h / 25000) / 10),
      }]
    }).sort((a, b) => b.score - a.score).slice(0, 5)

    setMomentumCandidates(candidates)
    if (now - lastScanBatchAt.current >= 10000) {
      lastScanBatchAt.current = now
      const nextSymbols = candidates.map((candidate) => candidate.symbol)
      const nextDirections = candidates.map((candidate) => candidate.direction)
      setScanSymbols((previous) => previous.join(',') === nextSymbols.join(',') ? previous : nextSymbols)
      setScanDirections((previous) => previous.join(',') === nextDirections.join(',') ? previous : nextDirections)
    }
  }, [tickers])

  async function refreshScanner() {
    setScannerRefreshing(true)
    lastScanBatchAt.current = 0
    await Promise.all([refreshTickers()])
    setScanSymbols([])
    setScanDirections([])
    setTimeout(() => setScannerRefreshing(false), 600)
  }

  async function generateForecast() {
    setForecastFor(activeForecastKey)
    try {
      await trigger({ symbol, interval: timeframe })
    } catch {
      // SWR exposes the failure through forecastError for the visible error state.
    }
  }

  async function refreshEverything() {
    await Promise.all([refreshMarket(), refreshTickers()])
  }

  function selectSymbol(nextSymbol: SymbolKey) {
    setForecastFor('')
    setSymbol(nextSymbol)
  }

  return (
    <main className="trade-app" dir="rtl">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="TradePulse الصفحة الرئيسية">
          <span className="brand-mark"><Activity /></span>
          <span className="brand-name">Trade<span>Pulse</span><small>MARKET INTELLIGENCE</small></span>
        </a>
        <nav className="top-nav" aria-label="التنقل الرئيسي">
          <a className="nav-link nav-link-active" href="#markets">الأسواق</a>
          <a className="nav-link" href="#forecast">توقعات AI</a>
        </nav>
        <div className="top-actions">
          <span className="market-status"><span className="live-dot" /> سوق مباشر</span>
          <button type="button" className="icon-button" onClick={refreshEverything} aria-label="تحديث بيانات السوق" title="تحديث"><RefreshCw /></button>
          <button type="button" className="profile-button" aria-label="الحساب">ع</button>
        </div>
      </header>

      <div className="page-shell" id="top">
        <section className="page-heading">
          <div>
            <p className="eyebrow"><span className="eyebrow-line" /> غرفة الأسواق الرقمية</p>
            <h1>السوق، <span>بوضوح.</span></h1>
            <p className="page-subtitle">عقود USDT الدائمة، رصد حركة لحظية، وتأكيد الشموع قبل عرض أي مستوى مرجعي.</p>
          </div>
          <div className="source-pill"><span className="source-dot" /> عقود دائمة <i /> Bitget · USDT-M</div>
        </section>

        {dashboardError && <div className="error-banner" role="alert"><Zap /> تعذّر تحديث بيانات العقود: {dashboardError.message}<button type="button" onClick={refreshEverything}>إعادة المحاولة</button></div>}

        <section className="layout-grid" aria-label="لوحة تحليل السوق">
          <MarketSidebar tickers={tickers} contracts={contracts} selected={symbol} onSelect={selectSymbol} busy={contractsLoading || tickersLoading} />

          <section className="panel chart-panel" id="markets">
            <div className="instrument-heading">
              <div className="instrument-main">
                <span className={`coin-mark coin-${market?.short.toLowerCase() ?? 'btc'}`}>{market?.short.slice(0, 1) ?? 'B'}</span>
                <div className="instrument-copy">
                  <div className="instrument-name"><h2>{market?.short ?? symbol.slice(0, -4)}<span>/ USDT</span></h2><span className="spot-tag">PERP</span></div>
                  <p>{market?.name ?? symbol.slice(0, -4)} · {timeframeLabels[timeframe]} · فيوتشر</p>
                </div>
              </div>
              <div className="instrument-price">
                <strong>{displayedPrice ? formatUsd(displayedPrice) : '—'}</strong>
                {currentTicker && displayedChange !== undefined && <span className={displayedChange >= 0 ? 'tone-positive' : 'tone-negative'}>{displayedChange >= 0 ? <ArrowUpRight /> : <ArrowDownRight />}{formatChange(displayedChange)} <small>24 ساعة</small></span>}
              </div>
            </div>

            <div className="chart-toolbar">
              <div className="timeframe-switch" role="group" aria-label="الإطار الزمني">
                {timeframes.map((item) => <button key={item} type="button" className={timeframe === item ? 'timeframe-active' : ''} aria-pressed={timeframe === item} onClick={() => { setForecastFor(''); setTimeframe(item) }}>{item}</button>)}
                <button type="button" className="more-frame" aria-label="أطر زمنية أخرى"><ChevronDown /></button>
              </div>
              <div className="chart-legend"><span><i className="legend-up" /> صعود</span><span><i className="legend-down" /> هبوط</span><span className="market-source-label">Bitget Futures · {timeframe}</span></div>
            </div>

            <CandleChart candles={market?.candles ?? []} forecast={currentForecast} loading={marketLoading} />

            <div className="candle-footnote"><span><Clock3 /> الإغلاق خلال <b>{remainingLabel}</b></span><span>آخر تحديث {market ? new Date(market.updatedAt).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}</span></div>

            <div className="pattern-strip">
              <div className="pattern-icon"><Waves /></div>
              <div className="pattern-copy"><small>النمط على آخر شمعة مغلقة</small><b>{indicators?.patterns.join(' · ') ?? 'جارٍ قراءة الشموع'}</b></div>
              <span className={`bias-chip ${bullish ? 'bias-up' : bearish ? 'bias-down' : 'bias-neutral'}`}>{bullish ? <TrendingUp /> : bearish ? <TrendingDown /> : <Activity />}{bullish ? 'ميل صاعد' : bearish ? 'ميل هابط' : 'متوازن'} · {biasScore}</span>
            </div>
          </section>

          <ForecastPanel forecast={currentForecast} loading={marketLoading} error={forecastFor === activeForecastKey ? forecastError : undefined} onGenerate={generateForecast} generating={isMutating} currentPrice={displayedPrice} />

          <LiveScanner
            candidates={momentumCandidates}
            signals={scannerSignals}
            loading={scannerLoading || !tickers}
            totalSymbols={contracts?.length ?? 0}
            onRefresh={refreshScanner}
            refreshing={scannerRefreshing}
            onSelect={selectSymbol}
          />
        </section>

        <footer className="page-footer"><span><ShieldCheck /> تنبيهات احتمالية للمتابعة فقط؛ لا تُنفّذ صفقات ولا تضمن الربح.</span><span>TradePulse · Bitget USDT-M Futures</span></footer>
      </div>
    </main>
  )
}
