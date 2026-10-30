import { describe, it, expect } from 'vitest'
import {
  expectedUnsavedWounds, effectiveSave, pAtLeast, allocateDamage, simulate, seededRng,
} from '../src/engine.js'

const simple = { attacks: 10, hit: 3, wound: 4, save: 5, ap: 0, damage: 1 }

describe('moteur de calcul', () => {
  it('cas simple : ≈ 2,22 blessures non sauvegardées (formule exacte)', () => {
    expect(expectedUnsavedWounds(simple)).toBeCloseTo(20 / 9, 5) // 2,222…
  })

  it('sauvegarde 2+ avec perforation -6 : aucune sauvegarde possible', () => {
    expect(effectiveSave(2, -6)).toBe(7)
    expect(pAtLeast(effectiveSave(2, -6))).toBe(0)
  })

  it('dégâts 3 sur figurines à 2 PV : 1 figurine détruite par blessure (pas de report)', () => {
    const r = allocateDamage(10, 2, 4, () => 3)
    expect(r.killed).toBe(4)
    expect(r.damage).toBe(8)
  })

  it('Monte-Carlo à ±2 % de la formule exacte sur le cas simple', () => {
    const target = { models: 20, woundsPerModel: 1, save: 5, altSave: null }
    const res = simulate(simple, target, {}, 100000, seededRng(42))
    const exact = expectedUnsavedWounds(simple)
    expect(Math.abs(res.meanUnsaved - exact) / exact).toBeLessThan(0.02)
  })
})
