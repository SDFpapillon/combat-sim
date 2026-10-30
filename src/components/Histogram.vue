<script setup>
import { computed } from 'vue'

const props = defineProps({ data: Array }) // probabilités par nombre de figurines détruites

const W = typeof window !== 'undefined' && window.innerWidth < 600 ? 340 : 600
const H = 220, PAD_B = 28, PAD_T = 22
const max = computed(() => Math.max(...props.data, 0.0001))
const step = computed(() => W / props.data.length)
const labelEvery = computed(() => Math.ceil(props.data.length / 12))
const pct = (p) => (p * 100 >= 10 ? Math.round(p * 100) : (p * 100).toFixed(1)) + ' %'
</script>

<template>
  <svg :viewBox="`0 0 ${W} ${H}`" class="histo" role="img"
       aria-label="Histogramme du nombre de figurines détruites">
    <line :x1="0" :x2="W" :y1="H - PAD_B" :y2="H - PAD_B" class="axis" />
    <g v-for="(p, i) in data" :key="i">
      <rect
        :x="i * step + step * 0.12"
        :width="step * 0.76"
        :y="H - PAD_B - (p / max) * (H - PAD_B - PAD_T)"
        :height="(p / max) * (H - PAD_B - PAD_T)"
        rx="3"
        :class="['bar', { wipe: i === data.length - 1 && i > 0 }]"
      ><title>{{ i }} détruite(s) : {{ pct(p) }}</title></rect>
      <text v-if="p >= 0.02 && data.length <= 16"
            :x="i * step + step / 2"
            :y="H - PAD_B - (p / max) * (H - PAD_B - PAD_T) - 6"
            class="val">{{ pct(p) }}</text>
      <text v-if="i % labelEvery === 0 || i === data.length - 1"
            :x="i * step + step / 2" :y="H - 8" class="tick">{{ i }}</text>
    </g>
  </svg>
</template>
