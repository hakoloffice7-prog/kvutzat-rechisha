export function OrderNumber({
  orderNumber,
  className = '',
}: {
  orderNumber?: number | null
  className?: string
}) {
  if (orderNumber == null) return null
  return (
    <span className={`text-xs text-gray-500 tabular-nums ${className}`} dir="ltr">
      #{orderNumber}
    </span>
  )
}
