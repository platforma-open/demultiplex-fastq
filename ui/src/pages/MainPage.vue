<script setup lang="ts">
import { AgGridVue } from "ag-grid-vue3";

import type { AnyLogHandle, LocalBlobHandle } from "@platforma-sdk/model";
import type { PlAgHeaderComponentParams, PlChartStackedBarSettings } from "@platforma-sdk/ui-vue";
import {
  AgGridTheme,
  Gradient,
  PlAgChartStackedBarCell,
  PlAgOverlayLoading,
  PlAgOverlayNoRows,
  PlAgTextAndButtonCell,
  PlBlockPage,
  PlBtnGhost,
  PlLogView,
  PlMaskIcon24,
  PlSlideModal,
  PlTabs,
  PlTextArea,
  ReactiveFileContent,
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
  // AG-Grid's cellRendererSelector is called imperatively, not inside a Vue
  // effect, so reactive refs read inside the progress callback (like
  // completedGroups) don't trigger a re-render when they flip. Threading
  // `completed` through the row shape makes the transition a row-data diff,
  // which AG-Grid honours.
  completed: boolean;
  logHandle: AnyLogHandle | undefined;
  stats: { total: number; matched: number } | undefined;
};

type DetailTab = "logs" | "report";

const detailTabOptions: { value: DetailTab; label: string }[] = [
  { value: "logs", label: "Logs" },
  { value: "report", label: "Report" },
];

// Two-tone matched / unmatched bar. Green (matched) + muted magma (unmatched)
// mirrors mixcr-clonotyping's alignment stats column palette.
const matchedColor = Gradient("viridis").getNthOf(2, 5);
const unmatchedColor = Gradient("magma").getNthOf(2, 9);
function getMatchedBarSettings(
  stats: { total: number; matched: number } | undefined,
): PlChartStackedBarSettings | undefined {
  if (!stats || !stats.total) return undefined;
  const matched = stats.matched;
  const unmatched = Math.max(0, stats.total - matched);
  const pct = (n: number) => `${((n * 100) / stats.total).toFixed(1)}%`;
  return {
    title: "Matched",
    data: [
      {
        label: "Matched",
        value: matched,
        color: matchedColor,
        description: ["Matched", `${matched.toLocaleString()} (${pct(matched)})`].join("\n"),
      },
      {
        label: "Unmatched",
        value: unmatched,
        color: unmatchedColor,
        description: ["Unmatched", `${unmatched.toLocaleString()} (${pct(unmatched)})`].join("\n"),
      },
    ],
  };
}

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

// Per-group "done" signal: the json report file has materialized. Driven by the
// reports PColumn (keyed [sampleGroupId, reportFormat]). A landed json entry
// means mitool parse finished for that group — more reliable than the last
// progress line (mitool doesn't always emit a terminal 100%, and the post-parse
// flush stage has no progress reporting).
const completedGroups = computed<Set<string>>(() => {
  const rm = app.model.outputs.reports;
  if (!rm?.data) return new Set();
  const out = new Set<string>();
  for (const { key, value } of rm.data) {
    if (value && String(key[1]) === "json") out.add(String(key[0]));
  }
  return out;
});

// Per-group txt report blob handle — double-click opens it in the Report tab.
// `getFileHandle()` returns LocalBlobHandleAndSize ({ handle, size });
// ReactiveFileContent.getContentString expects just the `.handle`.
const txtReportByGroup = computed(() => {
  const rm = app.model.outputs.reports;
  if (!rm?.data) return {} as Record<string, LocalBlobHandle>;
  const out: Record<string, LocalBlobHandle> = {};
  for (const { key, value } of rm.data) {
    if (value && String(key[1]) === "txt") {
      out[String(key[0])] = value.handle;
    }
  }
  return out;
});

