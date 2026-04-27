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
  >
    <template #tooltip>
      Metadata column whose values fill the <code>{SMPL1}</code> placeholder in the tag pattern —
      one barcode sequence per sample. Only columns attached to the sample axis of the selected
      multiplexed dataset are listed; columns whose label contains "barcode" are suggested
      automatically.
    </template>
  </PlDropdownRef>
  <PlTextField v-model="app.model.data.tagPattern" label="Tag pattern" :clearable="() => ''">
    <template #tooltip>
      <p>
        Describes how each read is decomposed into a sample barcode and payload. Follows the
        <strong>mitool</strong> pattern grammar.
      </p>
      <p>Key tokens:</p>
      <ul>
        <li>
          <code>{SMPL1}</code> — per-sample barcode placeholder, filled from the selected metadata
          column.
        </li>
        <li>
          <code>N{n:m}</code> — run of <em>n</em> to <em>m</em> arbitrary bases (use
          <code>N{k}</code> for exactly <em>k</em>).
        </li>
        <li>
          <code>(R1:*)</code> / <code>(R2:*)</code> — capture the remaining bases as the output R1 /
          R2 read.
        </li>
        <li><code>^</code> — anchor to the start of the read.</li>
        <li><code>\</code> — separates the R1 pattern from the R2 pattern (paired-end).</li>
        <li><code>|</code> — alternatives within the same read side.</li>
      </ul>
      <p>
        Default: <code>^{SMPL1}N{0:2}(R1:*)\^N{20}(R2:*)</code> — match the barcode at the start of
        R1, allow up to two spacer bases, capture the rest of R1, and skip the first 20 bases of R2
        before capturing the remainder.
      </p>
    </template>
  </PlTextField>

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
