---
'@platforma-open/milaboratories.demultiplex-fastq.workflow': patch
'@platforma-open/milaboratories.demultiplex-fastq': patch
---

Stamp `pl7.app/axisKeys/$idx` annotations on every exported column so
downstream consumers can resolve the actual axis-value sets from this
block's spec alone, without walking the trace back to the upstream
Samples & Data dataset (which carries `sampleGroupId` keys for
`MultiplexedFastq` inputs, not `sampleId`).

- `demultiplexedFastq` — `axisKeys/0` = sampleIds emitted across all
  groups (collected from per-group rules after `usedTags` projection).
- `reports` — `axisKeys/0` = sampleGroupIds (reused verbatim from the
  rules column's `axisKeys/0`).
- `qc` — `axisKeys/0` = sampleGroupIds, `axisKeys/1` = sampleIds.

Bump `@platforma-sdk/block-tools` to 2.7.16.
