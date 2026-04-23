<script setup lang="ts">
import { PlBlockPage } from "@platforma-sdk/ui-vue";
</script>

<template>
  <PlBlockPage>
    <template #title>Quality Control</template>
    <div :style="{ padding: '16px', color: 'var(--txt-03)' }">
      Per-group QC table (matched reads, matching rate) will appear here once the reports pipeline
      is wired.
    </div>
  </PlBlockPage>
</template>
