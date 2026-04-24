---
"@platforma-open/milaboratories.demultiplex-fastq": minor
"@platforma-open/milaboratories.demultiplex-fastq.workflow": minor
"@platforma-open/milaboratories.demultiplex-fastq.model": minor
"@platforma-open/milaboratories.demultiplex-fastq.ui": minor
---

Initial release: FASTQ demultiplexing block.

Splits a multiplexed FASTQ dataset into per-sample FASTQs using `mitool parse` + `mitool export-fastq`. Cross-group merging for samples that appear in multiple sample groups is handled via multi-input `export-fastq` (mitool 2.3.1-57-main).

- **Main page:** per-sample-group table with live progress, a "Done" signal driven by the report file landing, a Matched/Unmatched stacked bar, and a detail modal with Logs + Report tabs.
- **QC Report page:** per-sample matched-read counts with "By sample" / "Split by group" toggle and percent-of-total / percent-of-group columns.
- **Settings:** multiplexed-FASTQ linker + barcode-source columns, tag pattern (mitool grammar), Preview vs Full run mode with a reads-per-group limit.
- **Workflow:** single-anchor bundle + `pframes.processColumn` dispatch; per-group `mitool parse` emits mics, reports (txt + json), barcode-to-sample map, and a streamed log; cross-group export-by-sample ephemeral produces the flat `[sampleId, readIndex]` FASTQ dataset; per-group QC ephemeral decodes `parseReport.perSampleMatched` back to sampleIds.
- **Pinned:** `@platforma-open/milaboratories.software-mitool` at `2.3.1-57-main`.

Publishes as unstable (`--unstable` on `block-tools publish`); promote via the existing `mark-stable` script when ready.
