import test from 'node:test'
import assert from 'node:assert/strict'
import { SseParser } from '../.tmp-tests/src/lib/sseParser.js'

test('parses an event split across network chunks', () => {
  const parser = new SseParser()

  assert.deepEqual(parser.push('event: delta\nid: req-1\ndata: {"delta":"你'), [])
  assert.deepEqual(parser.push('好"}\n\n'), [
    { event: 'delta', id: 'req-1', data: '{"delta":"你好"}' },
  ])
})

test('parses multiple events from one chunk and preserves multiline data', () => {
  const parser = new SseParser()

  assert.deepEqual(parser.push('event: start\ndata: {"ok":true}\n\nevent: delta\ndata: first\ndata: second\n\n'), [
    { event: 'start', id: null, data: '{"ok":true}' },
    { event: 'delta', id: null, data: 'first\nsecond' },
  ])
})

test('flushes a final event without a trailing blank line', () => {
  const parser = new SseParser()

  parser.push('event: complete\ndata: done')

  assert.deepEqual(parser.finish(), [
    { event: 'complete', id: null, data: 'done' },
  ])
})
