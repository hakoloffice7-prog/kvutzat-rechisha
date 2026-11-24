// נוסחי ההודעות הקוליות: ברירות מחדל, שדות דינמיים והחלפתם בערכים אמיתיים.
// קובץ משותף לשרת (שליחה) ולדפדפן (מסך עריכה + תצוגה מקדימה) - בלי תלויות.
import type { SupabaseClient } from '@supabase/supabase-js'

export type VoiceTemplateKey = 'purchase' | 'measurement_reminder' | 'installation_reminder'

export type VoiceVar = { name: string; description: string; sample: string }

const OUTRO = 'נא לוודא שיש מי שנמצא בבית. אם יש שינוי או שאלה, אפשר לחזור אלינו. בברכה, קבוצת הכל.'

const VAR_NAME: VoiceVar = { name: 'שם', description: 'שם הדייר', sample: 'ישראל ישראלי' }
const VAR_CATEGORY: VoiceVar = { name: 'קטגוריה', description: 'שם הקטגוריה / המוצר', sample: 'סורגים' }
const VAR_ORDER_NUMBER: VoiceVar = { name: 'מספר_הזמנה', description: 'מספר ההזמנה', sample: '1234' }
const VAR_WHEN: VoiceVar = { name: 'מתי', description: '"מחר" או "ביום <יום>"', sample: 'מחר' }
const VAR_TIME: VoiceVar = { name: 'שעה', description: 'טווח השעות (ריק אם לא הוגדרה שעה)', sample: 'בין השעות 10:00 ל-12:00' }

export const VOICE_TEMPLATES: Record<VoiceTemplateKey, {
  title: string
  description: string
  defaultText: string
  vars: VoiceVar[]
}> = {
  purchase: {
    title: 'הודעת רכישה',
    description: 'נשלחת ללקוח כשנפתחת הזמנה חדשה בסטטוס "מעוניין"',
    defaultText:
      'שלום {שם}. מדברים מקבוצת הכל. ' +
      'הזמנתך בתחום {קטגוריה}, מספר {מספר_הזמנה}, התקבלה אצלנו בהצלחה. ' +
      'נעדכן אותך בהמשך על התקדמות ההזמנה. תודה ויום טוב.',
    vars: [VAR_NAME, VAR_CATEGORY, VAR_ORDER_NUMBER],
  },
  measurement_reminder: {
    title: 'תזכורת למדידה',
    description: 'נשלחת יום לפני המדידה',
    defaultText:
      `שלום {שם}. מדברים מקבוצת הכל. זוהי תזכורת ש{מתי} מגיע אליכם בעל מקצוע לביצוע מדידות של {קטגוריה} {שעה}. ${OUTRO}`,
    vars: [VAR_NAME, VAR_CATEGORY, VAR_WHEN, VAR_TIME],
  },
  installation_reminder: {
    title: 'תזכורת להתקנה / אספקה',
    description: 'נשלחת יום לפני ההתקנה',
    defaultText:
      `שלום {שם}. מדברים מקבוצת הכל. זוהי תזכורת ש{מתי} מגיע אליכם בעל מקצוע מטעמנו לביצוע {קטגוריה} {שעה}. ${OUTRO}`,
    vars: [VAR_NAME, VAR_CATEGORY, VAR_WHEN, VAR_TIME],
  },
}

export const VOICE_TEMPLATE_KEYS = Object.keys(VOICE_TEMPLATES) as VoiceTemplateKey[]

const PLACEHOLDER_RE = /\{([^{}]+)\}/g

// שדות שמופיעים בנוסח ואינם מוכרים להודעה הזו (לבדיקה בשמירה)
export function unknownPlaceholders(key: VoiceTemplateKey, text: string): string[] {
  const allowed = new Set(VOICE_TEMPLATES[key].vars.map((v) => v.name))
  const found: string[] = []
  text.replace(PLACEHOLDER_RE, (_, raw: string) => {
    const name = raw.trim()
    if (!allowed.has(name) && !found.includes(name)) found.push(name)
    return ''
  })
  return found
}

// מחליף שדות בערכים ומנקה רווחים כפולים / רווח לפני פיסוק (למשל כשאין שעה)
export function renderVoiceText(text: string, values: Record<string, string>): string {
  return text
    .replace(PLACEHOLDER_RE, (_, name: string) => values[name.trim()] ?? '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([.,!?])/g, '$1')
    .trim()
}

export function sampleValues(key: VoiceTemplateKey): Record<string, string> {
  return Object.fromEntries(VOICE_TEMPLATES[key].vars.map((v) => [v.name, v.sample]))
}

// טוען את הנוסח השמור; כל תקלה (טבלה חסרה, ריק, שדה לא מוכר) חוזרת לנוסח ברירת המחדל
// כדי ששליחת ההודעות לעולם לא תיעצר בגלל הגדרה.
export async function loadVoiceTemplate(client: SupabaseClient, key: VoiceTemplateKey): Promise<string> {
  const fallback = VOICE_TEMPLATES[key].defaultText
  try {
    const { data, error } = await client.from('voice_templates').select('body').eq('key', key).maybeSingle()
    const body = (data?.body as string | undefined)?.trim()
    if (error || !body) return fallback
    if (unknownPlaceholders(key, body).length > 0) return fallback
    return body
  } catch {
    return fallback
  }
}
