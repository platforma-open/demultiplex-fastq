---
'@platforma-open/milaboratories.demultiplex-fastq': minor
'@platforma-open/milaboratories.demultiplex-fastq.workflow': minor
'@platforma-open/milaboratories.demultiplex-fastq.model': minor
'@platforma-open/milaboratories.demultiplex-fastq.ui': minor
---

Fix paired-end demultiplexing when one barcode is a prefix of a longer one: reads carrying the longer barcode no longer go to the shorter barcode's sample. Warn about sample pairs whose barcodes overlap at the start. Upgrade the SDK and mitool (2.3.1-172-main).
