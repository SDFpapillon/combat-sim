<script setup>
import { reactive, ref, computed, watch } from 'vue'
import Seg from './components/Seg.vue'
import Histogram from './components/Histogram.vue'
import WeaponRow from './components/WeaponRow.vue'
import UnitLibrary from './components/UnitLibrary.vue'
import { simulate, parseDice } from './engine.js'

const thresholds = [2, 3, 4, 5, 6].map((v) => ({ value: v, text: v + '+' }))
const invOpts = [{ value: null, text: 'Aucune' }, ...[2, 3, 4, 5, 6].map((v) => ({ value: v, text: v + '++' }))]
const fnpOpts = [{ value: null, text: 'Aucune' }, ...[4, 5, 6].map((v) => ({ value: v, text: v + '+' }))]
const modOpts = [-1, 0, 1].map((v) => ({ value: v, text: v > 0 ? '+1' : String(v) }))
const rerollOpts = [
  { value: 'none', text: 'Aucune' }, { value: 'ones', text: 'Les 1' }, { value: 'all', text: 'Échecs' },
]

const BLANK_WEAPON = {
  name: 'Arme', enabled: true, melee: false, count: 1, attacks: '1', hit: 3, strength: 4, ap: 0, damage: '1',
  torrent: false, lethal: false, devastating: false, twinLinked: false, heavy: false, lance: false,
  ignoresCover: false, blast: 0, cleave: 0, sustained: 0, anti: null, melta: 0, critHit: 6,
}
const WEAPONS = {
  'Fusil':           { count: 10, attacks: '2', hit: 3, strength: 4, ap: 0, damage: '1' },
  'Arme lourde':     { attacks: 'D6', hit: 4, strength: 9, ap: -3, damage: 'D6', heavy: true, blast: 1 },
  'Fusion':          { attacks: '1', hit: 3, strength: 9, ap: -4, damage: 'D6', melta: 2 },
  'Lance-flammes':   { attacks: 'D6', strength: 4, torrent: true, ignoresCover: true },
  'Canon rotatif':   { attacks: '6', hit: 3, strength: 5, ap: -1, damage: '1', sustained: 1 },
  'Arme de mêlée':   { count: 5, attacks: '3', hit: 3, strength: 5, ap: -2, damage: '2', melee: true, lethal: true },
  'Lance de charge': { attacks: '2', hit: 3, strength: 6, ap: -2, damage: '2', melee: true, lance: true },
}
const DEFENSES = {
  'Infanterie légère': { models: 10, woundsPerModel: 1, toughness: 3, save: 5, invuln: null, fnp: null },
  'Infanterie lourde': { models: 5, woundsPerModel: 2, toughness: 4, save: 3, invuln: null, fnp: null },
  'Élite':             { models: 3, woundsPerModel: 3, toughness: 5, save: 2, invuln: 4, fnp: null },
  'Personnage':        { models: 1, woundsPerModel: 5, toughness: 4, save: 2, invuln: 4, fnp: 5 },
  'Véhicule':          { models: 1, woundsPerModel: 12, toughness: 10, save: 3, invuln: null, fnp: null },
}
const BLANK_UNIT = {
  name: 'Unité', weapons: [],
  hitMod: 0, woundMod: 0, rerollHit: 'none', rerollWound: 'none',
  ...DEFENSES['Infanterie légère'], cover: false, damageReduction: false,
}

let nextId = 1
const newWeapon = (o = {}) => ({ ...BLANK_WEAPON, ...o, id: nextId++ })
/** Complète une unité (ancienne sauvegarde, lien partagé…) avec les valeurs par défaut. */
const normalizeUnit = (u) => ({
  ...BLANK_UNIT, ...u,
  weapons: (u.weapons ?? []).map((w) => newWeapon({
    ...w, attacks: String(w.attacks), damage: String(w.damage),
    blast: w.blast === true ? 1 : Number(w.blast) || 0, // ancien format : Explosion cochée
  })),
})

const DEFAULT_STATE = {
  attIdx: 0,
  units: [
    { name: 'Escouade', weapons: [{ name: 'Fusil', ...WEAPONS['Fusil'] }], ...DEFENSES['Infanterie lourde'] },
    { name: 'Horde', weapons: [{ name: 'Arme de mêlée', ...WEAPONS['Arme de mêlée'] }], ...DEFENSES['Infanterie légère'] },
  ],
}

// --- Persistance : lien partagé > dernier état > défaut ---
const STATE_KEY = 'combat-sim:state'
const LIB_KEY = 'combat-sim:library'
const read = (k) => { try { return JSON.parse(localStorage.getItem(k)) } catch { return null } }
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* stockage indisponible */ } }
function fromHash() {
  const m = /^#s=(.+)$/.exec(location.hash)
  if (!m) return null
  try { return JSON.parse(decodeURIComponent(escape(atob(m[1])))) } catch { return null }
}
const initial = fromHash() ?? read(STATE_KEY) ?? DEFAULT_STATE

