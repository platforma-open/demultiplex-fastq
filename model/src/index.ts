import type { BlockParams, RunMode } from "@platforma-open/milaboratories.demultiplex-fastq.kind";
import { kind } from "@platforma-open/milaboratories.demultiplex-fastq.kind";
import type { InferOutputsType, PlRef } from "@platforma-sdk/model";
import {
  BlockModelV3,
  DataModelBuilder,
  isPColumnSpec,
  parseResourceMap,
} from "@platforma-sdk/model";
import { deriveTemplateParams } from "./templateParams";

export type { BlockParams, RunMode };
export { deriveTemplateParams };

const MITOOL_PROGRESS_PREFIX = "[==MITOOL_PROGRESS==]";

const RULES_COLUMN_NAME = "pl7.app/sequencing/multiplexingRules";
const ANNOTATION_BARCODE_TAGS = "pl7.app/sequencing/barcodeTags";
const ANNOTATION_NUCLEOTIDES_ONLY = "pl7.app/sequencing/barcodeNucleotidesOnly";

// Snapshot of the spec annotations the args lambda needs to validate against.
// Args lambda is pure-of-data — it cannot read result pool — so the UI mirrors
// these into `data` on the input-ref change handler. See harness reflection
// `args-lambda-data-only.md`.
export type InputFacts = {
  tags: string[];
  nucleotidesOnly: boolean;
};

export type BlockData = {
  inputRef?: PlRef;
  // Snapshot from the multiplexing rules column's annotations, written by the
  // UI in the same micro-task as `inputRef`. Args lambda validates against this
  // copy. Stale only if the upstream column re-emits with a different tag set
  // before the user re-touches the dropdown — workflow asserts as a
  // defence-in-depth gate.
  inputBarcodeTags: string[];
  inputNucleotidesOnly: boolean;
  tagPattern: string;
  limitInput: number;
  runMode: RunMode;
  perProcessMemGB?: number;
  perProcessCPUs?: number;
};

type BlockDataV1 = {
  inputRef?: PlRef;
  barcodeSourceRef?: PlRef;
  tagPattern: string;
  limitInput: number;
  runMode: RunMode;
};

export type BlockArgs = {
  inputRef: PlRef;
  tagPattern: string;
  // Lex-sorted unique placeholders extracted from `tagPattern`. Workflow uses
  // these to canonicalise to S1/S2/... before invoking mitool.
  usedTags: string[];
  limitInput?: number;
  perProcessMemGB?: number;
  perProcessCPUs?: number;
};

export type InputOptions = {
  options: { ref: PlRef; label: string }[];
  // Keyed by `${ref.blockId}/${ref.name}` — PlRef itself is a structure and
  // not directly usable as a Map/Record key. The UI uses this to snapshot
  // `tags` + `nucleotidesOnly` into `data` on dropdown change.
  factsByRef: Record<string, InputFacts>;
};

const DRY_RUN_READS_DEFAULT = 100_000;
const PER_PROCESS_MEM_GB_DEFAULT = 32;
const PER_PROCESS_CPUS_DEFAULT = 8;

// `${ref.blockId}/${ref.name}` is unique inside one project — PlRef has only
// these two semantic fields beyond the `__isRef` tag.
export const refKey = (ref: PlRef): string => `${ref.blockId}/${ref.name}`;

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

function parseTagsAnnotation(raw: string | undefined): string[] | undefined {
  if (raw === undefined) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!Array.isArray(parsed)) return undefined;
  if (!parsed.every((x) => typeof x === "string")) return undefined;
  return parsed;
}

/**
 * A block's starting state, seeded by whatever the creator or a project template supplied.
 * Read together with `deriveTemplateParams`, its mirror image: a field added to the contract
 * but not to both functions is silently dropped from every template.
 *
 * The two snapshot fields default to "no tags, not nucleotides" rather than to anything
 * permissive — a block created without an input must not look like one whose dataset passed the
 * nucleotide gate.
 */
export const initBlockData = (params?: BlockParams): BlockData => ({
  inputRef: params?.inputRef,
  inputBarcodeTags: [...(params?.inputBarcodeTags ?? [])],
  inputNucleotidesOnly: params?.inputNucleotidesOnly ?? false,
  tagPattern: params?.tagPattern ?? "",
  limitInput: params?.limitInput ?? DRY_RUN_READS_DEFAULT,
  runMode: params?.runMode ?? "full",
  perProcessMemGB: PER_PROCESS_MEM_GB_DEFAULT,
  perProcessCPUs: PER_PROCESS_CPUS_DEFAULT,
});

const dataModel = new DataModelBuilder({ kind })
  .from<BlockDataV1>("v1")
  .migrate<BlockData>("v2", (v1) => ({
    inputRef: undefined,
    inputBarcodeTags: [],
    inputNucleotidesOnly: false,
    // Old patterns referenced {SMPL1}; the new validation requires placeholders
    // to live in the rules column's `barcodeTags` set, so wipe and let the user
    // re-author from the new declared tags.
    tagPattern: "",
    limitInput: v1.limitInput,
    runMode: v1.runMode,
    perProcessMemGB: PER_PROCESS_MEM_GB_DEFAULT,
    perProcessCPUs: PER_PROCESS_CPUS_DEFAULT,
  }))
  .init(({ params }) => initBlockData(params));

