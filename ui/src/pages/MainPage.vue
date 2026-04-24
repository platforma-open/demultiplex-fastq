<script setup lang="ts">
import { AgGridVue } from "ag-grid-vue3";

import type { AnyLogHandle } from "@platforma-sdk/model";
import type { PlAgHeaderComponentParams } from "@platforma-sdk/ui-vue";
import {
  AgGridTheme,
  PlAgOverlayLoading,
  PlAgOverlayNoRows,
  PlAgTextAndButtonCell,
  PlBlockPage,
  PlBtnGhost,
  PlLogView,
  PlMaskIcon24,
  PlSlideModal,
  autoSizeRowNumberColumn,
  createAgGridColDef,
  makeRowNumberColDef,
} from "@platforma-sdk/ui-vue";
import type { ColDef, GridApi, GridOptions, GridReadyEvent } from "ag-grid-enterprise";
import { ClientSideRowModelModule, ModuleRegistry } from "ag-grid-enterprise";
import { computed, reactive, shallowRef } from "vue";
import { useApp } from "../app";
import SettingsPanel from "./SettingsPanel.vue";

// Mitool emits progress lines prefixed with `[==MITOOL_PROGRESS==]`.
// getProgressLog returns the full matched line, so we strip the prefix here.
// Examples after stripping:
//   "Parsing sequences: 42.1%  ETA: 00:00:05"
//   "Parsing sequences: 100%"
const MITOOL_PROGRESS_PREFIX = "[==MITOOL_PROGRESS==]";
const ProgressPattern = /(?<stage>[^:]*):(?:\s*(?<progress>[0-9.]+)%)?(?:\s*ETA:\s*(?<eta>.+))?/;

type ParsedProgress = {
  raw?: string;
  stage?: string;
  percentage?: string;
  etaLabel?: string;
};

function parseProgress(raw: string | undefined | null): ParsedProgress {
  let s = (raw ?? "").trim();
  if (!s) return { raw: "" };
  if (s.startsWith(MITOOL_PROGRESS_PREFIX)) {
    s = s.slice(MITOOL_PROGRESS_PREFIX.length).trim();
  }
  const match = s.match(ProgressPattern);
  if (!match) return { raw: s, stage: s };
  const { stage, progress, eta } = match.groups ?? {};
  return {
    raw: s,
    stage: stage?.trim(),
    percentage: progress,
    etaLabel: eta ? `ETA: ${eta.trim()}` : undefined,
  };
}

type GroupRow = {
  groupId: string;
  label: string;
  progress: string | undefined;
  logHandle: AnyLogHandle | undefined;
};

const app = useApp();

ModuleRegistry.registerModules([ClientSideRowModelModule]);

const gridApi = shallowRef<GridApi>();
const onGridReady = (params: GridReadyEvent) => {
  gridApi.value = params.api;
  autoSizeRowNumberColumn(params.api);
};

// Per-group progress — map from sampleGroupId to the most recent progress line.
const progressByGroup = computed<Record<string, string>>(() => {
  const rm = app.model.outputs.mitoolProgress;
  if (!rm?.data) return {};
  const out: Record<string, string> = {};
  for (const { key, value } of rm.data) {
    if (typeof value === "string") out[String(key[0])] = value;
  }
  return out;
});

const logByGroup = computed<Record<string, AnyLogHandle>>(() => {
  const rm = app.model.outputs.mitoolLogs;
  if (!rm?.data) return {};
  const out: Record<string, AnyLogHandle> = {};
  for (const { key, value } of rm.data) {
    if (value) out[String(key[0])] = value;
  }
  return out;
});

const rows = computed<GroupRow[]>(() => {
  const labels = app.model.outputs.sampleGroupLabels ?? {};
  const ids = new Set<string>();
  for (const id of Object.keys(labels)) ids.add(id);
  for (const id of Object.keys(progressByGroup.value)) ids.add(id);
  for (const id of Object.keys(logByGroup.value)) ids.add(id);

  return [...ids].sort().map((groupId) => ({
    groupId,
    label: labels[groupId] ?? groupId,
    progress: progressByGroup.value[groupId],
    logHandle: logByGroup.value[groupId],
  }));
});

