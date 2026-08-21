'use server'

import { createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// מחזיר גם את ה-client הרגיל (session של המנהל המחובר) - כל כתיבה/קריאה
// שנעשית איתו כפופה ל-RLS הרגיל, שכבר מרשה למנהל לראות/לערוך הכל.
// רק פעולות על auth.users עצמה (יצירה/מחיקה של משתמש) חייבות client
// נפרד עם service-role key - זו הגבלה של Supabase Auth, לא קשורה
// ל-profiles.role שלנו.
async function requireAdmin() {
  const supabase = createServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('לא מחובר')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single()

  if (profile?.role !== 'admin') throw new Error('פעולה זו מותרת למנהלים בלבד')

  return { userId: session.user.id, supabase }
}

export async function listUsersWithAccess() {
  const { supabase } = await requireAdmin()

  const { data, error } = await supabase
    .from('profiles')
    .select(`
      id, email, full_name, role, created_at,
      user_city_access ( city_id, cities ( id, name ) ),
      user_project_access ( project_id, projects ( id, name, city_id ) )
    `)
    .order('created_at')

  if (error) throw new Error(error.message)
  return data as any[]
}

// יצירת משתמש חדש ב-auth.users דורשת service-role key - הגבלה של Supabase
// עצמו, לא של המערכת שלנו. שאר הפעולות בהמשך משתמשות באותו client מטעמי
// נוחות (אין נזק בכך, וזה נמנע מתלות בתזמון בין ה-clients).
export async function createUser(input: {
  email: string
  password: string
  fullName: string
  role: 'admin' | 'user'
  cityIds: string[]
  projectIds: string[]
}) {
  await requireAdmin()
  const admin = createAdminClient()

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.fullName.trim() || null },
  })
  if (createError || !created.user) {
    throw new Error(createError?.message || 'יצירת המשתמש נכשלה')
  }

  const userId = created.user.id

  if (input.role === 'admin') {
    const { error: roleError } = await admin
      .from('profiles')
      .update({ role: 'admin' })
      .eq('id', userId)
    if (roleError) throw new Error(roleError.message)
  }

  if (input.cityIds.length > 0) {
    const { error } = await admin
      .from('user_city_access')
      .insert(input.cityIds.map((city_id) => ({ user_id: userId, city_id })))
    if (error) throw new Error(error.message)
  }

  if (input.projectIds.length > 0) {
    const { error } = await admin
      .from('user_project_access')
      .insert(input.projectIds.map((project_id) => ({ user_id: userId, project_id })))
    if (error) throw new Error(error.message)
  }

  return { id: userId }
}

export async function updateUserRole(userId: string, role: 'admin' | 'user') {
  const { supabase } = await requireAdmin()

  const { error } = await supabase.from('profiles').update({ role }).eq('id', userId)
  if (error) throw new Error(error.message)
}

export async function updateUserFullName(userId: string, fullName: string) {
  const { supabase } = await requireAdmin()

  const { error } = await supabase.from('profiles').update({ full_name: fullName.trim() || null }).eq('id', userId)
  if (error) throw new Error(error.message)
}

export async function updateUserAssignments(userId: string, cityIds: string[], projectIds: string[]) {
  const { supabase } = await requireAdmin()

  const { error: delCitiesError } = await supabase.from('user_city_access').delete().eq('user_id', userId)
  if (delCitiesError) throw new Error(delCitiesError.message)

  const { error: delProjectsError } = await supabase.from('user_project_access').delete().eq('user_id', userId)
  if (delProjectsError) throw new Error(delProjectsError.message)

  if (cityIds.length > 0) {
    const { error } = await supabase
      .from('user_city_access')
      .insert(cityIds.map((city_id) => ({ user_id: userId, city_id })))
    if (error) throw new Error(error.message)
  }

  if (projectIds.length > 0) {
    const { error } = await supabase
      .from('user_project_access')
      .insert(projectIds.map((project_id) => ({ user_id: userId, project_id })))
    if (error) throw new Error(error.message)
  }
}

// מחיקת משתמש מ-auth.users דורשת service-role key, מאותה סיבה כמו יצירה.
export async function deleteUser(userId: string) {
  const { userId: callerId } = await requireAdmin()
  if (userId === callerId) throw new Error('לא ניתן למחוק את המשתמש המחובר')

  const admin = createAdminClient()
  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) throw new Error(error.message)
}
