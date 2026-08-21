'use client'

import { createContext, useContext } from 'react'

export type Role = 'admin' | 'user' | null

type ProfileContextValue = { role: Role; name: string | null }

const ProfileContext = createContext<ProfileContextValue>({ role: null, name: null })

export function RoleProvider({ role, name, children }: { role: Role; name: string | null; children: React.ReactNode }) {
  return <ProfileContext.Provider value={{ role, name }}>{children}</ProfileContext.Provider>
}

export function useRole() {
  return useContext(ProfileContext).role
}

export function useIsAdmin() {
  return useContext(ProfileContext).role === 'admin'
}

export function useDisplayName() {
  return useContext(ProfileContext).name
}
