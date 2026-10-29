import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ATTACHMENT_LIMIT,
  MAX_ATTACHMENT_BYTES,
  attachmentPrompt,
  formatFileSize,
  selectChatAttachments,
} from '../.tmp-tests/src/lib/chatAttachments.js'

const file = (name, type, size) => ({ name, type, size })

test('keeps supported image and PDF files within the attachment limits', () => {
  const result = selectChatAttachments([], [
    file('diagram.png', 'image/png', 42),
    file('brief.pdf', 'application/pdf', 512),
  ])

  assert.deepEqual(result.files.map(({ name }) => name), ['diagram.png', 'brief.pdf'])
  assert.deepEqual(result.errors, [])
  assert.equal(ATTACHMENT_LIMIT, 10)
  assert.equal(formatFileSize(1536), '1.5 KB')
})

test('rejects unsupported, oversized, and excess attachments without discarding valid files', () => {
  const existing = Array.from({ length: 9 }, (_, index) => file(`image-${index}.jpg`, 'image/jpeg', 1))
  const result = selectChatAttachments(existing, [
    file('report.pdf', 'application/pdf', 1),
    file('notes.txt', 'text/plain', 1),
    file('large.gif', 'image/gif', MAX_ATTACHMENT_BYTES + 1),
    file('overflow.png', 'image/png', 1),
  ])

  assert.equal(result.files.length, 10)
  assert.equal(result.files.at(-1).name, 'report.pdf')
  assert.deepEqual(result.errors, [
    '仅支持 JPEG、PNG、GIF 和 PDF 文件',
    '“large.gif” 超过 10 MB 大小限制',
    '最多可添加 10 个附件',
  ])
})

test('uses a non-empty default prompt only when attachments have no text question', () => {
  assert.equal(attachmentPrompt('  ', [file('brief.pdf', 'application/pdf', 1)]), '请分析这些附件。')
  assert.equal(attachmentPrompt('  总结重点  ', [file('brief.pdf', 'application/pdf', 1)]), '总结重点')
  assert.equal(attachmentPrompt('  ', []), '')
})
