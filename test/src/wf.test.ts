import type { BlockData, platforma } from "@platforma-open/milaboratories.demultiplex-fastq.model";
import { SamplesAndDataBlockPointer } from "@platforma-open/milaboratories.samples-and-data";
import type { PlRef } from "@platforma-sdk/model";
import { isPlRef, readOutput, uniquePlId, wrapOutputs } from "@platforma-sdk/model";
import { awaitStableState, blockTest } from "@platforma-sdk/test";
import { DemultiplexFastqBlockPointer as myBlockSpec } from "this-block";

function defined<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`${what} is undefined`);
  return value;
}

function firstOptionRef(inputOptions: unknown): PlRef {
  if (typeof inputOptions !== "object" || inputOptions === null || !("options" in inputOptions)) {
    throw new Error(`inputOptions has no options: ${JSON.stringify(inputOptions)}`);
  }
  const { options } = inputOptions;
  if (!Array.isArray(options) || options.length === 0) {
    throw new Error(`inputOptions.options is empty: ${JSON.stringify(options)}`);
  }
  const first: unknown = options[0];
  const ref = typeof first === "object" && first !== null && "ref" in first ? first.ref : undefined;
  if (!isPlRef(ref)) throw new Error(`first option has no PlRef: ${JSON.stringify(first)}`);
  return ref;
}

// A block created with no template goes through the kind's own init path, so this covers the
// wiring the kind package introduced as well as the model's empty-project behaviour.
blockTest("empty inputs", { timeout: 20000 }, async ({ rawPrj: project, expect }) => {
  const blockId = await project.addBlock("FASTQ Demultiplexing", myBlockSpec);

  const stableState = await awaitStableState(project.getBlockState(blockId), 15000);

  // No Samples & Data block in the project, so nothing declares multiplexing rules.
  expect(stableState.outputs).toMatchObject({
    inputOptions: { ok: true, value: { options: [], factsByRef: {} } },
  });
});

// Fixture `prefix_barcodes_R{1,2}.fastq.gz`, paired-end, barcode at the start of R1:
//   20 reads ACGTACG    (7 nt)  — "short"
//   50 reads ACGTACGTTG (10 nt) — "long"; ACGTACG is its prefix
//   10 reads TGCATGC    (7 nt)  — "other", unrelated control
// Every read matches its own barcode exactly. Inserts after "short" never start with TTG.
blockTest(
  "barcodes of different lengths, one a prefix of another",
  { timeout: 600000 },
  async ({ rawPrj: project, helpers, expect }) => {
    const sndBlockId = await project.addBlock("Samples & Data", SamplesAndDataBlockPointer);
    const demuxBlockId = await project.addBlock("FASTQ Demultiplexing", myBlockSpec);

    const groupId = uniquePlId();
    const shortId = uniquePlId();
    const longId = uniquePlId();
    const otherId = uniquePlId();
    const r1Handle = await helpers.getLocalFileHandle("./assets/prefix_barcodes_R1.fastq.gz");
    const r2Handle = await helpers.getLocalFileHandle("./assets/prefix_barcodes_R2.fastq.gz");

    await project.mutateBlockStorage(sndBlockId, {
      operation: "update-block-data",
      value: {
        metadata: [],
        sampleIds: [shortId, longId, otherId],
        sampleLabelColumnLabel: "Sample Name",
        sampleLabels: { [shortId]: "short", [longId]: "long", [otherId]: "other" },
        datasets: [
          {
            id: uniquePlId(),
            label: "Multiplexed",
            content: {
              type: "MultiplexedFastq",
              readIndices: ["R1", "R2"],
              gzipped: true,
              groupLabels: { [groupId]: "Pool" },
              sampleGroups: {
                [groupId]: { [shortId]: "short", [longId]: "long", [otherId]: "other" },
              },
              data: { [groupId]: { R1: r1Handle, R2: r2Handle } },
              barcodeTags: ["BC"],
              barcodeRules: [
                {
                  ruleId: "r-short",
                  sampleGroupId: groupId,
                  sampleId: shortId,
                  barcodes: { BC: "ACGTACG" },
                },
                {
                  ruleId: "r-long",
                  sampleGroupId: groupId,
                  sampleId: longId,
                  barcodes: { BC: "ACGTACGTTG" },
                },
                {
                  ruleId: "r-other",
                  sampleGroupId: groupId,
                  sampleId: otherId,
                  barcodes: { BC: "TGCATGC" },
                },
              ],
            },
          },
        ],
        h5adFilesToPreprocess: [],
        seuratFilesToPreprocess: [],
        suggestedImport: false,
      },
    });
    await project.runBlock(sndBlockId);
    await helpers.awaitBlockDone(sndBlockId, 120000);

    // The rules column reaches the demux block through the result pool, as in the UI. The block
    // has not run, so its state is untyped; only the ref is narrowed.
    const optionsState = await awaitStableState(project.getBlockState(demuxBlockId), 30000);
    const optionsOutputs = defined(optionsState.outputs, "outputs");
    expect(optionsOutputs.inputOptions).toMatchObject({
      ok: true,
      value: { options: [{ ref: { blockId: sndBlockId } }] },
    });
    const inputRef = firstOptionRef(
      readOutput(defined(optionsOutputs.inputOptions, "inputOptions")),
    );
    expect(optionsOutputs.inputOptions).toMatchObject({
      value: {
        factsByRef: {
          [`${inputRef.blockId}/${inputRef.name}`]: { tags: ["BC"], nucleotidesOnly: true },
        },
      },
    });

    await project.mutateBlockStorage(demuxBlockId, {
      operation: "update-block-data",
      value: {
        inputRef,
        inputBarcodeTags: ["BC"],
        inputNucleotidesOnly: true,
        tagPattern: "^{BC}(R1:*)\\^(R2:*)",
        limitInput: 100000,
        runMode: "full",
        perProcessMemGB: 2,
        perProcessCPUs: 2,
      } satisfies BlockData,
    });
    await project.runBlock(demuxBlockId);
    const state = await helpers.awaitBlockDoneAndGetStableBlockState<typeof platforma>(
      demuxBlockId,
      300000,
    );
    const outputs = wrapOutputs(defined(state.outputs, "outputs"));

    // Each read lands in its own sample. Listed alphabetically, ACGTACG came first and took
    // all 50 "long" reads.
    const matched = Object.fromEntries(
      defined(outputs.qc, "qc").map((r) => [r.sampleId, r.matched]),
    );
    expect(matched).toEqual({ [shortId]: 20, [longId]: 50, [otherId]: 10 });

    expect(outputs.barcodeOverlaps).toEqual({
      tags: ["BC"],
      pairs: [
        {
          sampleGroupId: groupId,
          longer: { sampleId: longId, barcodes: ["ACGTACGTTG"] },
          shorter: { sampleId: shortId, barcodes: ["ACGTACG"] },
        },
      ],
    });
  },
);
