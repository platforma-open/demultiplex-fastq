import { platforma } from "@platforma-open/milaboratories.demultiplex-fastq.model";
import { defineAppV3 } from "@platforma-sdk/ui-vue";
import MainPage from "./pages/MainPage.vue";
import QcPage from "./pages/QcPage.vue";

export const sdkPlugin = defineAppV3(platforma, () => {
  return {
    routes: {
      "/": () => MainPage,
      "/qc": () => QcPage,
    },
  };
});

export const useApp = sdkPlugin.useApp;
