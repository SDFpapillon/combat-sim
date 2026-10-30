<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  library: Object, // { nom: unité } — partagé entre les deux cartes
  unit: Object,
})
const emit = defineEmits(['load'])

const picked = ref('')
const names = computed(() => Object.keys(props.library).sort((a, b) => a.localeCompare(b, 'fr')))
const saved = ref(false)

function save() {
  const name = props.unit.name.trim() || 'Sans nom'
  if (props.library[name] && !confirm(`Remplacer l'unité enregistrée « ${name} » ?`)) return
  props.library[name] = JSON.parse(JSON.stringify(props.unit))
  picked.value = name
  saved.value = true
  setTimeout(() => { saved.value = false }, 1500)
}
function load() {
  if (picked.value) emit('load', JSON.parse(JSON.stringify(props.library[picked.value])))
}
function remove() {
  if (!picked.value || !confirm(`Supprimer « ${picked.value} » de vos unités ?`)) return
  delete props.library[picked.value]
  picked.value = ''
}
</script>

<template>
  <div class="library">
    <button type="button" @click="save">{{ saved ? 'Enregistrée ✓' : 'Enregistrer' }}</button>
    <select v-model="picked" aria-label="Mes unités enregistrées" @change="load">
      <option value="" disabled>Mes unités ({{ names.length }})</option>
      <option v-for="n in names" :key="n" :value="n">{{ n }}</option>
    </select>
    <button v-if="picked" type="button" class="del" @click="remove" title="Supprimer cette unité enregistrée">Supprimer</button>
  </div>
</template>
