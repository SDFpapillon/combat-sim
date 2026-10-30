import { describe, it, expect } from 'vitest'
import {
  expectedUnsavedWounds, effectiveSave, pAtLeast, allocateDamage, simulate, seededRng,
  woundTarget, parseDice, meanValue,
} from '../src/engine.js'

const simple = { attacks: 10, hit: 3, wound: 4, save: 5, ap: 0, damage: 1 }
const weapon = (o = {}) => ({ count: 1, attacks: 10, hit: 3, strength: 4, ap: 0, damage: 1, ...o })
const target = (o = {}) => ({ models: 20, woundsPerModel: 1, toughness: 4, save: 5, invuln: null, fnp: null, ...o })
const run = (weapons, tgt, ctx = {}, runs = 100000) =>
  simulate({ weapons, hitMod: 0, woundMod: 0, rerollHit: 'none', rerollWound: 'none', ...ctx }, tgt, runs, seededRng(42))
const near = (a, b, tol = 0.02) => expect(Math.abs(a - b) / b).toBeLessThan(tol)

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
    const res = run([weapon()], target())
    near(res.meanUnsaved, expectedUnsavedWounds(simple))
  })
})

describe('règles 11e édition', () => {
  it('Force contre Endurance', () => {
    expect(woundTarget(8, 4)).toBe(2)
    expect(woundTarget(5, 4)).toBe(3)
    expect(woundTarget(4, 4)).toBe(4)
    expect(woundTarget(4, 5)).toBe(5)
    expect(woundTarget(4, 8)).toBe(6)
  })

  it('invulnérable non modifiée par la PA', () => {
    expect(effectiveSave(3, -3, 4)).toBe(4)
    expect(effectiveSave(3, -1, 4)).toBe(4)
    expect(effectiveSave(2, -1, 4)).toBe(3)
  })

  it('couvert : -1 à la CT des tirs, sans effet en mêlée, en Torrent ou avec Ignore le couvert', () => {
    const covered = target({ save: 7, cover: true })
    near(run([weapon()], covered).meanUnsaved, 10 * (3 / 6) * 0.5)
    near(run([weapon({ melee: true })], covered).meanUnsaved, 10 * (4 / 6) * 0.5)
    near(run([weapon({ ignoresCover: true })], covered).meanUnsaved, 10 * (4 / 6) * 0.5)
  })

  it('Lourde (+1 touche) et Lance (+1 blessure)', () => {
    near(run([weapon({ hit: 4, heavy: true })], target({ save: 7 })).meanUnsaved, 10 * (4 / 6) * 0.5)
    near(run([weapon({ lance: true })], target({ save: 7 })).meanUnsaved, 10 * (4 / 6) * (4 / 6))
  })

  it('Explosion 2 : +2 attaques par tranche de 5 figurines', () => {
    // 1 att. + 2 × 2 (cible de 10) = 5 attaques, torrent, blesse 2+, pas de sauvegarde
    const res = run([weapon({ attacks: 1, torrent: true, strength: 8, blast: 2 })], target({ models: 10, save: 7 }))
    near(res.meanUnsaved, 5 * (5 / 6))
  })

  it('expressions de dés', () => {
    expect(parseDice('D6+2')).toEqual({ n: 1, faces: 6, plus: 2 })
    expect(parseDice('2d3')).toEqual({ n: 2, faces: 3, plus: 0 })
    expect(parseDice('D62')).toBeNull()
    expect(parseDice('abc')).toBeNull()
    expect(meanValue('D6+1')).toBe(4.5)
    expect(meanValue('2D6')).toBe(7)
  })

  it('Touches fatales : un 6 blesse automatiquement', () => {
    // 10 att., touche 3+ (6 = 1/6 auto), blesse 6+ (F2 vs E4)… svg impossible
    const res = run([weapon({ strength: 2, lethal: true })], target({ save: 7 }))
    near(res.meanUnsaved, 10 * (1 / 6 + (3 / 6) * (1 / 6)))
  })

  it('Touches soutenues 1 : un 6 donne une touche supplémentaire', () => {
    const res = run([weapon({ sustained: 1 })], target({ save: 7 }))
    near(res.meanUnsaved, 10 * (4 / 6 + 1 / 6) * 0.5)
  })

  it('Blessures dévastatrices : blessures mortelles sur un 6 pour blesser', () => {
    const res = run([weapon({ devastating: true })], target({ save: 2, invuln: 2 }))
    // blessures normales (4,5) sauvegardées sur 2+ (5/6), les 6 passent
    near(res.meanUnsaved, 10 * (4 / 6) * (1 / 6 + (2 / 6) * (1 / 6)))
  })

  it('Insensible à la douleur 5+ retire un tiers des dégâts', () => {
    const res = run([weapon({ damage: 1 })], target({ save: 7, fnp: 5 }))
    near(res.meanDamage, 10 * (4 / 6) * 0.5 * (4 / 6))
  })

  it('les dégâts se cumulent entre armes sur la même figurine blessée', () => {
    // deux armes : 1 touche auto, blesse sur 2+, pas de sauvegarde, 1 dégât ; cible 1 figurine à 2 PV
    const sure = weapon({ attacks: 1, torrent: true, strength: 10, ap: -6, damage: 1 })
    const res = run([sure, sure], target({ models: 1, woundsPerModel: 2, toughness: 1 }))
    near(res.pWipe, 25 / 36)
  })
})
