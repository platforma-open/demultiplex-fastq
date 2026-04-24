<script setup lang="ts">
import { PlBlockPage } from "@platforma-sdk/ui-vue";
</script>

<template>
  <PlBlockPage>
    <template #title>Quality Control</template>
    <div :style="{ padding: '16px', color: 'var(--txt-03)' }">
      Per-sample matched-reads QC will land here once mitool exposes a record-count CLI — see
      <code>.meta/mitool-parse-json-report.md</code>.
    </div>
  </PlBlockPage>
</template>
