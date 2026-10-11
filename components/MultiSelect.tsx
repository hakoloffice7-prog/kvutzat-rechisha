'use client'

import { useState, useEffect, useRef } from 'react'
import { ChevronDown } from 'lucide-react'
import { Label } from '@/components/ui/label'

export function MultiSelect({
  label, options, selected, onChange, emptyLabel, pluralLabel, clearLabel, disabled,
}: {
  label: string
  options: { value: string; label: string }[]
  selected: string[]
  onChange: (values: string[]) => void
  emptyLabel: string
  pluralLabel: string
  clearLabel: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const toggle = (value: string) =>
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value])

  return (
    <div className="space-y-2" ref={ref}>
      <Label>{label}</Label>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={disabled}
          className="disabled:bg-gray-100 disabled:cursor-not-allowed w-full flex items-center justify-between border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <span className="truncate">
            {selected.length === 0
              ? emptyLabel
              : selected.length === 1
                ? options.find((o) => o.value === selected[0])?.label
                : `${selected.length} ${pluralLabel} נבחרו`}
          </span>
          <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
        </button>
        {open && !disabled && (
          <div className="absolute z-10 mt-1 w-full max-h-64 overflow-y-auto bg-white border border-gray-300 rounded-md shadow-lg py-1">
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full text-right px-3 py-1.5 text-sm hover:bg-gray-50 text-blue-600"
            >
              {clearLabel}
            </button>
            {options.map((opt) => (
              <label key={opt.value} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.includes(opt.value)}
                  onChange={() => toggle(opt.value)}
                  className="h-4 w-4"
                />
                {opt.label}
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
