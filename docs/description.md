# Overview

Splits a multiplexed FASTQ dataset into per-sample read files. Each input read is matched against a barcode-aware pattern, routed to the sample whose barcode it carries, and concatenated into one FASTQ output per sample — even when the same sample appears across multiple sample groups.

# What It Does

The block runs `mitool parse` per sample group to assign every read to a barcode bucket, then runs `mitool export-fastq` per sample to produce one FASTQ output per sample. Reads that fail to match any barcode are dropped from the output and counted as unmatched in the per-group statistics.

# Inputs

- **Multiplexed FASTQ dataset.** A FASTQ dataset linked to a sample-group structure (typically produced by the Samples & Data block when sample sheets are imported alongside pooled sequencing files).
- **Sample barcode column.** A metadata column listing the barcode sequence for each sample. Auto-suggested when a metadata column with "barcode" in its label is available.
- **Tag pattern.** A read decomposition rule in the [mitool pattern grammar](https://github.com/milaboratory/mitool). The default `^{SMPL1}N{0:2}(R1:*)\^N{20}(R2:*)` reads the per-sample barcode from the start of R1, allows up to two spacer bases, captures the rest of R1 as the output read, and skips a 20-base UMI/adapter at the start of R2 before capturing the remainder. The `{SMPL1}` placeholder is filled with each sample's barcode at run time.

# Outputs

- **Demultiplexed FASTQ.** One file per sample per read index (R1, R2 for paired-end). Becomes available as a standard FASTQ dataset for downstream blocks (e.g. MiXCR clonotyping, single-cell analysis).
- **Per-sample matched reads.** A QC table on the QC Report page showing matched-read counts per sample, with both percent-of-total and percent-of-group views.
- **Per-group reports.** Each sample group's full mitool parse report (text and JSON), available for download from the per-group detail panel on the Main page.

# Run Modes

- **Preview** — runs the demultiplexer on a limited number of reads per sample group. Use it to sanity-check the tag pattern and barcode column selection before launching a full run.
- **Full run** — processes the entire dataset.

# Cross-Group Sample Merging

When the same sample identifier appears in multiple sample groups (e.g. a sample re-sequenced across pools), the block automatically concatenates that sample's reads from every group into a single output FASTQ pair. No manual merge step is required.