const units = reactive(initial.units.slice(0, 2).map(normalizeUnit))
const attIdx = ref(initial.attIdx === 1 ? 1 : 0)
const library = reactive(read(LIB_KEY) ?? {})
const att = computed(() => units[attIdx.value])
const tgt = computed(() => units[1 - attIdx.value])

const snapshot = () => ({ attIdx: attIdx.value, units: JSON.parse(JSON.stringify(units)) })
watch([units, attIdx], () => write(STATE_KEY, snapshot()), { deep: true })
watch(library, () => write(LIB_KEY, library), { deep: true })

const copied = ref(false)
async function share() {
  const url = location.href.split('#')[0] + '#s=' + btoa(unescape(encodeURIComponent(JSON.stringify(snapshot()))))
  history.replaceState(null, '', url)
  try { await navigator.clipboard.writeText(url) } catch { /* l'URL reste dans la barre d'adresse */ }
  copied.value = true
  setTimeout(() => { copied.value = false }, 1800)
}

function swap() { attIdx.value = 1 - attIdx.value }
function addWeapon(e) {
  const name = e.target.value
  e.target.value = ''
  att.value.weapons.push(newWeapon(name ? { name, ...WEAPONS[name] } : {}))
}
function duplicate(i) {
  const w = att.value.weapons[i]
  att.value.weapons.splice(i + 1, 0, newWeapon({ ...w, name: w.name + ' (copie)' }))
}
function applyDefense(name) { Object.assign(tgt.value, DEFENSES[name]) }
function loadUnit(i, data) { units[i] = normalizeUnit(data) }

const clampInt = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(Number(v) || lo)))
const dice = (v) => (parseDice(v) ? v : '1')

const activeWeapons = computed(() => att.value.weapons.filter((w) => w.enabled))
const attackerProfile = computed(() => ({
  hitMod: att.value.hitMod, woundMod: att.value.woundMod,
  rerollHit: att.value.rerollHit, rerollWound: att.value.rerollWound,
  weapons: activeWeapons.value.map((w) => ({
    ...w,
    count: clampInt(w.count, 1, 30),
    attacks: dice(w.attacks),
    strength: clampInt(w.strength, 1, 30),
    damage: dice(w.damage),
  })),
}))
const targetProfile = computed(() => ({
  models: clampInt(tgt.value.models, 1, 40),
  woundsPerModel: clampInt(tgt.value.woundsPerModel, 1, 40),
  toughness: clampInt(tgt.value.toughness, 1, 20),
  save: tgt.value.save, invuln: tgt.value.invuln, fnp: tgt.value.fnp,
  cover: tgt.value.cover, damageReduction: tgt.value.damageReduction,
}))

const result = ref(null)
const ms = ref(0)
let timer = null
function run() {
  if (!attackerProfile.value.weapons.length) { result.value = null; return }
  const t0 = performance.now()
  const weapons = attackerProfile.value.weapons
  result.value = { ...simulate(attackerProfile.value, targetProfile.value, 10000), names: weapons.map((w) => w.name) }
  ms.value = Math.round(performance.now() - t0)
}
watch([attackerProfile, targetProfile], () => {
  clearTimeout(timer)
  timer = setTimeout(run, 80)
}, { deep: true, immediate: true })

