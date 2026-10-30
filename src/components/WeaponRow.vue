<script setup>
import { computed } from 'vue'
import { parseDice, woundTarget, effectiveSave, hitTarget } from '../engine.js'

const props = defineProps({
  w: Object,        // profil d'arme (modifié en place)
  target: Object,   // profil de la cible, pour les indications
})
defineEmits(['remove', 'duplicate'])

const validA = computed(() => parseDice(props.w.attacks) !== null)
const validD = computed(() => parseDice(props.w.damage) !== null)

const KEYWORDS = [
  ['torrent', 'Torrent', 'Touche automatiquement'],
  ['lethal', 'Touches fatales', 'Lethal Hits : une touche critique blesse automatiquement'],
  ['devastating', 'Blessures dévastatrices', 'Devastating Wounds : une blessure critique ignore toute sauvegarde'],
  ['twinLinked', 'Jumelée', 'Twin-linked : relance les jets pour blesser'],
  ['heavy', 'Lourde (≤ 3" de mouvement)', 'Heavy : +1 pour toucher au tir si l\'unité a bougé de 3" au plus'],
  ['lance', 'Lance (a chargé)', 'Lance : +1 pour blesser si l\'unité a chargé ce tour'],
  ['ignoresCover', 'Ignore le couvert', 'Ignores Cover'],
]
const active = computed(() => {
  const w = props.w
  const out = KEYWORDS.filter(([k]) => w[k]).map(([, t]) => t)
  if (w.sustained) out.push(`Touches soutenues ${w.sustained}`)
  if (w.blast) out.push(`Explosion ${w.blast}`)
  if (w.cleave) out.push(`Fendoir ${w.cleave}`)
  if (w.anti) out.push(`Anti ${w.anti}+`)
  if (w.melta) out.push(`Fusion ${w.melta}`)
  if (w.critHit < 6) out.push(`Critique ${w.critHit}+`)
  return out
})

const hint = computed(() => {
  const t = props.target
  const need = woundTarget(props.w.strength, t.toughness)
  const es = effectiveSave(t.save, props.w.ap, t.invuln)
  const hit = props.w.torrent ? 'Touche auto' : `Touche sur ${Math.min(7, hitTarget(props.w, t))}+`
  return `${hit} · blesse sur ${need}+ · sauvegarde ${es > 6 ? 'impossible' : es + '+'}`
})

// PA saisie « 2 » ou « -2 » : toujours stockée en négatif
function setAp(e) {
  const v = Math.min(6, Math.abs(Math.round(Number(e.target.value) || 0)))
  props.w.ap = -v
  e.target.value = v ? -v : 0
}
</script>

<template>
  <div class="weapon" :class="{ off: !w.enabled }">
    <div class="w-head">
      <input type="checkbox" v-model="w.enabled" :aria-label="`Inclure ${w.name}`" title="Inclure cette arme" />
      <input class="w-name" v-model="w.name" aria-label="Nom de l'arme" />
      <button type="button" class="type" @click="w.melee = !w.melee"
              :title="w.melee ? 'Arme de mêlée (cliquer pour passer en tir)' : 'Arme de tir (cliquer pour passer en mêlée)'">
        {{ w.melee ? 'Mêlée' : 'Tir' }}</button>
      <button type="button" class="icon" @click="$emit('duplicate')" title="Dupliquer" aria-label="Dupliquer l'arme">⧉</button>
      <button type="button" class="icon" @click="$emit('remove')" title="Supprimer" aria-label="Supprimer l'arme">✕</button>
    </div>
    <div class="stats-row">
      <label><span>Nb</span><input type="number" min="1" max="30" inputmode="numeric" v-model.number="w.count" title="Nombre de figurines équipées" /></label>
      <label><span>A</span><input v-model.trim="w.attacks" :class="{ bad: !validA }" title="Attaques : 3, D6, 2D6, D3+1…" /></label>
      <label><span>{{ w.melee ? 'CC' : 'CT' }}</span>
        <select v-model.number="w.hit" :disabled="w.torrent">
          <option v-for="v in [2, 3, 4, 5, 6]" :key="v" :value="v">{{ v }}+</option>
        </select></label>
      <label><span>F</span><input type="number" min="1" max="30" inputmode="numeric" v-model.number="w.strength" /></label>
      <label><span>PA</span><input type="number" min="-6" max="0" inputmode="numeric" :value="w.ap" @change="setAp" /></label>
      <label><span>D</span><input v-model.trim="w.damage" :class="{ bad: !validD }" title="Dégâts : 2, D3, D6+1…" /></label>
    </div>
    <p class="w-hint">{{ hint }}</p>
    <details class="kw">
      <summary>Mots-clés<span v-if="active.length"> : {{ active.join(', ') }}</span></summary>
      <div class="chips">
        <label v-for="[k, text, tip] in KEYWORDS" :key="k" class="chip" :class="{ on: w[k] }" :title="tip">
          <input type="checkbox" v-model="w[k]" />{{ text }}
        </label>
      </div>
      <div class="kw-sel">
        <label title="Blast X : +X attaques par tranche de 5 figurines ciblées">Explosion
          <select v-model.number="w.blast">
            <option :value="0">—</option>
            <option v-for="v in [1, 2, 3]" :key="v" :value="v">{{ v }}</option>
          </select></label>
        <label title="Cleave X : +X attaques par tranche de 5 figurines ciblées (une seule cible)">Fendoir
          <select v-model.number="w.cleave">
            <option :value="0">—</option>
            <option v-for="v in [1, 2, 3]" :key="v" :value="v">{{ v }}</option>
          </select></label>
        <label title="Sustained Hits : touches supplémentaires sur une touche critique">Touches soutenues
          <select v-model="w.sustained">
            <option :value="0">—</option>
            <option v-for="v in [1, 2, 3, 'D3']" :key="v" :value="v">{{ v }}</option>
          </select></label>
        <label title="Anti-X : blessure critique sur ce résultat">Anti
          <select v-model="w.anti">
            <option :value="null">—</option>
            <option v-for="v in [2, 3, 4, 5]" :key="v" :value="v">{{ v }}+</option>
          </select></label>
        <label title="Melta : dégâts en plus (à demi-portée)">Fusion
          <select v-model.number="w.melta">
            <option :value="0">—</option>
            <option v-for="v in [1, 2, 3, 4, 6]" :key="v" :value="v">+{{ v }}</option>
          </select></label>
        <label title="Résultat minimum pour une touche critique">Touche critique
          <select v-model.number="w.critHit">
            <option v-for="v in [6, 5, 4]" :key="v" :value="v">{{ v }}+</option>
          </select></label>
      </div>
    </details>
  </div>
</template>
