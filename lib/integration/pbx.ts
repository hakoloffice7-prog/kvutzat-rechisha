// שרת-בלבד: אינטגרציה עם מרכזיית Technoline (api.tlivr.com).
// כל הקריאות מחזירות HTTP 200 גם בשגיאה - הסטטוס האמיתי בשדה status בגוף התשובה.

function apiKey() {
  const key = process.env.PBX_API_KEY
  if (!key) throw new Error('PBX_API_KEY לא מוגדר')
  return key
}

// campaignRun דורש IP מאושר; התמיכה אישרה את מספר המערכת שלנו באופן גורף (אין צורך ב-IP קבוע)
function baseUrl(file: 'ivrFilesApi.php' | 'campaignApi.php') {
  const base = (process.env.PBX_API_BASE_URL || 'https://api.tlivr.com').replace(/\/+$/, '')
  return `${base}/${file}`
}

type PbxResponse = { status?: string; errorCode?: number | string; note?: string; [k: string]: unknown }

async function call(file: 'ivrFilesApi.php' | 'campaignApi.php', body: Record<string, unknown>): Promise<PbxResponse> {
  const res = await fetch(baseUrl(file), {
    method: 'POST',
    // התמיכה ממליצה על הכותרת X-Api-Key; גם בגוף, כי התיעוד מגדיר את apiKey כפרמטר חובה
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey() },
    body: JSON.stringify({ ...body, apiKey: apiKey() }),
    signal: AbortSignal.timeout(15000),
  })
  const json = (await res.json().catch(() => null)) as PbxResponse | null
  if (!json) throw new Error(`המרכזיה החזירה תשובה לא קריאית (HTTP ${res.status})`)
  if (String(json.status).toLowerCase() !== 'ok') {
    throw new Error(`${json.note || 'שגיאה מהמרכזיה'} (קוד ${json.errorCode ?? '?'})`)
  }
  return json
}

// מספר ישראלי בלבד; המרכזיה מנרמלת פורמטים, אנחנו רק מנקים תווים ובודקים שזה נראה כמו טלפון
export function normalizePhone(raw: string): string | null {
  let d = raw.replace(/\D/g, '')
  if (d.startsWith('972')) d = '0' + d.slice(3)
  return /^0\d{8,9}$/.test(d) ? d : null
}

// Click2call: המרכזיה מצלצלת קודם לשלוחת הסוכן ואז מחברת ללקוח.
export async function clickToCall(target: string, targetName?: string, extension?: string) {
  const ext = extension || process.env.PBX_AGENT_EXTENSION
  if (!ext) throw new Error('PBX_AGENT_EXTENSION לא מוגדר')
  const json = await call('ivrFilesApi.php', {
    action: 'click2call',
    extension: ext,
    target,
    ...(targetName ? { targetName } : {}),
    ...(process.env.PBX_CALLER_ID ? { callerId: process.env.PBX_CALLER_ID } : {}),
  })
  return { callId: json.callId as string | undefined }
}

// הודעה קולית (TTS) ללקוח בודד - קמפיין עם נמען אחד.
export async function sendVoiceMessage(phone: string, text: string, ref: string) {
  const json = await call('campaignApi.php', {
    action: 'campaignRun',
    phones: [phone],
    audioText: text,
    title: `הזמנה ${ref}`.slice(0, 50),
    externalID: ref.slice(0, 50),
    dialRetries: 2,
    betweenRetries: 20,
    reasonableHours: 'yes', // לא מחייג בין 23:00 ל-08:00
  })
  return { campaignId: json.campaignId as string | undefined }
}