const loadingOverlayParams = computed(() => {
  if (app.model.outputs.mitoolLogs !== undefined) {
    return { variant: "running" as const, runningText: "Demultiplexing" };
  }
  return { variant: "not-ready" as const };
});

const data = reactive<{
  settingsOpen: boolean;
  logOpen: boolean;
  selectedGroup: string | undefined;
}>({
  settingsOpen: app.model.outputs.mitoolLogs === undefined,
  logOpen: false,
  selectedGroup: undefined,
});

const selectedLogHandle = computed(() =>
  data.selectedGroup ? logByGroup.value[data.selectedGroup] : undefined,
);

const openLogForRow = (row: GroupRow | undefined) => {
  if (!row) return;
  data.selectedGroup = row.groupId;
  data.logOpen = true;
};

const defaultColumnDef: ColDef = {
  suppressHeaderMenuButton: true,
  lockPinned: true,
  sortable: false,
};

const columnDefs: ColDef<GroupRow>[] = [
  makeRowNumberColDef(),
  createAgGridColDef<GroupRow, string>({
    colId: "label",
    field: "label",
    headerName: "Sample Group",
    headerComponentParams: { type: "Text" } satisfies PlAgHeaderComponentParams,
    pinned: "left",
    lockPinned: true,
    sortable: true,
    cellRenderer: PlAgTextAndButtonCell,
    cellRendererParams: {
      invokeRowsOnDoubleClick: true,
    },
  }),
  createAgGridColDef<GroupRow, string | undefined>({
    colId: "progress",
    field: "progress",
    headerName: "Progress",
    headerComponentParams: { type: "Progress" } satisfies PlAgHeaderComponentParams,
    progress(cellData) {
      const parsed = parseProgress(cellData);
      if (!parsed.stage) {
        return { status: "not_started", text: "Queued" };
      }
      const done = parsed.stage.toLowerCase() === "done" || parsed.percentage === "100";
      return {
        status: done ? "done" : "running",
        percent: parsed.percentage,
        text: parsed.stage,
        suffix: parsed.etaLabel ?? "",
      };
    },
  }),
];

const gridOptions: GridOptions<GroupRow> = {
  getRowId: (row) => row.data.groupId,
  onRowDoubleClicked: (e: { data?: GroupRow }) => openLogForRow(e.data),
  components: { PlAgTextAndButtonCell },
};
</script>

<template>
  <PlBlockPage>
    <template #title>Fastq Demultiplexing</template>
    <template #append>
      <PlBtnGhost @click.stop="data.settingsOpen = true">
        Settings
        <template #append>
          <PlMaskIcon24 name="settings" />
        </template>
      </PlBtnGhost>
    </template>
    <div :style="{ flex: 1 }">
      <AgGridVue
        :theme="AgGridTheme"
        :style="{ height: '100%' }"
        :rowData="rows"
        :defaultColDef="defaultColumnDef"
        :columnDefs="columnDefs"
        :grid-options="gridOptions"
        :loadingOverlayComponentParams="loadingOverlayParams"
        :loadingOverlayComponent="PlAgOverlayLoading"
        :noRowsOverlayComponent="PlAgOverlayNoRows"
        @grid-ready="onGridReady"
      />
    </div>
  </PlBlockPage>
  <PlSlideModal v-model="data.settingsOpen" :shadow="true">
    <template #title>Settings</template>
    <SettingsPanel />
  </PlSlideModal>
  <PlSlideModal v-model="data.logOpen" width="60%">
    <template #title>
      mitool parse log —
      {{
        data.selectedGroup
          ? (app.model.outputs.sampleGroupLabels?.[data.selectedGroup] ?? data.selectedGroup)
          : "..."
      }}
    </template>
    <PlLogView v-if="selectedLogHandle" :log-handle="selectedLogHandle" />
    <div v-else :style="{ padding: '16px', color: 'var(--txt-03)' }">No log yet.</div>
  </PlSlideModal>
</template>

<style lang="css">
/** Remove this fix when using ui-vue > v1.8.25 */
.pl-log-view {
  max-height: calc(100% - var(--contour-offset));
  max-width: calc(100% - var(--contour-offset));
}
</style>
