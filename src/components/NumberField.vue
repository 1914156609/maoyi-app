<template>
  <view class="field"
    ><text class="field-label"
      >{{ label }}<text v-if="required" class="required">*</text></text
    ><input
      :aria-label="label"
      :class="['input', { error }]"
      type="digit"
      :value="modelValue"
      :placeholder="placeholder || '选填'"
      placeholder-class="input-placeholder"
      maxlength="10"
      @input="$emit('update:modelValue', $event.detail.value)"
    /><text v-if="error" class="error-text">{{ error }}</text></view
  >
</template>
<script setup>
defineProps({
  label: String,
  modelValue: [String, Number],
  placeholder: String,
  required: Boolean,
  error: String,
});
defineEmits(["update:modelValue"]);
</script>
