<script setup lang="ts">
import type { InputFacts } from "@platforma-open/milaboratories.demultiplex-fastq.model";
import { refKey } from "@platforma-open/milaboratories.demultiplex-fastq.model";
import type { PlRef } from "@platforma-sdk/model";
import type { ListOption } from "@platforma-sdk/ui-vue";
import {
  PlAccordionSection,
  PlBtnGhost,
  PlBtnGroup,
  PlDropdownRef,
  PlNumberField,
  PlSectionSeparator,
  PlTextField,
} from "@platforma-sdk/ui-vue";
import { computed } from "vue";
import { useApp } from "../app";

const app = useApp();

const runModeOptions: ListOption<"dry" | "full">[] = [
  { label: "Preview", value: "dry" },
  { label: "Full run", value: "full" },
];

const inputOptions = computed(() => app.model.outputs.inputOptions?.options ?? []);
const factsByRef = computed(() => app.model.outputs.inputOptions?.factsByRef ?? {});

const declaredTags = computed<string[]>(() => app.model.data.inputBarcodeTags);
const nucleotidesOnly = computed<boolean>(() => app.model.data.inputNucleotidesOnly);

// Atomic write — `inputRef` and the snapshot of its spec annotations land in
// `data` in the same micro-task. Args lambda reads the snapshot from `data` to
// validate placeholders / nucleotidesOnly without ever touching the result
// pool. See harness reflection `args-lambda-data-only.md` for the rationale.
function onInputRefUpdate(ref: PlRef | undefined) {
  app.model.data.inputRef = ref;
  if (!ref) {
    app.model.data.inputBarcodeTags = [];
    app.model.data.inputNucleotidesOnly = false;
    return;
  }
  const facts: InputFacts | undefined = factsByRef.value[refKey(ref)];
  app.model.data.inputBarcodeTags = facts?.tags ?? [];
  app.model.data.inputNucleotidesOnly = facts?.nucleotidesOnly ?? false;
}

const PLACEHOLDER_RE = /\{([A-Za-z0-9]+)\}/g;
function parsePlaceholders(pattern: string): { used: string[]; duplicate?: string } {
  const seen = new Set<string>();
  const ordered: string[] = [];
  let m: RegExpExecArray | null;
  PLACEHOLDER_RE.lastIndex = 0;
  while ((m = PLACEHOLDER_RE.exec(pattern)) !== null) {
    const name = m[1];
    if (seen.has(name)) return { used: ordered, duplicate: name };
    seen.add(name);
    ordered.push(name);
  }
  return { used: ordered };
}

// Non-nucleotide barcodes are a property of the dataset, not the pattern —
// flag on the input dropdown directly so the user sees the issue at the
// source field. Args still throws for the same condition; UI is the
// proactive UX layer.
const inputRefError = computed<string | undefined>(() => {
  if (!app.model.data.inputRef) return undefined;
  if (!nucleotidesOnly.value) {
    return "This dataset's barcodes are not nucleotides — FASTQ Demultiplexing requires [ACGTN]+ barcode values. Pick a different dataset or fix the rules in Samples & Data.";
  }
  return undefined;
});

// Live validation mirror of the args lambda's pattern checks. Surfaced as an
// `error` prop on the tag-pattern field so the user sees red before pressing
// Run. args is the authoritative gate; this is UX.
const tagPatternError = computed<string | undefined>(() => {
  if (!app.model.data.inputRef) return undefined;
  const pattern = (app.model.data.tagPattern ?? "").replace(/\s+/g, "");
  if (!pattern) return undefined;
  const { used, duplicate } = parsePlaceholders(pattern);
  if (duplicate) return `Tag {${duplicate}} appears more than once.`;
  if (used.length === 0) return "Pattern must reference at least one barcode tag, e.g. {P5}.";
  const declared = new Set(declaredTags.value);
  const unknown = used.filter((t) => !declared.has(t));
  if (unknown.length > 0) {
    return `Unknown tag(s): ${unknown.map((t) => `{${t}}`).join(", ")}. Declared on this dataset: ${declaredTags.value.join(", ") || "(none)"}.`;
  }
  return undefined;
});

const tagPatternHelper = computed<string | undefined>(() => {
  if (!app.model.data.inputRef) return undefined;
  if (declaredTags.value.length === 0) {
    return "Selected dataset has no declared tags. Add tags in the Samples & Data block first.";
  }
  return `Available placeholders: ${declaredTags.value.map((t) => `{${t}}`).join(", ")}.`;
});

// "Start from default" button — picks the first declared tag on the dataset.
// Mirrors the spec's single-tag template `^{TAG}N{0:2}(R1:*) \ ^N{20}(R2:*)`,
// avoiding the magic-string default that would fail validation immediately.
const canSeedDefault = computed(
  () => declaredTags.value.length > 0 && !app.model.data.tagPattern.trim(),
);
function seedDefault() {
  const tag = declaredTags.value[0];
  if (!tag) return;
  app.model.data.tagPattern = `^{${tag}}N{0:2}(R1:*)\\^N{20}(R2:*)`;
}
</script>

<template>
  <PlDropdownRef
    :model-value="app.model.data.inputRef"
    :options="inputOptions"
    label="Multiplexed FASTQ dataset"
    :error="inputRefError"
    @update:model-value="onInputRefUpdate"
  >
    <template #tooltip>
      Pick a Multiplexed FASTQ dataset from the Samples & Data block. The dataset must declare
      multiplexing tags and rules — set those up on the dataset's "Multiplexing Rules" section.
    </template>
  </PlDropdownRef>

  <PlTextField
    v-model="app.model.data.tagPattern"
    label="Tag pattern"
    :clearable="() => ''"
    :error="tagPatternError"
    :helper="tagPatternHelper"
  >
    <template #tooltip>
      <p>
        Describes how each read is decomposed into barcode tags and payload. Follows the
        <strong>mitool</strong> pattern grammar.
      </p>
      <p>Key tokens:</p>
      <ul>
        <li>
          <code>{TagName}</code> — placeholder for one of the dataset's declared barcode tags. Each
          placeholder is filled with the per-sample barcode value from the multiplexing rules.
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
        Example with one tag:
        <code>^{P5}N{0:2}(R1:*)\^N{20}(R2:*)</code>. With dual-index:
        <code>^{P5}(R1:*)\^{P7}(R2:*)</code>.
      </p>
    </template>
  </PlTextField>

  <PlBtnGhost v-if="canSeedDefault" @click="seedDefault">Start from default</PlBtnGhost>

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

  <PlAccordionSection label="Advanced Settings">
    <PlSectionSeparator>Resource Allocation</PlSectionSeparator>
    <PlNumberField
      v-model="app.model.data.perProcessMemGB"
      label="Memory per sample process (GB)"
      :minValue="1"
      :maxValue="999999"
    >
      <template #tooltip>
        Memory budget per demultiplex process (mitool parse and export-fastq). Default: 32 GB.
      </template>
    </PlNumberField>

    <PlNumberField
      v-model="app.model.data.perProcessCPUs"
      label="CPUs per sample process"
      :minValue="1"
      :maxValue="999999"
    >
      <template #tooltip>
        CPU count per demultiplex process (mitool parse and export-fastq). Default: 8.
      </template>
    </PlNumberField>
  </PlAccordionSection>
</template>
