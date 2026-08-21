'use client'

import { createContext, useContext } from 'react'

export type Role = 'admin' | 'user' | null

const RoleContext = createContext<Role>(null)

export function RoleProvider({ role, children }: { role: Role; children: React.ReactNode }) {
  return <RoleContext.Provider value={role}>{children}</RoleContext.Provider>
}

export function useRole() {
  return useContext(RoleContext)
}

export function useIsAdmin() {
  return useContext(RoleContext) === 'admin'
}
