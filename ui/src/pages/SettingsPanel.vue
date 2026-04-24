<script setup lang="ts">
import type { ListOption } from "@platforma-sdk/ui-vue";
import { PlBtnGroup, PlDropdownRef, PlNumberField, PlTextField } from "@platforma-sdk/ui-vue";
import { watch } from "vue";
import { useApp } from "../app";

const app = useApp();

const runModeOptions: ListOption<"dry" | "full">[] = [
  { label: "Preview", value: "dry" },
  { label: "Full run", value: "full" },
];

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

  <PlBtnGroup v-model="app.model.data.runMode" :options="runModeOptions" label="Run mode">
    <template #tooltip>
      Preview — runs the demultiplexer on a limited number of reads per sample group. Use it to
      sanity-check pattern and barcode selection before launching a full run, which may take much
      longer.
    </template>
  </PlBtnGroup>

  <template v-if="app.model.data.runMode === 'dry'">
    <PlNumberField v-model="app.model.data.limitInput" label="Reads per group limit" :minValue="1">
      <template #tooltip>
        Number of reads to process per sample group in Preview mode. Default: 100,000.
      </template>
    </PlNumberField>
  </template>
</template>
