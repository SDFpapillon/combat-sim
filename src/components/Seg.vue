<script setup>
defineProps({
  label: String,
  options: Array, // [{ value, text }]
  modelValue: [String, Number, null],
})
defineEmits(['update:modelValue'])
</script>

<template>
  <div class="field">
    <span class="label">{{ label }}</span>
    <div class="seg" role="radiogroup" :aria-label="label">
      <button
        v-for="o in options"
        :key="String(o.value)"
        type="button"
        role="radio"
        :aria-checked="modelValue === o.value"
        :class="{ on: modelValue === o.value }"
        @click="$emit('update:modelValue', o.value)"
      >{{ o.text }}</button>
    </div>
  </div>
</template>
