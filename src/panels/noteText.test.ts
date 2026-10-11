import { describe, expect, it } from 'vitest'
import { toggleTask } from './noteText'

describe('note tasks', () => {
  const note = '# Tirana\n- [ ] Book the bus\n- [x] SIM card\n1. [ ] Bunk\'Art\n\nNot a task: [ ] here'
  const at = (s: string) => note.indexOf(s)

  it('ticks and unticks the task whose list item starts there, leaving the rest of the note alone', () => {
    expect(toggleTask(note, at('- [ ] Book'))).toBe(note.replace('- [ ] Book', '- [x] Book'))
    expect(toggleTask(note, at('- [x] SIM'))).toBe(note.replace('- [x] SIM', '- [ ] SIM'))
    expect(toggleTask(note, at('1. [ ]'))).toBe(note.replace('1. [ ] Bunk', '1. [x] Bunk'))
    expect(toggleTask(note, at('Not a task'))).toBe(note)
    expect(toggleTask(note, 0)).toBe(note)
  })
})