export const platforma = BlockModelV3.create({ dataModel, kind })

  .args<BlockArgs>((data) => {
    if (!data.inputRef) throw new Error("Multiplexing rules column is required");
    if (!data.tagPattern || !data.tagPattern.trim()) throw new Error("Tag pattern is required");
    if (data.runMode === "dry" && data.limitInput <= 0) {
      throw new Error("Read limit must be a positive integer for Preview mode");
    }
    // Mitool's tokenizer skips spaces between tokens (Tokenizer.kt) and
    // disallows them inside tag names — strip everything upfront for a
    // canonical pattern.
    const tagPattern = data.tagPattern.replace(/\s+/g, "");

    const { used, duplicate } = parsePlaceholders(tagPattern);
    if (duplicate) {
      throw new Error(`Tag placeholder {${duplicate}} appears more than once in the pattern`);
    }
    if (used.length === 0) {
      throw new Error("Tag pattern must reference at least one barcode tag, e.g. {P5}");
    }
    const declared = new Set(data.inputBarcodeTags);
    const unknown = used.filter((t) => !declared.has(t));
    if (unknown.length > 0) {
      throw new Error(
        `Unknown tag placeholder(s): ${unknown.map((t) => `{${t}}`).join(", ")}. ` +
          `Declared tags on this dataset: ${data.inputBarcodeTags.join(", ") || "(none)"}.`,
      );
    }
    if (!data.inputNucleotidesOnly) {
      throw new Error(
        "Selected dataset's barcodes are not nucleotides — FASTQ Demultiplexing requires " +
          "nucleotide barcodes. Use a dataset where every barcode value is [ACGTN]+.",
      );
    }

    return {
      inputRef: data.inputRef,
      tagPattern,
      usedTags: [...used].sort(),
      limitInput: data.runMode === "dry" ? data.limitInput : undefined,
      perProcessMemGB: data.perProcessMemGB,
      perProcessCPUs: data.perProcessCPUs,
    };
  })

  // Dropdown options + per-option spec snapshot, computed atomically. Every
  // option appearing in `options` is guaranteed present in `factsByRef` — the
  // lambda filters out refs whose facts cannot be resolved, so UI can never
  // commit a snapshot with missing facts.
  .output("inputOptions", (ctx): InputOptions => {
    const rawOptions =
      ctx.resultPool.getOptions([
        {
          name: RULES_COLUMN_NAME,
          axes: [{ name: "pl7.app/sampleGroupId" }, { name: "pl7.app/sampleId" }],
        },
      ]) ?? [];
    const options: { ref: PlRef; label: string }[] = [];
    const factsByRef: Record<string, InputFacts> = {};
    for (const opt of rawOptions) {
      const spec = ctx.resultPool.getSpecByRef(opt.ref);
      if (!spec || !isPColumnSpec(spec)) continue;
      const tags = parseTagsAnnotation(spec.annotations?.[ANNOTATION_BARCODE_TAGS]);
      if (!tags) continue;
      const nucleotidesOnly = spec.annotations?.[ANNOTATION_NUCLEOTIDES_ONLY] === "true";
      options.push(opt);
      factsByRef[refKey(opt.ref)] = { tags, nucleotidesOnly };
    }
    return { options, factsByRef };
  })

  .output("demultiplexedFastq", (ctx) =>
    ctx.outputs
      ?.resolve({ field: "demultiplexedFastq", allowPermanentAbsence: true })
      ?.getPColumns(),
  )

  .output("mitoolLogs", (ctx) => {
    if (!ctx.outputs) return undefined;
    const acc = ctx.outputs.resolve({ field: "mitoolLogs", allowPermanentAbsence: true });
    if (!acc) return undefined;
    return parseResourceMap(acc, (a) => a.getLogHandle(), false);
  })

  .output("mitoolProgress", (ctx) => {
    if (!ctx.outputs) return undefined;
    const acc = ctx.outputs.resolve({ field: "mitoolLogs", allowPermanentAbsence: true });
    if (!acc) return undefined;
    return parseResourceMap(acc, (a) => a.getProgressLog(MITOOL_PROGRESS_PREFIX), true);
  })

  .output("reports", (ctx) => {
    if (!ctx.outputs) return undefined;
    const acc = ctx.outputs.resolve({ field: "reports", allowPermanentAbsence: true });
    if (!acc) return undefined;
    return parseResourceMap(acc, (a) => a.getFileHandle(), false);
  })

  .output("qc", (ctx) => {
    const raw = ctx.outputs
      ?.resolve({ field: "qc", allowPermanentAbsence: true })
      ?.getDataAsJson<{ keyLength: number; data: Record<string, number> }>();
    if (!raw) return undefined;
    if (raw.keyLength !== 2) {
      throw new Error(
        `qc PColumnData/Json: expected keyLength=2, got ${raw.keyLength}. ` +
          `Workflow must key flat entries as [sampleGroupId, sampleId].`,
      );
    }
    const rows: { sampleGroupId: string; sampleId: string; matched: number }[] = [];
    for (const [encodedKey, matched] of Object.entries(raw.data ?? {})) {
      const key = JSON.parse(encodedKey) as [string, string];
      rows.push({ sampleGroupId: key[0], sampleId: key[1], matched });
    }
    return rows;
  })

  .output("qcGroupSummary", (ctx) =>
    ctx.outputs
      ?.resolve({ field: "qcGroupSummary", allowPermanentAbsence: true })
      ?.getDataAsJson<Record<string, { total: number; matched: number }>>(),
  )

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

  .templateParams(deriveTemplateParams)

  .title(() => "FASTQ Demultiplexing")

  .sections(() => [
    { type: "link" as const, href: "/" as const, label: "Main" },
    { type: "link" as const, href: "/qc" as const, label: "QC Report" },
  ])

  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
