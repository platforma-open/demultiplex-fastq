import type { BlockParams } from "@platforma-open/milaboratories.demultiplex-fastq.kind";
import type { BlockData } from "./index";

/**
 * What a project template carries out of a configured block — the mirror image of
 * `initBlockData`, and the reason the two must be read together: a field added to the contract
 * but not to this function is silently dropped from every template exported afterwards.
 *
 * The two snapshot fields travel with `inputRef` because the args lambda validates the pattern
 * against them and cannot re-read the column itself; the resource-allocation fields are left out
 * for the reason the contract records.
 */
export function deriveTemplateParams(data: BlockData): BlockParams {
  return {
    inputRef: data.inputRef,
    inputBarcodeTags: data.inputBarcodeTags,
    inputNucleotidesOnly: data.inputNucleotidesOnly,
    tagPattern: data.tagPattern,
    runMode: data.runMode,
    limitInput: data.limitInput,
  };
}
