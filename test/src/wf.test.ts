import type { BlockData, platforma } from "@platforma-open/milaboratories.demultiplex-fastq.model";
import { SamplesAndDataBlockPointer } from "@platforma-open/milaboratories.samples-and-data";
import type { PlRef } from "@platforma-sdk/model";
import { isPlRef, readOutput, uniquePlId, wrapOutputs } from "@platforma-sdk/model";
import type { ML, RawHelpers } from "@platforma-sdk/test";
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

type MultiplexedSample = { label: string; barcode: string };

// Adds and runs Samples & Data with one paired-end group read from
// `assets/<fixture>_R{1,2}.fastq.gz`: one rule per sample on tag BC. Returns its
// block id and the sample ids in `samples` order.
async function addMultiplexedSamples(
  project: ML.Project,
  helpers: RawHelpers,
  fixture: string,
  samples: MultiplexedSample[],
): Promise<{ sndBlockId: string; groupId: string; sampleIds: string[] }> {
  const sndBlockId = await project.addBlock("Samples & Data", SamplesAndDataBlockPointer);
  const groupId = uniquePlId();
  const sampleIds = samples.map(() => uniquePlId());
  const labels = Object.fromEntries(sampleIds.map((id, i) => [id, samples[i].label]));
  const r1Handle = await helpers.getLocalFileHandle(`./assets/${fixture}_R1.fastq.gz`);
  const r2Handle = await helpers.getLocalFileHandle(`./assets/${fixture}_R2.fastq.gz`);

  await project.mutateBlockStorage(sndBlockId, {
    operation: "update-block-data",
    value: {
      metadata: [],
      sampleIds,
      sampleLabelColumnLabel: "Sample Name",
      sampleLabels: labels,
      datasets: [
        {
          id: uniquePlId(),
          label: "Multiplexed",
          content: {
            type: "MultiplexedFastq",
            readIndices: ["R1", "R2"],
            gzipped: true,
            groupLabels: { [groupId]: "Pool" },
            sampleGroups: { [groupId]: labels },
            data: { [groupId]: { R1: r1Handle, R2: r2Handle } },
            barcodeTags: ["BC"],
            barcodeRules: sampleIds.map((sampleId, i) => ({
              ruleId: `r-${samples[i].label}`,
              sampleGroupId: groupId,
              sampleId,
              barcodes: { BC: samples[i].barcode },
            })),
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
  return { sndBlockId, groupId, sampleIds };
}

// Configures and runs a demux block on `inputRef`, returning its outputs.
async function runDemux(
  project: ML.Project,
  helpers: RawHelpers,
  blockId: string,
  inputRef: PlRef,
  tagPattern: string,
) {
  await project.mutateBlockStorage(blockId, {
    operation: "update-block-data",
    value: {
      inputRef,
      inputBarcodeTags: ["BC"],
      inputNucleotidesOnly: true,
      tagPattern,
      limitInput: 100000,
      runMode: "full",
      perProcessMemGB: 2,
      perProcessCPUs: 2,
    } satisfies BlockData,
  });
  await project.runBlock(blockId);
  const state = await helpers.awaitBlockDoneAndGetStableBlockState<typeof platforma>(
    blockId,
    300000,
  );
  return wrapOutputs(defined(state.outputs, "outputs"));
}

function matchedBySample(outputs: Awaited<ReturnType<typeof runDemux>>): Record<string, number> {
  return Object.fromEntries(defined(outputs.qc, "qc").map((r) => [r.sampleId, r.matched]));
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
    const {
      sndBlockId,
      groupId,
      sampleIds: [shortId, longId, otherId],
    } = await addMultiplexedSamples(project, helpers, "prefix_barcodes", [
      { label: "short", barcode: "ACGTACG" },
      { label: "long", barcode: "ACGTACGTTG" },
      { label: "other", barcode: "TGCATGC" },
    ]);
    const demuxBlockId = await project.addBlock("FASTQ Demultiplexing", myBlockSpec);

    // The rules column reaches the demux block through the result pool, as in the UI. The block
    // has not run, so its state is untyped; only the ref is narrowed.
    const optionsState = await awaitStableState(project.getBlockState(demuxBlockId), 30000);
    const optionsOutputs = defined(optionsState.outputs, "outputs");
    const inputRef = firstOptionRef(
      readOutput(defined(optionsOutputs.inputOptions, "inputOptions")),
    );
    expect(optionsOutputs.inputOptions).toMatchObject({
      ok: true,
      value: {
        options: [{ ref: { blockId: sndBlockId } }],
        factsByRef: {
          [`${inputRef.blockId}/${inputRef.name}`]: {
            tags: ["BC"],
            nucleotidesOnly: true,
          },
        },
      },
    });

    const outputs = await runDemux(
      project,
      helpers,
      demuxBlockId,
      inputRef,
      "^{BC}(R1:*)\\^(R2:*)",
    );

    // Each read lands in its own sample. Listed alphabetically, ACGTACG came first and took
    // all 50 "long" reads.
    expect(matchedBySample(outputs)).toEqual({
      [shortId]: 20,
      [longId]: 50,
      [otherId]: 10,
    });

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

// Fixture `crossover_R{1,2}.fastq.gz`, paired-end, barcode at the start of BOTH mates:
//   30 pairs GATCGTA / GATCGTA — sample "a"
//   20 pairs CTAGCAT / CTAGCAT — sample "b"
//   15 pairs GATCGTA / CTAGCAT and 5 pairs CTAGCAT / GATCGTA — PCR-crossover chimeras
// One demux reads the barcode from R1 only, the other requires it on both mates.
blockTest(
  "same barcode tag on both mates drops crossover chimeras",
  { timeout: 600000 },
  async ({ rawPrj: project, helpers, expect }) => {
    const {
      sampleIds: [aId, bId],
    } = await addMultiplexedSamples(project, helpers, "crossover", [
      { label: "a", barcode: "GATCGTA" },
      { label: "b", barcode: "CTAGCAT" },
    ]);
    const r1OnlyBlockId = await project.addBlock("FASTQ Demultiplexing", myBlockSpec);
    const bothBlockId = await project.addBlock("FASTQ Demultiplexing", myBlockSpec);

    const optionsState = await awaitStableState(project.getBlockState(bothBlockId), 30000);
    const inputRef = firstOptionRef(
      readOutput(defined(defined(optionsState.outputs, "outputs").inputOptions, "inputOptions")),
    );

    // R1 only: each chimera goes to its R1 barcode's sample.
    const r1Only = await runDemux(
      project,
      helpers,
      r1OnlyBlockId,
      inputRef,
      "^{BC}(R1:*)\\^(R2:*)",
    );
    expect(matchedBySample(r1Only)).toEqual({ [aId]: 45, [bId]: 25 });
    // Both mates: only pairs with the sample's barcode on R1 and R2.
    const both = await runDemux(
      project,
      helpers,
      bothBlockId,
      inputRef,
      "^{BC}(R1:*)\\^{BC}(R2:*)",
    );
    expect(matchedBySample(both)).toEqual({ [aId]: 30, [bId]: 20 });
  },
);
