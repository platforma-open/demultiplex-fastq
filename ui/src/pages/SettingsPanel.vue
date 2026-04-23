<script setup lang="ts">
import { PlDropdownRef, PlNumberField, PlTextField } from "@platforma-sdk/ui-vue";
import { watch } from "vue";
import { useApp } from "../app";

const app = useApp();

// Auto-fill barcode source when the model suggests exactly one candidate
// (label contains "barcode") and the user hasn't picked one yet.
watch(
  () => [app.model.data.inputRef, app.model.outputs.barcodeSource?.suggested] as const,
  ([_inputRef, suggested]) => {
    if (!app.model.data.barcodeSourceRef && suggested) {
      app.model.data.barcodeSourceRef = suggested;
    }
  },
  { immediate: true },
);
</script>

<template>
  <PlDropdownRef
    v-model="app.model.data.inputRef"
    :options="app.model.outputs.inputOptions"
    label="Multiplexed FASTQ dataset"
  />
  <PlDropdownRef
    v-model="app.model.data.barcodeSourceRef"
    :options="app.model.outputs.barcodeSource?.options ?? []"
    label="Sample barcode (SMPL1)"
    helper="Metadata column whose values fill {SMPL1} in the tag pattern — one barcode sequence per sample."
  />
  <PlTextField v-model="app.model.data.tagPattern" label="Tag pattern" :clearable="() => ''" />
  <PlNumberField
    v-model="app.model.data.limitInput"
    label="Reads per group limit (preview)"
    helper="Leave empty to process all reads. Set to e.g. 100000 for quick iteration on the first N reads per sample group."
    :minValue="1"
    :clearable="() => undefined"
  />
</template>
