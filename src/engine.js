// Moteur de calcul du simulateur — aucune dépendance, testable isolément.

/** Probabilité qu'un D6 fasse >= seuil. Un 1 rate toujours ; seuil > 6 = impossible. */
export function pAtLeast(threshold) {
  const t = Math.max(2, threshold) // le 1 rate toujours
  if (t > 6) return 0
  return (7 - t) / 6
}

/** Sauvegarde effective : seuil + perforation (perforation <= 0), plafonnée à 7 (impossible).
 *  La sauvegarde alternative, si elle existe, n'est pas modifiée ; on garde la meilleure. */
export function effectiveSave(save, ap = 0, altSave = null) {
  const modified = Math.min(7, save - ap)
  if (altSave == null) return modified
  return Math.min(modified, altSave)
}

/** Espérance exacte des blessures non sauvegardées (profil sans options, attaques fixes). */
export function expectedUnsavedWounds({ attacks, hit, wound, save, ap = 0, altSave = null }) {
  const ps = pAtLeast(effectiveSave(save, ap, altSave))
  return attacks * pAtLeast(hit) * pAtLeast(wound) * (1 - ps)
}

/** Valeur de dé : nombre fixe, ou 'D3', 'D6', '2D6'. */
export function rollValue(spec, rng) {
  if (typeof spec === 'number') return spec
  const d6 = () => 1 + Math.floor(rng() * 6)
  switch (spec) {
    case 'D3': return Math.ceil(d6() / 2)
    case 'D6': return d6()
    case '2D6': return d6() + d6()
    default: return Number(spec) || 0
  }
}

/** Valeur moyenne d'une spécification de dé (pour l'affichage). */
export function meanValue(spec) {
  if (typeof spec === 'number') return spec
  return { D3: 2, D6: 3.5, '2D6': 7 }[spec] ?? (Number(spec) || 0)
}

/** Applique des blessures non sauvegardées à une unité, figurine par figurine.
 *  Les dégâts en excès sur une figurine sont perdus.
 *  @returns {{ killed:number, damage:number }} damage = PV réellement retirés */
export function allocateDamage(models, woundsPerModel, unsaved, damageOf) {
  let current = woundsPerModel
  let killed = 0
  let damage = 0
  for (let i = 0; i < unsaved && killed < models; i++) {
    const d = damageOf()
    const dealt = Math.min(d, current)
    damage += dealt
    current -= dealt
    if (current === 0) {
      killed++
      current = woundsPerModel
    }
  }
  return { killed, damage }
}

/** Générateur pseudo-aléatoire reproductible (mulberry32). */
export function seededRng(seed = 1) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Une résolution complète d'attaque. */
export function simulateOnce(attacker, target, options, rng) {
  const d6 = () => 1 + Math.floor(rng() * 6)
  const saveT = effectiveSave(target.save, attacker.ap, target.altSave)

  const nAttacks = rollValue(attacker.attacks, rng)
  let hits = 0
  let autoWounds = 0
  for (let i = 0; i < nAttacks; i++) {
    let r = d6()
    if (r === 1 && options.rerollHitOnes) r = d6()
    if (r === 6 && options.sixAutoWounds) {
      autoWounds++
    } else if (r !== 1 && r >= attacker.hit) {
      hits++
    }
    if (r === 6 && options.sixExtraHit) hits++
  }

  let wounds = autoWounds
  for (let i = 0; i < hits; i++) {
    let r = d6()
    const ok = (x) => x !== 1 && x >= attacker.wound
    if (!ok(r) && options.rerollFailedWounds) r = d6()
    if (ok(r)) wounds++
  }

  let unsaved = 0
  for (let i = 0; i < wounds; i++) {
    const r = d6()
    if (saveT > 6 || r === 1 || r < saveT) unsaved++
  }

  const { killed, damage } = allocateDamage(
    target.models, target.woundsPerModel, unsaved, () => rollValue(attacker.damage, rng)
  )
  return { unsaved, killed, damage }
}

/** Simulation Monte-Carlo. */
export function simulate(attacker, target, options = {}, runs = 10000, rng = Math.random) {
  const histogram = new Array(target.models + 1).fill(0)
  let sumUnsaved = 0, sumKilled = 0, sumDamage = 0
  for (let i = 0; i < runs; i++) {
    const r = simulateOnce(attacker, target, options, rng)
    sumUnsaved += r.unsaved
    sumKilled += r.killed
    sumDamage += r.damage
    histogram[r.killed]++
  }
  return {
    runs,
    meanUnsaved: sumUnsaved / runs,
    meanKilled: sumKilled / runs,
    meanDamage: sumDamage / runs,
    pWipe: histogram[target.models] / runs,
    histogram: histogram.map((c) => c / runs),
  }
}