const fmt = (n, d = 2) => n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d })
const pct = (p) => (p * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' %'
/** Probabilité de détruire au moins k figurines. */
const atLeast = computed(() => {
  if (!result.value) return []
  const h = result.value.histogram
  let acc = 0
  return h.map((_, i) => h.length - 1 - i).map((i) => (acc += h[i])).reverse()
})
</script>

<template>
  <header class="top">
    <div class="brand">
      <svg viewBox="0 0 32 32" aria-hidden="true"><rect x="3" y="3" width="26" height="26" rx="6" /><circle cx="11" cy="11" r="2.4"/><circle cx="21" cy="21" r="2.4"/><circle cx="21" cy="11" r="2.4"/><circle cx="11" cy="21" r="2.4"/></svg>
      <span>Combat Sim</span>
    </div>
    <p class="tag">Calculez l'issue d'une attaque avant de lancer les dés.</p>
    <button type="button" class="share" @click="share">{{ copied ? 'Lien copié ✓' : 'Copier le lien' }}</button>
  </header>

  <main class="grid">
    <!-- ATTAQUANT -->
    <section class="card">
      <div class="card-head">
        <span class="role att">Attaquant</span>
        <input class="name" v-model="att.name" aria-label="Nom de l'unité attaquante" />
      </div>
      <UnitLibrary :library="library" :unit="att" @load="loadUnit(attIdx, $event)" />

      <span class="label">Armes</span>
      <WeaponRow v-for="(w, i) in att.weapons" :key="w.id" :w="w" :target="targetProfile"
                 @remove="att.weapons.splice(i, 1)" @duplicate="duplicate(i)" />
      <select class="add" @change="addWeapon" aria-label="Ajouter une arme">
        <option value="">+ Ajouter une arme…</option>
        <option v-for="(_, n) in WEAPONS" :key="n" :value="n">{{ n }}</option>
      </select>

      <details class="mods">
        <summary class="label">Modificateurs et relances de l'unité</summary>
        <Seg label="Modificateur pour toucher" :options="modOpts" v-model="att.hitMod" />
        <Seg label="Modificateur pour blesser" :options="modOpts" v-model="att.woundMod" />
        <Seg label="Relancer pour toucher" :options="rerollOpts" v-model="att.rerollHit" />
        <Seg label="Relancer pour blesser" :options="rerollOpts" v-model="att.rerollWound" />
      </details>
    </section>

    <div class="swap-wrap">
      <button type="button" class="swap" @click="swap" aria-label="Échanger attaquant et cible">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v13m0 0-3.5-3.5M7 17l3.5-3.5M17 20V7m0 0-3.5 3.5M17 7l3.5 3.5"/></svg>
        Échanger
      </button>
    </div>

    <!-- CIBLE -->
    <section class="card">
      <div class="card-head">
        <span class="role tgt">Cible</span>
        <input class="name" v-model="tgt.name" aria-label="Nom de l'unité cible" />
      </div>
      <UnitLibrary :library="library" :unit="tgt" @load="loadUnit(1 - attIdx, $event)" />
      <div class="presets">
        <button v-for="(_, n) in DEFENSES" :key="n" type="button" @click="applyDefense(n)">{{ n }}</button>
      </div>

      <div class="nums three">
        <label class="num"><span class="label">Figurines</span>
          <input type="number" min="1" max="40" inputmode="numeric" v-model.number="tgt.models" /></label>
        <label class="num"><span class="label">PV par figurine</span>
          <input type="number" min="1" max="40" inputmode="numeric" v-model.number="tgt.woundsPerModel" /></label>
        <label class="num"><span class="label">Endurance</span>
          <input type="number" min="1" max="20" inputmode="numeric" v-model.number="tgt.toughness" /></label>
      </div>
      <Seg label="Sauvegarde d'armure" :options="thresholds" v-model="tgt.save" />
      <Seg label="Sauvegarde invulnérable" :options="invOpts" v-model="tgt.invuln" />
      <Seg label="Insensible à la douleur" :options="fnpOpts" v-model="tgt.fnp" />
      <fieldset class="opts">
        <label><input type="checkbox" v-model="tgt.cover" /> À couvert (-1 à la CT des tirs)</label>
        <label><input type="checkbox" v-model="tgt.damageReduction" /> -1 aux dégâts subis</label>
      </fieldset>
    </section>

    <!-- RÉSULTATS -->
    <section class="card results" aria-live="polite">
      <h2>{{ att.name }} attaque {{ tgt.name }}</h2>
      <p v-if="!result" class="hint">Ajoutez ou cochez au moins une arme pour lancer la simulation.</p>
      <template v-else>
        <div class="stats">
          <div class="stat"><span class="big">{{ fmt(result.meanKilled) }}</span><span>figurines détruites<br>sur {{ targetProfile.models }}</span></div>
          <div class="stat hl"><span class="big">{{ pct(result.pWipe) }}</span><span>chance de détruire<br>toute l'unité</span></div>
          <div class="stat"><span class="big">{{ fmt(result.meanUnsaved) }}</span><span>blessures<br>non sauvegardées</span></div>
          <div class="stat"><span class="big">{{ fmt(result.meanDamage) }}</span><span>dégâts infligés<br>(PV retirés)</span></div>
        </div>
        <div v-if="result.names.length > 1" class="by-weapon">
          <h3>Dégâts moyens par arme</h3>
          <div v-for="(name, i) in result.names" :key="i" class="bw">
            <span>{{ name }}</span>
            <span class="bar-bg"><span class="bar-fg" :style="{ width: (result.meanDamage ? 100 * result.weaponDamage[i] / result.meanDamage : 0) + '%' }"></span></span>
            <strong>{{ fmt(result.weaponDamage[i]) }}</strong>
          </div>
        </div>
        <h3>Répartition des figurines détruites</h3>
        <Histogram :data="result.histogram" />
        <div class="cumul">
          <span v-for="k in targetProfile.models" :key="k" v-show="atLeast[k] >= 0.005 || k === 1">
            ≥ {{ k }} : <strong>{{ pct(atLeast[k]) }}</strong>
          </span>
        </div>
        <p class="foot">{{ result.runs.toLocaleString('fr-FR') }} tirages simulés en {{ ms }} ms.</p>
      </template>
    </section>
  </main>

  <footer class="bottom">Outil indépendant — saisissez vos propres profils. Unités et état enregistrés dans ce navigateur.</footer>
</template>
