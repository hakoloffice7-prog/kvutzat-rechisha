export const dynamic = 'force-dynamic'

import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { listUsersWithAccess } from './actions'
import UsersManager from './UsersManager'

export default async function AdminUsersPage() {
  const supabase = createServerClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single()

  if (profile?.role !== 'admin') {
    redirect('/dashboard')
  }

  const [users, { data: cities }] = await Promise.all([
    listUsersWithAccess(),
    supabase.from('cities').select('id, name, projects(id, name)').order('name'),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">ניהול משתמשים</h1>
        <p className="text-gray-500 mt-1">יצירת משתמשים, קביעת תפקיד ושיוך לערים/פרויקטים</p>
      </div>

      <UsersManager initialUsers={users || []} cities={cities || []} currentUserId={session.user.id} />
    </div>
  )
}
