export function stripHoiFormatting(value: string): string {
  return value.replaceAll(/§./g, '')
}

export function formatEventLabel(eventId: string, title?: string): string {
  return title ? `${title} (${eventId})` : eventId
}
