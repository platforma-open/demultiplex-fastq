---
'@platforma-open/milaboratories.demultiplex-fastq': minor
'@platforma-open/milaboratories.demultiplex-fastq.workflow': minor
'@platforma-open/milaboratories.demultiplex-fastq.model': minor
'@platforma-open/milaboratories.demultiplex-fastq.ui': minor
'@platforma-open/milaboratories.demultiplex-fastq.test': patch
---

- Paired-end reads now go to the right sample when one barcode is the start of a longer one. Previously the shorter barcode's sample took them.
- The main page lists sample pairs whose barcodes a read can still match both of.
- A barcode tag can appear on both reads, e.g. `^{BC}(R1:*)\^{BC}(R2:*)`, to keep only read pairs that carry the sample's barcode on both mates.
- The QC Report counts every barcode of a sample that has several.
- Minor bug fixes and improvements.
