---
"@platforma-open/milaboratories.demultiplex-fastq.workflow": minor
"@platforma-open/milaboratories.demultiplex-fastq.model": minor
"@platforma-open/milaboratories.demultiplex-fastq.ui": minor
"@platforma-open/milaboratories.demultiplex-fastq": minor
---

Migrate to `pl7.app/sequencing/multiplexingRules` column from Samples & Data. Drops the separate barcode-source dropdown — barcodes now live inline in the rules column. Adds support for per-sample alternative barcode rows, dual/multi-tag patterns (`{P5}{P7}` etc.), and cross-group merging with per-group rules. Tag pattern uses free-form placeholders matching the dataset's declared tags; mitool sees only canonical S<i> names internally. Breaking change — requires Samples & Data block emitting the new rules column.
