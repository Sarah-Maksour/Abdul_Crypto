'use client'

import { ArrowDownRight, ArrowUpRight, RefreshCw, ShieldAlert, Sparkles, TrendingDown, TrendingUp } from 'lucide-react'

export type MomentumCandidate = {
  symbol: string
  short: string
  name: string
  price: number
  changePct: number
  direction: 'up' | 'down'
  score: number
}

export type FuturesSignal = {
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

function price(value: number) {
  const digits = value >= 1000 ? 2 : value >= 1 ? 3 : 7
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: digits }).format(value)
}

export default function LiveScanner({
  candidates,
  signals,
  loading,
  totalSymbols,
  onRefresh,
  refreshing,
  onSelect,
}: {
  candidates: MomentumCandidate[]
  signals?: FuturesSignal[]
  loading: boolean
  totalSymbols: number
  onRefresh: () => void
  refreshing: boolean
  onSelect: (symbol: string) => void
}) {
  const signalMap = new Map((signals ?? []).map((signal) => [signal.symbol, signal]))

  return (
    <section className="panel live-scanner-panel" id="radar">
      <div className="panel-heading scanner-heading">
        <div>
          <p className="eyebrow">رادار العقود الدائمة</p>
          <h2><Sparkles /> فرص قيد التشكّل</h2>
        </div>
        <div className="scanner-actions">
          <span className="radar-live"><span className="live-dot" /> فحص كل 10 ثوانٍ</span>
          <button type="button" className="notification-button" onClick={onRefresh} disabled={refreshing}>
            {refreshing ? <span className="spinner" /> : <RefreshCw />}
            {refreshing ? 'جارٍ التحديث' : 'تحديث'}
          </button>
        </div>
      </div>

      <div className="scanner-summary">
        <span><b>{totalSymbols.toLocaleString('en-US')}</b> عقد USDT دائم تحت المراقبة</span>
        <span>السعر كل 10 ثوانٍ · تأكيد شموع أعلى 5 مرشحين كل 10 ثوانٍ</span>
      </div>

      {candidates.length === 0 ? (
        <div className="scanner-empty" aria-live="polite">
          {loading ? <span className="spinner" /> : <ShieldAlert />}
          <span>{loading ? 'جارٍ جمع قراءات الحركة...' : 'لا توجد حركة سريعة مؤكدة الآن. الرادار يواصل الفحص.'}</span>
        </div>
      ) : (
        <div className="scanner-grid" aria-live="polite">
          {candidates.map((candidate) => {
            const signal = signalMap.get(candidate.symbol)
            const confirmed = signal?.confirmed ?? false
            const rising = candidate.direction === 'up'
            return (
              <button className={`scanner-card ${confirmed ? rising ? 'scanner-up-confirmed' : 'scanner-down-confirmed' : ''}`} key={candidate.symbol} type="button" onClick={() => onSelect(candidate.symbol)}>
                <span className={`scanner-direction ${rising ? 'tone-positive' : 'tone-negative'}`}>
                  {rising ? <TrendingUp /> : <TrendingDown />}
                  {confirmed ? rising ? 'تأكيد صعود' : 'تأكيد هبوط' : rising ? 'زخم صاعد' : 'زخم هابط'}
                </span>
                <span className="scanner-contract"><b>{candidate.symbol}</b><small>{candidate.name}</small></span>
                <span className={`scanner-change ${rising ? 'tone-positive' : 'tone-negative'}`}>
                  {rising ? <ArrowUpRight /> : <ArrowDownRight />}{candidate.changePct > 0 ? '+' : ''}{candidate.changePct.toFixed(2)}% <small>خلال ثوانٍ</small>
                </span>
                {signal?.available && <span className="scanner-pattern">{signal.patterns.join(' · ')}</span>}
                {signal && signal.available && signal.confirmed && signal.entry !== null && signal.target !== null && signal.stop !== null ? (
                  <span className="scanner-levels">
                    <span>دخول مرجعي <b>${price(signal.entry)}</b></span>
                    <span>هدف مبدئي <b>${price(signal.target)}</b></span>
                    <span>وقف تقديري <b>${price(signal.stop)}</b></span>
                  </span>
                ) : (
                  <span className="scanner-waiting">{!signal ? 'جارٍ فحص نمط الشمعة والمؤشرات...' : !signal.available ? 'تعذّر جلب الشموع لهذا العقد؛ أعد الفحص لاحقاً.' : 'لم تتوافق الشمعة والمؤشرات والحجم بعد — مراقبة فقط'}</span>
                )}
                {signal?.available && <span className="scanner-confidence">توافق فني {signal.confidence}% · حجم {signal.volumeRatio.toFixed(1)}×</span>}
              </button>
            )
          })}
        </div>
      )}

      <p className="scanner-disclaimer">المستويات المرجعية تُحسب من ATR للشمعة ومؤشرات العقد. لا تُرسل أوامر تداول ولا تضمن الربح؛ تحقّق من السيولة والانزلاق قبل أي قرار.</p>
    </section>
  )
}
