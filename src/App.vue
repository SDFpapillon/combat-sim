<script setup>
import { reactive, ref, computed, watch } from 'vue'
import Seg from './components/Seg.vue'
import Histogram from './components/Histogram.vue'
import { simulate, expectedUnsavedWounds, effectiveSave, meanValue } from './engine.js'

const thresholds = [2, 3, 4, 5, 6].map((v) => ({ value: v, text: v + '+' }))
const apOpts = [0, -1, -2, -3, -4].map((v) => ({ value: v, text: v === 0 ? '0' : String(v) }))
const attackModes = ['fixe', 'D3', 'D6', '2D6'].map((v) => ({ value: v, text: v === 'fixe' ? 'Fixe' : v }))
const dmgModes = ['fixe', 'D3', 'D6'].map((v) => ({ value: v, text: v === 'fixe' ? 'Fixe' : v }))
const altOpts = [{ value: null, text: 'Aucune' }, ...[3, 4, 5, 6].map((v) => ({ value: v, text: v + '+' }))]

const WEAPONS = {
  'Tir léger':      { attackMode: 'fixe', attacks: 10, hit: 4, wound: 4, ap: 0, dmgMode: 'fixe', damage: 1 },
  'Arme lourde':    { attackMode: 'D6', attacks: 1, hit: 4, wound: 3, ap: -3, dmgMode: 'D6', damage: 1 },
  'Rafale':         { attackMode: '2D6', attacks: 1, hit: 3, wound: 5, ap: 0, dmgMode: 'fixe', damage: 1 },
  'Mêlée d\'élite': { attackMode: 'fixe', attacks: 5, hit: 3, wound: 3, ap: -2, dmgMode: 'fixe', damage: 2 },
}
const DEFENSES = {
  'Infanterie':        { models: 10, woundsPerModel: 1, save: 5, altSave: null },
  'Troupes d\'élite':  { models: 5, woundsPerModel: 2, save: 3, altSave: null },
  'Unité protégée':    { models: 3, woundsPerModel: 3, save: 2, altSave: 4 },
  'Véhicule':          { models: 1, woundsPerModel: 12, save: 3, altSave: null },
}

const units = reactive([
  { name: 'Unité A', ...WEAPONS['Tir léger'], ...DEFENSES['Troupes d\'élite'] },
  { name: 'Unité B', ...WEAPONS['Mêlée d\'élite'], ...DEFENSES['Infanterie'] },
])
const attIdx = ref(0)
const att = computed(() => units[attIdx.value])
const tgt = computed(() => units[1 - attIdx.value])
const options = reactive({ rerollHitOnes: false, rerollFailedWounds: false, sixAutoWounds: false, sixExtraHit: false })

function swap() { attIdx.value = 1 - attIdx.value }
function applyWeapon(name) { Object.assign(att.value, WEAPONS[name]) }
function applyDefense(name) { Object.assign(tgt.value, DEFENSES[name]) }

const clampInt = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(Number(v) || lo)))

const attackerProfile = computed(() => ({
  attacks: att.value.attackMode === 'fixe' ? clampInt(att.value.attacks, 1, 100) : att.value.attackMode,
  hit: att.value.hit, wound: att.value.wound, ap: att.value.ap,
  damage: att.value.dmgMode === 'fixe' ? clampInt(att.value.damage, 1, 20) : att.value.dmgMode,
}))
const targetProfile = computed(() => ({
  models: clampInt(tgt.value.models, 1, 40),
  woundsPerModel: clampInt(tgt.value.woundsPerModel, 1, 40),
  save: tgt.value.save, altSave: tgt.value.altSave,
}))

const result = ref(null)
const ms = ref(0)
let timer = null
function run() {
  const t0 = performance.now()
  result.value = simulate(attackerProfile.value, targetProfile.value, { ...options }, 10000)
  ms.value = Math.round(performance.now() - t0)
}
watch([attackerProfile, targetProfile, options], () => {
  clearTimeout(timer)
  timer = setTimeout(run, 80)
}, { deep: true, immediate: true })

