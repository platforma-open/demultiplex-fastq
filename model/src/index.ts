import type { InferOutputsType, PlRef } from "@platforma-sdk/model";
import {
  BlockModelV3,
  DataModelBuilder,
  getAxisId,
  isPColumnSpec,
  parseResourceMap,
} from "@platforma-sdk/model";

const MITOOL_PROGRESS_PREFIX = "[==MITOOL_PROGRESS==]";

export type BlockData = {
  inputRef?: PlRef;
  barcodeSourceRef?: PlRef;
  tagPattern: string;
  limitInput?: number;
  runMode: "dry" | "full";
};

export type BlockArgs = {
  inputRef?: PlRef;
  barcodeSourceRef?: PlRef;
  tagPattern: string;
  limitInput?: number;
};

const DEFAULT_TAG_PATTERN = "^{SMPL1}N{0:2}(R1:*)\\^N{20}(R2:*)";

const dataModel = new DataModelBuilder().from<BlockData>("v1").init(() => ({
  tagPattern: DEFAULT_TAG_PATTERN,
  runMode: "full",
}));

export const platforma = BlockModelV3.create(dataModel)

  .args<BlockArgs>((data) => {
    if (!data.inputRef) throw new Error("Sample groups linker is required");
    if (!data.barcodeSourceRef) throw new Error("Barcode source metadata column is required");
    if (!data.tagPattern || !data.tagPattern.trim()) throw new Error("Tag pattern is required");
    if (data.runMode === "dry" && data.limitInput == null) {
      throw new Error("Read limit is required for Preview mode");
    }
    // Mitool's tokenizer calls nextChar(skipSpaces=true) in the top-level parse
    // loop (tools/mitool/.../Tokenizer.kt), so whitespace between tokens is
    // silently ignored — and spaces are *disallowed* inside tag names. Stripping
    // all whitespace upfront gives us a canonical pattern that's equivalent for
    // mitool and trivially splittable on `\` downstream.
    const tagPattern = data.tagPattern.replace(/\s+/g, "");
    return {
      inputRef: data.inputRef,
      barcodeSourceRef: data.barcodeSourceRef,
      tagPattern,
      // `limitInput` only flows to the workflow in Preview mode — Full run
      // strips it so a stale value from an earlier Preview doesn't leak.
      limitInput: data.runMode === "dry" ? data.limitInput : undefined,
    };
  })

  // The block's single anchor is the sample-groups linker column.
  // Axes: [sampleGroupId, sampleId]. Both the multiplexed FASTQ dataset and the
  // sample barcode metadata are discovered from this one ref — FASTQ via axis[0],
  // metadata via axis[1].
  .output("inputOptions", (ctx) =>
    ctx.resultPool.getOptions([
      {
        name: "pl7.app/sequencing/data/sampleGroups",
        axes: [{ name: "pl7.app/sampleGroupId" }, { name: "pl7.app/sampleId" }],
      },
    ]),
  )

  // Barcode source scoped by axis identity: metadata columns whose sampleId axis
  // equals the linker's axes[1]. getAxisId strips the axis spec down to
  // {name, type, domain, contextDomain} — whatever samples-and-data stamps on
  // the sampleId axis flows through, no specific domain keys referenced.
  .output("barcodeSource", (ctx) => {
    const inputRef = ctx.data.inputRef;
    if (!inputRef) return { options: [], suggested: undefined as PlRef | undefined };
    const linkerSpec = ctx.resultPool.getSpecByRef(inputRef);
    if (!linkerSpec || !isPColumnSpec(linkerSpec)) {
      return { options: [], suggested: undefined as PlRef | undefined };
    }
    const options =
      ctx.resultPool.getOptions([
        {
          name: "pl7.app/metadata",
          type: "String",
          axes: [getAxisId(linkerSpec.axesSpec[1])],
        },
      ]) ?? [];

    const labelHits = options.filter((o) => /barcode/i.test(o.label ?? ""));
    const suggested: PlRef | undefined = labelHits.length === 1 ? labelHits[0].ref : undefined;
    return { options, suggested };
  })

  .output("demultiplexedFastq", (ctx) =>
    ctx.outputs
      ?.resolve({ field: "demultiplexedFastq", allowPermanentAbsence: true })
      ?.getPColumns(),
  )

  // Per-sampleGroup mitool parse log handles — MainPage wires these into a log
  // viewer keyed on sampleGroupId.
  .output("mitoolLogs", (ctx) => {
    if (!ctx.outputs) return undefined;
    const acc = ctx.outputs.resolve({ field: "mitoolLogs", allowPermanentAbsence: true });
    if (!acc) return undefined;
    return parseResourceMap(acc, (a) => a.getLogHandle(), false);
  })

  // Live per-sampleGroup progress scraped from the merged stderr/stdout stream.
  // Prefix is set via MI_PROGRESS_PREFIX env var in demux-group.tpl.tengo — mitool
  // emits one line per tick with that prefix.
  .output("mitoolProgress", (ctx) => {
    if (!ctx.outputs) return undefined;
    const acc = ctx.outputs.resolve({ field: "mitoolLogs", allowPermanentAbsence: true });
    if (!acc) return undefined;
    return parseResourceMap(acc, (a) => a.getProgressLog(MITOOL_PROGRESS_PREFIX), true);
  })

  // Per-sampleGroup parse report files — `reportFormat ∈ {txt, json}`. Users
  // download them via the UI; QC data is consumed via the separate `qc` output.
  .output("reports", (ctx) => {
    if (!ctx.outputs) return undefined;
    const acc = ctx.outputs.resolve({ field: "reports", allowPermanentAbsence: true });
    if (!acc) return undefined;
    return parseResourceMap(acc, (a) => a.getFileHandle(), false);
  })

  // QC table — per-sample matched-reads derived from parseReport.perSampleMatched
  // in each group's JSON report (mitool 2.3.1-57+). Decoded into flat rows
  // { sampleGroupId, sampleId, matched } so QcPage can render without reparsing
  // the PColumn JSON shape.
  .output("qc", (ctx) => {
    const raw = ctx.outputs
      ?.resolve({ field: "qc", allowPermanentAbsence: true })
      ?.getDataAsJson<{ keyLength: number; data: Record<string, number> }>();
    if (!raw) return undefined;
    const rows: { sampleGroupId: string; sampleId: string; matched: number }[] = [];
    for (const [encodedKey, matched] of Object.entries(raw.data ?? {})) {
      const key = JSON.parse(encodedKey) as [string, string];
      rows.push({ sampleGroupId: key[0], sampleId: key[1], matched });
    }
    return rows;
  })

  // Per-group { total, matched } — drives the matched-reads bar column in
  // MainPage. Raw map, keyed by sampleGroupId. Total comes from mitool's
  // parseReport.total (every read seen), matched from parseReport.matched
  // (reads routed to a sample writer).
  .output("qcGroupSummary", (ctx) =>
    ctx.outputs
      ?.resolve({ field: "qcGroupSummary", allowPermanentAbsence: true })
      ?.getDataAsJson<Record<string, { total: number; matched: number }>>(),
  )

  // Human-readable sampleGroupId and sampleId labels (if samples-and-data
  // published a label column on those axes). MainPage/QcPage render these.
  .output("sampleGroupLabels", (ctx) => {
    const inputRef = ctx.data.inputRef;
    if (!inputRef) return undefined;
    const spec = ctx.resultPool.getSpecByRef(inputRef);
    if (!spec || !isPColumnSpec(spec)) return undefined;
    return ctx.resultPool.findLabelsForColumnAxis(spec, 0);
  })

  .output("sampleLabels", (ctx) => {
    const inputRef = ctx.data.inputRef;
    if (!inputRef) return undefined;
    const spec = ctx.resultPool.getSpecByRef(inputRef);
    if (!spec || !isPColumnSpec(spec)) return undefined;
    return ctx.resultPool.findLabelsForColumnAxis(spec, 1);
  })

  .title(() => "Fastq Demultiplexing")

  .sections(() => [
    { type: "link" as const, href: "/" as const, label: "Main" },
    { type: "link" as const, href: "/qc" as const, label: "QC Report" },
  ])

  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
