<script setup lang="ts">
import { AgGridVue } from "ag-grid-vue3";

import type { PlAgHeaderComponentParams } from "@platforma-sdk/ui-vue";
import {
  AgGridTheme,
  PlAgOverlayLoading,
  PlAgOverlayNoRows,
  PlBlockPage,
  autoSizeRowNumberColumn,
  createAgGridColDef,
  makeRowNumberColDef,
} from "@platforma-sdk/ui-vue";
import type { ColDef, GridApi, GridOptions, GridReadyEvent } from "ag-grid-enterprise";
import { ClientSideRowModelModule, ModuleRegistry } from "ag-grid-enterprise";
import { computed, shallowRef } from "vue";
import { useApp } from "../app";

type QcRow = {
  sampleGroupId: string;
  sampleId: string;
  groupLabel: string;
  sampleLabel: string;
  matched: number;
};

const app = useApp();

ModuleRegistry.registerModules([ClientSideRowModelModule]);

const gridApi = shallowRef<GridApi>();
const onGridReady = (params: GridReadyEvent) => {
  gridApi.value = params.api;
  autoSizeRowNumberColumn(params.api);
};

const rows = computed<QcRow[]>(() => {
  const qc = app.model.outputs.qc;
  if (!qc) return [];
  const groupLabels = app.model.outputs.sampleGroupLabels ?? {};
  const sampleLabels = app.model.outputs.sampleLabels ?? {};
  return qc
    .map((r) => ({
      sampleGroupId: r.sampleGroupId,
      sampleId: r.sampleId,
      groupLabel: groupLabels[r.sampleGroupId] ?? r.sampleGroupId,
      sampleLabel: sampleLabels[r.sampleId] ?? r.sampleId,
      matched: r.matched,
    }))
    .sort((a, b) => {
      if (a.groupLabel !== b.groupLabel) return a.groupLabel.localeCompare(b.groupLabel);
      return a.sampleLabel.localeCompare(b.sampleLabel);
    });
});

const loadingOverlayParams = computed(() => {
  if (app.model.outputs.qc !== undefined) {
    return { variant: "running" as const, runningText: "Collecting QC" };
  }
  return { variant: "not-ready" as const };
});

const defaultColumnDef: ColDef = {
  suppressHeaderMenuButton: true,
  lockPinned: true,
  sortable: true,
  resizable: true,
};

const columnDefs: ColDef<QcRow>[] = [
  makeRowNumberColDef(),
  createAgGridColDef<QcRow, string>({
    colId: "groupLabel",
    field: "groupLabel",
    headerName: "Sample Group",
    headerComponentParams: { type: "Text" } satisfies PlAgHeaderComponentParams,
    pinned: "left",
    lockPinned: true,
  }),
  createAgGridColDef<QcRow, string>({
    colId: "sampleLabel",
    field: "sampleLabel",
    headerName: "Sample",
    headerComponentParams: { type: "Text" } satisfies PlAgHeaderComponentParams,
  }),
  createAgGridColDef<QcRow, number>({
    colId: "matched",
    field: "matched",
    headerName: "Matched reads",
    headerComponentParams: { type: "Number" } satisfies PlAgHeaderComponentParams,
    type: "numericColumn",
    valueFormatter: (p) => (typeof p.value === "number" ? p.value.toLocaleString() : ""),
  }),
];

const gridOptions: GridOptions<QcRow> = {
  getRowId: (row) => `${row.data.sampleGroupId}${row.data.sampleId}`,
};
</script>

<template>
  <PlBlockPage>
    <template #title>Quality Control</template>
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
</template>