const exact = computed(() => {
  const noOpt = !Object.values(options).some(Boolean)
  if (!noOpt) return null
  return expectedUnsavedWounds({
    ...attackerProfile.value, attacks: meanValue(attackerProfile.value.attacks),
    save: targetProfile.value.save, altSave: targetProfile.value.altSave,
  })
})
const effSave = computed(() => effectiveSave(tgt.value.save, att.value.ap, tgt.value.altSave))
const fmt = (n, d = 2) => n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d })
const pct = (p) => (p * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' %'
</script>

<template>
  <header class="top">
    <div class="brand">
      <svg viewBox="0 0 32 32" aria-hidden="true"><rect x="3" y="3" width="26" height="26" rx="6" /><circle cx="11" cy="11" r="2.4"/><circle cx="21" cy="21" r="2.4"/><circle cx="21" cy="11" r="2.4"/><circle cx="11" cy="21" r="2.4"/></svg>
      <span>Combat Sim</span>
    </div>
    <p class="tag">Calculez l'issue d'une attaque avant de lancer les dés.</p>
  </header>

  <main class="grid">
    <!-- ATTAQUANT -->
    <section class="card">
      <div class="card-head">
        <span class="role att">Attaquant</span>
        <input class="name" v-model="att.name" aria-label="Nom de l'unité attaquante" />
      </div>
      <div class="presets">
        <button v-for="(_, n) in WEAPONS" :key="n" type="button" @click="applyWeapon(n)">{{ n }}</button>
      </div>

      <Seg label="Nombre d'attaques" :options="attackModes" v-model="att.attackMode" />
      <label v-if="att.attackMode === 'fixe'" class="num">
        <input type="number" min="1" max="100" inputmode="numeric" v-model.number="att.attacks" /> attaques
      </label>
      <Seg label="Pour toucher" :options="thresholds" v-model="att.hit" />
      <Seg label="Pour blesser" :options="thresholds" v-model="att.wound" />
      <Seg label="Perforation" :options="apOpts" v-model="att.ap" />
      <Seg label="Dégâts par blessure" :options="dmgModes" v-model="att.dmgMode" />
      <label v-if="att.dmgMode === 'fixe'" class="num">
        <input type="number" min="1" max="20" inputmode="numeric" v-model.number="att.damage" /> dégât(s)
      </label>
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
      <div class="presets">
        <button v-for="(_, n) in DEFENSES" :key="n" type="button" @click="applyDefense(n)">{{ n }}</button>
      </div>

      <div class="nums">
        <label class="num"><span class="label">Figurines</span>
          <input type="number" min="1" max="40" inputmode="numeric" v-model.number="tgt.models" /></label>
        <label class="num"><span class="label">PV par figurine</span>
          <input type="number" min="1" max="40" inputmode="numeric" v-model.number="tgt.woundsPerModel" /></label>
      </div>
      <Seg label="Sauvegarde" :options="thresholds" v-model="tgt.save" />
      <Seg label="Sauvegarde alternative (non modifiable)" :options="altOpts" v-model="tgt.altSave" />
      <p class="hint">Sauvegarde effective contre cette arme :
        <strong>{{ effSave > 6 ? 'impossible' : effSave + '+' }}</strong></p>

      <fieldset class="opts">
        <legend class="label">Règles spéciales de l'attaquant</legend>
        <label><input type="checkbox" v-model="options.rerollHitOnes" /> Relancer les 1 pour toucher</label>
        <label><input type="checkbox" v-model="options.rerollFailedWounds" /> Relancer les jets pour blesser ratés</label>
        <label><input type="checkbox" v-model="options.sixAutoWounds" /> Un 6 pour toucher blesse automatiquement</label>
        <label><input type="checkbox" v-model="options.sixExtraHit" /> Un 6 pour toucher donne une touche supplémentaire</label>
      </fieldset>
    </section>

    <!-- RÉSULTATS -->
    <section class="card results" v-if="result" aria-live="polite">
      <h2>{{ att.name }} attaque {{ tgt.name }}</h2>
      <div class="stats">
        <div class="stat"><span class="big">{{ fmt(result.meanKilled) }}</span><span>figurines détruites<br>sur {{ targetProfile.models }}</span></div>
        <div class="stat hl"><span class="big">{{ pct(result.pWipe) }}</span><span>chance de détruire<br>toute l'unité</span></div>
        <div class="stat"><span class="big">{{ fmt(result.meanUnsaved) }}</span><span>blessures<br>non sauvegardées</span></div>
        <div class="stat"><span class="big">{{ fmt(result.meanDamage) }}</span><span>dégâts infligés<br>(PV retirés)</span></div>
      </div>
      <h3>Répartition des figurines détruites</h3>
      <Histogram :data="result.histogram" />
      <p class="foot">
        {{ result.runs.toLocaleString('fr-FR') }} tirages simulés en {{ ms }} ms.
        <template v-if="exact !== null"> Formule exacte : {{ fmt(exact) }} blessures non sauvegardées.</template>
      </p>
    </section>
  </main>

  <footer class="bottom">Démonstration — outil indépendant, saisissez vos propres profils.</footer>
</template>
