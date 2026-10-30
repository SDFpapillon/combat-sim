// Moteur de calcul du simulateur — aucune dépendance, testable isolément.
// Règles de la 11e édition : Force contre Endurance, touches/blessures critiques,
// sauvegarde invulnérable, couvert (-1 CT), Insensible à la douleur, mots-clés d'armes.

/** Probabilité qu'un D6 fasse >= seuil. Un 1 rate toujours ; seuil > 6 = impossible. */
export function pAtLeast(threshold) {
  const t = Math.max(2, threshold) // le 1 rate toujours
  if (t > 6) return 0
  return (7 - t) / 6
}

/** Seuil pour blesser selon la Force de l'arme et l'Endurance de la cible. */
export function woundTarget(strength, toughness) {
  if (strength >= 2 * toughness) return 2
  if (strength > toughness) return 3
  if (strength === toughness) return 4
  if (2 * strength <= toughness) return 6
  return 5
}

/** Sauvegarde effective : armure modifiée par la PA (ap <= 0),
 *  invulnérable non modifiable ; on garde la meilleure. 7 = impossible.
 *  (En 11e édition le couvert ne touche plus la sauvegarde : il dégrade la CT.) */
export function effectiveSave(save, ap = 0, invuln = null) {
  const armour = Math.min(7, Math.max(2, save - ap))
  if (invuln == null) return armour
  return Math.min(armour, invuln)
}

/** Espérance exacte des blessures non sauvegardées (profil sans mot-clé, attaques fixes).
 *  `wound` peut être donné directement, sinon il est déduit de strength/toughness. */
export function expectedUnsavedWounds({ attacks, hit, wound, strength, toughness, save, ap = 0, invuln = null }) {
  const w = wound ?? woundTarget(strength, toughness)
  const ps = pAtLeast(effectiveSave(save, ap, invuln))
  return attacks * pAtLeast(hit) * pAtLeast(w) * (1 - ps)
}

const DICE_RE = /^\s*(?:(\d*)\s*[dD]\s*(3|6))?\s*(?:([+-]?)\s*(\d+))?\s*$/

/** Analyse une valeur de dé : 3, '3', 'D6', '2D6', 'D3+1', 'D6+2'…
 *  @returns {{ n:number, faces:number, plus:number } | null} */
export function parseDice(spec) {
  if (typeof spec === 'number') return Number.isFinite(spec) ? { n: 0, faces: 0, plus: spec } : null
  const m = DICE_RE.exec(String(spec ?? ''))
  if (!m || (!m[2] && !m[4])) return null
  const n = m[2] ? (m[1] ? Number(m[1]) : 1) : 0
  const plus = m[4] ? Number(m[4]) * (m[3] === '-' ? -1 : 1) : 0
  if (!m[2] && m[3] === '-') return null
  if (m[2] && m[4] && !m[3]) return null // 'D62' n'est pas 'D6+2'
  if (n > 10) return null
  return { n, faces: m[2] ? Number(m[2]) : 0, plus }
}

const parsed = new Map()
function dice(spec) {
  if (!parsed.has(spec)) parsed.set(spec, parseDice(spec) ?? { n: 0, faces: 0, plus: 0 })
  return parsed.get(spec)
}

/** Tire une valeur de dé (nombre fixe ou expression 'D3+1'…), jamais négative. */
export function rollValue(spec, rng) {
  if (typeof spec === 'number') return spec
  const { n, faces, plus } = dice(spec)
  let total = plus
  for (let i = 0; i < n; i++) total += 1 + Math.floor(rng() * faces)
  return Math.max(0, total)
}

/** Valeur moyenne d'une expression de dé (pour l'affichage). */
export function meanValue(spec) {
  if (typeof spec === 'number') return spec
  const { n, faces, plus } = dice(spec)
  return n * (faces + 1) / 2 + plus
}

/** Pool de PV d'une unité : les dégâts s'appliquent figurine par figurine et
 *  l'excès sur une figurine est perdu. La figurine blessée reste la première ciblée. */
export function createPool(models, woundsPerModel) {
  let alive = models
  let current = woundsPerModel
  return {
    get alive() { return alive },
    /** Applique `d` dégâts ; renvoie les PV réellement retirés. */
    apply(d) {
      if (alive === 0 || d <= 0) return 0
      const dealt = Math.min(d, current)
      current -= dealt
      if (current === 0) {
        alive--
        current = woundsPerModel
      }
      return dealt
    },
  }
}

/** Applique des blessures non sauvegardées à une unité (sans report des dégâts en excès).
 *  @returns {{ killed:number, damage:number }} damage = PV réellement retirés */