// Rows — only populate once a run has been dispatched. `mitoolLogs` is undefined
// pre-run, so checking it keeps the table empty (→ no "Queued" rows) until the
// user hits Run. `sampleGroupLabels` alone populates as soon as an input is
// picked, which would otherwise leak through.
const rows = computed<GroupRow[]>(() => {
  if (app.model.outputs.mitoolLogs === undefined) return [];
  const labels = app.model.outputs.sampleGroupLabels ?? {};
  const summary = app.model.outputs.qcGroupSummary ?? {};
  const ids = new Set<string>();
  for (const id of Object.keys(labels)) ids.add(id);
  for (const id of Object.keys(progressByGroup.value)) ids.add(id);
  for (const id of Object.keys(logByGroup.value)) ids.add(id);

  return [...ids].sort().map((groupId) => ({
    groupId,
    label: labels[groupId] ?? groupId,
    progress: progressByGroup.value[groupId],
    completed: completedGroups.value.has(groupId),
    logHandle: logByGroup.value[groupId],
    stats: summary[groupId],
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
  detailOpen: boolean;
  detailTab: DetailTab;
  selectedGroup: string | undefined;
}>({
  settingsOpen: app.model.outputs.mitoolLogs === undefined,
  detailOpen: false,
  detailTab: "logs",
  selectedGroup: undefined,
});

const selectedLogHandle = computed(() =>
  data.selectedGroup ? logByGroup.value[data.selectedGroup] : undefined,
);

const selectedReportHandle = computed(() =>
  data.selectedGroup ? txtReportByGroup.value[data.selectedGroup] : undefined,
);

// Lazy-fetch the report.txt content for the Report tab. Global LRU cache,
// auto-retries — any group already visited stays fast on re-open.
const reactiveFileContent = ReactiveFileContent.useGlobal();
const selectedReportContent = computed(() => {
  const handle = selectedReportHandle.value;
  if (!handle) return undefined;
  return reactiveFileContent.getContentString(handle)?.value;
});

const openDetailForRow = (row: GroupRow | undefined) => {
  if (!row) return;
  data.selectedGroup = row.groupId;
  data.detailOpen = true;
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
    progress(value, cellData) {
      // Authoritative terminal signal: the report file is on disk for this
      // group. Read from `cellData.data.completed` (threaded through the row
      // shape) — AG-Grid's cellRendererSelector is invoked imperatively, so
      // reactive refs read directly here would not retrigger on flip.
      if (cellData.data?.completed) {
        return { status: "done", text: "Done" };
      }
      const parsed = parseProgress(value);
      if (!parsed.stage) {
        return { status: "not_started", text: "Queued" };
      }
      return {
        status: "running",
        percent: parsed.percentage,
        text: parsed.stage,
        suffix: parsed.etaLabel ?? "",
      };
    },
  }),
  createAgGridColDef<GroupRow, unknown>({
    colId: "matched",
    headerName: "Matched reads",
    headerComponentParams: { type: "Text" } satisfies PlAgHeaderComponentParams,
    flex: 1,
    cellStyle: { "--ag-cell-horizontal-padding": "12px" },
    cellRendererSelector: (cellData) => ({
      component: PlAgChartStackedBarCell,
      params: { value: getMatchedBarSettings(cellData.data?.stats) },
    }),
  }),
];

const gridOptions: GridOptions<GroupRow> = {
  getRowId: (row) => row.data.groupId,
  onRowDoubleClicked: (e: { data?: GroupRow }) => openDetailForRow(e.data),
  components: { PlAgTextAndButtonCell, PlAgChartStackedBarCell },
};
</script>

<template>
  <PlBlockPage>
    <template #title>Demultiplex FASTQ</template>
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
  <PlSlideModal v-model="data.detailOpen" width="60%">
    <template #title>
      {{
        data.selectedGroup
          ? (app.model.outputs.sampleGroupLabels?.[data.selectedGroup] ?? data.selectedGroup)
          : "..."
      }}
    </template>
    <PlTabs v-model="data.detailTab" :options="detailTabOptions" />
    <div :style="{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }">
      <template v-if="data.detailTab === 'logs'">
        <PlLogView
          v-if="selectedLogHandle"
          :log-handle="selectedLogHandle"
          :progress-prefix="MITOOL_PROGRESS_PREFIX"
        />
        <div v-else :style="{ padding: '16px', color: 'var(--txt-03)' }">No log yet.</div>
      </template>
      <template v-else-if="data.detailTab === 'report'">
        <PlTextArea
          v-if="selectedReportContent !== undefined"
          :model-value="selectedReportContent"
          readonly
          :rows="30"
          :style="{ flex: 1, fontFamily: 'monospace', whiteSpace: 'pre' }"
        />
        <div v-else-if="selectedReportHandle" :style="{ padding: '16px', color: 'var(--txt-03)' }">
          Loading report…
        </div>
        <div v-else :style="{ padding: '16px', color: 'var(--txt-03)' }">
          Report not yet available — waits until mitool parse finishes for this group.
        </div>
      </template>
    </div>
  </PlSlideModal>
</template>

<style lang="css">
/** Remove this fix when using ui-vue > v1.8.25 */
.pl-log-view {
  max-height: calc(100% - var(--contour-offset));
  max-width: calc(100% - var(--contour-offset));
}
</style>
