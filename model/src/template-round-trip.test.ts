import { kind } from "@platforma-open/milaboratories.demultiplex-fastq.kind";
import type { PlRef } from "@platforma-sdk/model";
import { describe, expect, it } from "vitest";
import type { BlockData } from "./index";
import { deriveTemplateParams, initBlockData } from "./index";

/**
 * Export a block's data as a template would, then create a block from it.
 *
 * The `JSON` hop is deliberate: a template is a file, so anything that survives only in memory
 * is not actually carried. What comes back is a fresh block's data, which is what a scientist
 * applying the template gets.
 */
const roundTrip = (data: BlockData): BlockData =>
  initBlockData(
    kind.parseInitializationParams(JSON.parse(JSON.stringify(deriveTemplateParams(data)))),
  );

const INPUT_REF: PlRef = { __isRef: true, blockId: "b1", name: "multiplexingRules" };

/** A fully configured block: every field the contract carries, none of them at its default. */
const configured: BlockData = {
  ...initBlockData(),
  inputRef: INPUT_REF,
  inputBarcodeTags: ["P5", "P7"],
  inputNucleotidesOnly: true,
  tagPattern: "^{P5}(R1:*)\\^{P7}(R2:*)",
  runMode: "dry",
  limitInput: 25_000,
};

describe("the template round trip", () => {
  it("carries every field the contract names", () => {
    const restored = roundTrip(configured);
    expect(restored.inputRef).toEqual(INPUT_REF);
    expect(restored.inputBarcodeTags).toEqual(["P5", "P7"]);
    expect(restored.inputNucleotidesOnly).toBe(true);
    expect(restored.tagPattern).toBe("^{P5}(R1:*)\\^{P7}(R2:*)");
    expect(restored.runMode).toBe("dry");
    expect(restored.limitInput).toBe(25_000);
  });

  it("is idempotent — a second pass changes nothing", () => {
    expect(roundTrip(roundTrip(configured))).toEqual(roundTrip(configured));
  });

  it("carries the values a `??` default would swallow", () => {
    const falsy: BlockData = { ...configured, tagPattern: "", inputNucleotidesOnly: false };
    const restored = roundTrip(falsy);
    expect(restored.tagPattern).toBe("");
    expect(restored.inputNucleotidesOnly).toBe(false);
  });

  it("keeps the snapshot and the input together, so Run is not blocked on re-picking", () => {
    // Without the two snapshot fields the args lambda would report every placeholder as unknown
    // and claim the dataset's barcodes are not nucleotides, for a block that is fully configured.
    const restored = roundTrip(configured);
    expect(restored.inputBarcodeTags).toEqual(configured.inputBarcodeTags);
    expect(restored.inputNucleotidesOnly).toBe(configured.inputNucleotidesOnly);
  });

  it("copies the tag list rather than sharing it", () => {
    const restored = roundTrip(configured);
    expect(restored.inputBarcodeTags).not.toBe(configured.inputBarcodeTags);
  });

  it("carries a half-configured block — an input chosen but no pattern written yet", () => {
    const restored = roundTrip({
      ...initBlockData(),
      inputRef: INPUT_REF,
      inputBarcodeTags: ["P5"],
      inputNucleotidesOnly: true,
    });
    expect(restored.inputRef).toEqual(INPUT_REF);
    expect(restored.tagPattern).toBe("");
    expect(restored.limitInput).toBe(100_000);
    expect(restored.runMode).toBe("full");
  });

  it("gives an untouched block back unchanged", () => {
    expect(roundTrip(initBlockData())).toEqual(initBlockData());
  });

  it("does not carry resource allocation", () => {
    const restored = roundTrip({ ...configured, perProcessMemGB: 128, perProcessCPUs: 64 });
    expect(restored.perProcessMemGB).toBe(32);
    expect(restored.perProcessCPUs).toBe(8);
  });
});
