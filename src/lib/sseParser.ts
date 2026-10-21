export interface SseEvent {
  event: string
  id: string | null
  data: string
}

export class SseParser {
  private buffer = ''
  private eventName: string | null = null
  private eventId: string | null = null
  private dataLines: string[] = []

  push(chunk: string): SseEvent[] {
    this.buffer += chunk
    const events: SseEvent[] = []
    let newlineIndex = this.buffer.indexOf('\n')

    while (newlineIndex >= 0) {
      const line = this.buffer.slice(0, newlineIndex).replace(/\r$/, '')
      this.buffer = this.buffer.slice(newlineIndex + 1)
      const event = this.consumeLine(line)
      if (event) events.push(event)
      newlineIndex = this.buffer.indexOf('\n')
    }

    return events
  }

  finish(): SseEvent[] {
    const events = this.push(this.buffer ? '\n' : '')
    const finalEvent = this.flushEvent()
    return finalEvent ? [...events, finalEvent] : events
  }

  private consumeLine(line: string): SseEvent | null {
    if (line === '') return this.flushEvent()
    if (line.startsWith(':')) return null

    const separator = line.indexOf(':')
    const field = separator >= 0 ? line.slice(0, separator) : line
    const value = separator >= 0 ? line.slice(separator + 1).replace(/^ /, '') : ''

    if (field === 'event') this.eventName = value
    if (field === 'id') this.eventId = value
    if (field === 'data') this.dataLines.push(value)
    return null
  }

  private flushEvent(): SseEvent | null {
    if (!this.eventName && !this.eventId && this.dataLines.length === 0) return null
    const event: SseEvent = {
      event: this.eventName ?? 'message',
      id: this.eventId,
      data: this.dataLines.join('\n'),
    }
    this.eventName = null
    this.eventId = null
    this.dataLines = []
    return event
  }
}
