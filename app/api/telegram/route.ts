import { NextResponse } from 'next/server'

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '9055457414:AAEw-cvr2yomOvBFhsIuMSqQgqN8TmDUFUY'
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '6281055314'

export async function POST(request: Request) {
  let body: { text?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const text = (body.text ?? '').trim()
  if (!text) {
    return NextResponse.json({ error: 'Message text is required.' }, { status: 400 })
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    })
    const payload = await response.json()
    if (!response.ok || !payload.ok) {
      return NextResponse.json({ error: payload.description || 'Telegram API error.' }, { status: 502 })
    }
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed to reach Telegram API.' }, { status: 502 })
  }
}