export function allocateDamage(models, woundsPerModel, unsaved, damageOf) {
  const pool = createPool(models, woundsPerModel)
  let damage = 0
  for (let i = 0; i < unsaved && pool.alive > 0; i++) damage += pool.apply(damageOf())
  return { killed: models - pool.alive, damage }
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

const clamp1 = (v) => Math.max(-1, Math.min(1, v || 0))

/** Seuil pour toucher d'une arme : le couvert dégrade la CT de 1 contre les tirs
 *  (sauf Torrent, Ignore le couvert et armes de mêlée). */
export function hitTarget(weapon, target) {
  const cover = target.cover && !weapon.melee && !weapon.ignoresCover && !weapon.torrent
  return weapon.hit + (cover ? 1 : 0)
}

/** Relance d'un dé selon le mode : 'none', 'ones' (relancer les 1) ou 'all' (relancer les échecs). */
function reroll(r, ok, mode, d6) {
  if (mode === 'ones' && r === 1) return d6()
  if (mode === 'all' && !ok(r)) return d6()
  return r
}

/**
 * Une résolution complète d'attaque.
 *
 * attacker = { weapons: [weapon], hitMod, woundMod, rerollHit, rerollWound }
 * weapon   = { count, attacks, hit, strength, ap, damage, melee, torrent, lethal, sustained,
 *              devastating, twinLinked, blast, cleave, heavy, lance, anti, melta, critHit,
 *              ignoresCover }
 * target   = { models, woundsPerModel, toughness, save, invuln, fnp, cover, damageReduction }
 *
 * Blessures dévastatrices : une blessure critique inflige des blessures mortelles égales
 * à D, sans sauvegarde ni réduction de dégâts, après les dégâts normaux ; une seule
 * figurine au maximum par blessure critique (pas de report).
 */
export function simulateOnce(attacker, target, rng) {
  const d6 = () => 1 + Math.floor(rng() * 6)
  const pool = createPool(target.models, target.woundsPerModel)
  const weapons = attacker.weapons
  const byWeapon = new Array(weapons.length).fill(0)
  const deferred = [] // [index d'arme, dégâts] des blessures dévastatrices
  let unsaved = 0

  const damageRoll = (w, mortal = false) => {
    let d = rollValue(w.damage, rng) + (w.melta || 0)
    if (!mortal && target.damageReduction) d = Math.max(1, d - 1)
    if (!target.fnp) return d
    let lost = 0
    for (let i = 0; i < d; i++) if (d6() < target.fnp) lost++
    return lost
  }

  weapons.forEach((w, wi) => {
    // Attaques
    let nAttacks = 0
    const count = w.count ?? 1
    for (let m = 0; m < count; m++) nAttacks += rollValue(w.attacks, rng)
    // Explosion X / Fendoir X : +X attaques par tranche complète de 5 figurines ciblées
    const perFive = (Number(w.blast) || 0) + (Number(w.cleave) || 0)
    if (perFive) nAttacks += count * perFive * Math.floor(target.models / 5)

    // Touches
    let hits = 0
    let autoWounds = 0
    if (w.torrent) {
      hits = nAttacks
    } else {
      const critHit = w.critHit ?? 6
      const bs = hitTarget(w, target)
      const hitMod = clamp1((attacker.hitMod || 0) + (w.heavy && !w.melee ? 1 : 0))
      const ok = (r) => r !== 1 && (r >= critHit || r + hitMod >= bs)
      for (let i = 0; i < nAttacks; i++) {
        const r = reroll(d6(), ok, attacker.rerollHit, d6)
        if (!ok(r)) continue
        if (r >= critHit) {
          if (w.lethal) autoWounds++
          else hits++
          if (w.sustained) hits += rollValue(w.sustained, rng)
        } else {
          hits++
        }
      }
    }

    // Blessures
    const need = woundTarget(w.strength, target.toughness)
    const critWound = Math.min(6, w.anti ?? 6)
    const woundMod = clamp1((attacker.woundMod || 0) + (w.lance ? 1 : 0))
    const okW = (r) => r !== 1 && (r >= critWound || r + woundMod >= need)
    const mode = w.twinLinked ? 'all' : attacker.rerollWound
    let wounds = autoWounds
    for (let i = 0; i < hits; i++) {
      const r = reroll(d6(), okW, mode, d6)
      if (!okW(r)) continue
      if (w.devastating && r >= critWound) {
        unsaved++
        deferred.push([wi, damageRoll(w, true)])
      } else {
        wounds++
      }
    }

    // Sauvegardes puis dégâts
    const es = effectiveSave(target.save, w.ap, target.invuln)
    for (let i = 0; i < wounds; i++) {
      if (es <= 6 && d6() >= es) continue
      unsaved++
      byWeapon[wi] += pool.apply(damageRoll(w))
    }
  })

  for (const [wi, d] of deferred) byWeapon[wi] += pool.apply(d)

  const damage = byWeapon.reduce((a, b) => a + b, 0)
  return { unsaved, killed: target.models - pool.alive, damage, byWeapon }
}

/** Simulation Monte-Carlo. */
export function simulate(attacker, target, runs = 10000, rng = Math.random) {
  const histogram = new Array(target.models + 1).fill(0)
  const weaponDamage = new Array(attacker.weapons.length).fill(0)
  let sumUnsaved = 0, sumKilled = 0, sumDamage = 0
  for (let i = 0; i < runs; i++) {
    const r = simulateOnce(attacker, target, rng)
    sumUnsaved += r.unsaved
    sumKilled += r.killed
    sumDamage += r.damage
    r.byWeapon.forEach((d, wi) => { weaponDamage[wi] += d })
    histogram[r.killed]++
  }
  return {
    runs,
    meanUnsaved: sumUnsaved / runs,
    meanKilled: sumKilled / runs,
    meanDamage: sumDamage / runs,
    pWipe: histogram[target.models] / runs,
    histogram: histogram.map((c) => c / runs),
    weaponDamage: weaponDamage.map((d) => d / runs),
  }
}
