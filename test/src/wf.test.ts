import { awaitStableState, blockTest } from "@platforma-sdk/test";
import { DemultiplexFastqBlockPointer as myBlockSpec } from "this-block";

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
