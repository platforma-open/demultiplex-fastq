<script setup lang="ts">
import { PlBlockPage, PlBtnGhost, PlMaskIcon24, PlSlideModal } from "@platforma-sdk/ui-vue";
import { ref } from "vue";
import SettingsPanel from "./SettingsPanel.vue";

const settingsOpen = ref(true);
</script>

<template>
  <PlBlockPage>
    <template #title>Fastq Demultiplexing</template>
    <template #append>
      <PlBtnGhost @click.stop="settingsOpen = true">
        Settings
        <template #append>
          <PlMaskIcon24 name="settings" />
        </template>
      </PlBtnGhost>
    </template>
    <div :style="{ padding: '16px', color: 'var(--txt-03)' }">
      Per-sample progress table will appear here once the workflow runs.
    </div>
  </PlBlockPage>
  <PlSlideModal v-model="settingsOpen" :shadow="true">
    <template #title>Settings</template>
    <SettingsPanel />
  </PlSlideModal>
</template>
