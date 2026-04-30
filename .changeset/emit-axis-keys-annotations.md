---
'@platforma-open/milaboratories.demultiplex-fastq.workflow': patch
'@platforma-open/milaboratories.demultiplex-fastq': patch
---

Stamp `pl7.app/axisKeys/$idx` annotations on every exported column so
downstream consumers can resolve the actual axis-value sets from this
block's spec alone, without walking the trace back to the upstream
Samples & Data dataset (which carries `sampleGroupId` keys for
`MultiplexedFastq` inputs, not `sampleId`).

Both sets derive from `perGroupRows` — groups and samples that actually
reach demux-group with at least one valid alternative after the
`usedTags` projection. Sourcing groups from the rules column's
`axisKeys/0` would over-list: a group can be present in the upstream
dataset (and so in the rules' annotation) while having no rule cells
or with every alternative dropped as incomplete — demux-group returns
nulls for it and it is flattened out of reports/qc.

- `demultiplexedFastq` — `axisKeys/0` = sampleIds.
- `reports` — `axisKeys/0` = sampleGroupIds.
- `qc` — `axisKeys/0` = sampleGroupIds, `axisKeys/1` = sampleIds.

Bump `@platforma-sdk/block-tools` to 2.7.16.
