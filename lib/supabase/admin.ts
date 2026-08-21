import { createClient } from '@supabase/supabase-js'

// שרת-בלבד: קליינט עם service-role key. לעולם לא לייבא מקומפוננטת 'use client'.
// נדרש רק ליצירה/מחיקה של משתמשים ב-auth.users - שאר פעולות הניהול
// עובדות עם ה-client הרגיל דרך RLS.
export function createAdminClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY לא מוגדר - יש להוסיף אותו למשתני הסביבה כדי ליצור/למחוק משתמשים')
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
