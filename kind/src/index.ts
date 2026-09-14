import { assertParamsObject, defineBlockKind } from "@platforma-sdk/block-kind";
import type { PlRef } from "@platforma-sdk/model";
import { isPlRef } from "@platforma-sdk/model";
import { isBoolean, isString } from "es-toolkit";
import { isArray, isNumber } from "es-toolkit/compat";
import { name, version } from "../package.json" with { type: "json" };

/** Whether a run demultiplexes the whole dataset or only the first reads of each sample group. */
export type RunMode = "dry" | "full";

/**
 * This block's init-params contract — what a creator or a project template supplies to seed a new
 * instance: the multiplexed dataset it reads, the pattern that decomposes each read, and how much
 * of the data to process.
 *
 * `inputBarcodeTags` and `inputNucleotidesOnly` are part of the contract even though they are a
 * copy of the input column's annotations rather than a choice anyone makes. The args lambda sees
 * no result pool, so it validates `tagPattern`'s placeholders against this copy, which the UI
 * writes in the same gesture as `inputRef`. A template that carried the pattern and the input but
 * not the copy would restore a block that reports every placeholder as unknown and claims the
 * dataset's barcodes are not nucleotides, until the user re-picks the input from the dropdown.
 *
 * Excluded on purpose: `perProcessMemGB` and `perProcessCPUs`. Resource allocation belongs to the
 * machine a block runs on, not to configuration a template carries between machines.
 *
 * Every field is optional: a block may be created without a template, and a template need not set
 * all of them.
 */
export type BlockParams = {
  /** The multiplexing rules column, pointing at a dataset in the Samples & Data block. */
  inputRef?: PlRef;
  /** The barcode tags that column declares, snapshotted from its annotations. */
  inputBarcodeTags?: string[];
  /** Whether every barcode value on that column is `[ACGTN]+`, snapshotted the same way. */
  inputNucleotidesOnly?: boolean;
  /** The mitool pattern, in which `{Tag}` placeholders name tags from `inputBarcodeTags`. */
  tagPattern?: string;
  runMode?: RunMode;
  /** Reads per sample group in Preview mode. Carried whatever the mode, as the UI keeps it. */
  limitInput?: number;
};

/**
 * The contract at runtime, for params arriving from a template file rather than typed code. An
 * absent field is always allowed — every param is optional and the block's own default takes
 * over — so each guard runs only on what is present. Keys the contract does not name are dropped
 * by never being read.
 */
function parseInitializationParams(value: unknown): BlockParams {
  assertParamsObject(value);

  const params: Record<string, unknown> = {};
  for (const [field, { is, must }] of Object.entries(CONTRACT)) {
    const v = value[field];
    if (v === undefined) continue;
    if (!is(v)) throw new Error(`'${field}' must be ${must}.`);
    params[field] = v;
  }
  return params as BlockParams;
}

// Identity (`name`/`version`) comes from this package's own `package.json`, so the on-wire
// `{name}@{version}` reference can never drift from what npm publishes; the bundler inlines the
// JSON import.
export const kind = defineBlockKind<BlockParams>({
  name,
  version,
  parseInitializationParams,
});

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

type Guard<T> = (v: unknown) => v is T;

/** A guard plus how to finish the sentence "'field' must be …". */
type Check<T> = { is: Guard<T>; must: string };

function check<T>(is: Guard<T>, must: string): Check<T> {
  return { is, must };
}

const isStringList: Guard<string[]> = (v): v is string[] => isArray(v) && v.every(isString);

const RUN_MODES: readonly string[] = ["dry", "full"];

const isRunMode: Guard<RunMode> = (v): v is RunMode => isString(v) && RUN_MODES.includes(v);

/**
 * A read limit the Preview field can hold: its `minValue` is 1, and the args lambda refuses
 * anything not above zero before a Preview run starts. `NaN` fails both comparisons, so it is
 * refused here too.
 */
const isReadLimit: Guard<number> = (v): v is number => isNumber(v) && v >= 1;

/**
 * The runtime half of the contract. The `satisfies` clause is what stops it drifting: every field
 * `BlockParams` declares must appear here, and each guard must narrow to that field's own type —
 * so adding a param without a check stops compiling.
 */
const CONTRACT = {
  inputRef: check(isPlRef, "a reference to a multiplexing rules column"),
  inputBarcodeTags: check(isStringList, "an array of tag names"),
  inputNucleotidesOnly: check(isBoolean, "a boolean"),
  tagPattern: check(isString, "a string"),
  runMode: check(isRunMode, `one of ${RUN_MODES.map((m) => `'${m}'`).join(", ")}`),
  limitInput: check(isReadLimit, "a number of at least 1"),
} satisfies { [K in keyof Required<BlockParams>]: Check<NonNullable<BlockParams[K]>> };
