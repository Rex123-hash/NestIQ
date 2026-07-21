// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getRecent, pushRecent } from './recent.js'

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('recent question ordering', () => {
  it('normalizes older stored history to newest first', () => {
    localStorage.setItem('nestiq_recent_q', JSON.stringify([
      { id: 1, at: 100, q: 'Oldest' },
      { id: 3, at: 300, q: 'Newest' },
      { id: 2, at: 200, q: 'Second newest' },
    ]))
    expect(getRecent().map((item) => item.q)).toEqual(['Newest', 'Second newest', 'Oldest'])
  })

  it('moves a repeated question back to the top with a fresh timestamp', () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(100).mockReturnValueOnce(100)
    pushRecent('First question')
    vi.spyOn(Date, 'now').mockReturnValueOnce(200).mockReturnValueOnce(200)
    pushRecent('Second question')
    vi.spyOn(Date, 'now').mockReturnValueOnce(300).mockReturnValueOnce(300)
    pushRecent('First question')
    expect(getRecent().map((item) => item.q)).toEqual(['First question', 'Second question'])
  })
})
