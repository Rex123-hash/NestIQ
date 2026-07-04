// Tiny classNames joiner (industry-standard helper, no dependency needed).
export function cn(...parts) {
  return parts.filter(Boolean).join(' ')
}
