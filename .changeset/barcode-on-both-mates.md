---
'@platforma-open/milaboratories.demultiplex-fastq.workflow': minor
'@platforma-open/milaboratories.demultiplex-fastq.model': minor
'@platforma-open/milaboratories.demultiplex-fastq.ui': minor
---

Allow the same barcode tag on both reads of a pair, e.g. `^{BC}(R1:*)\^{BC}(R2:*)`. Only read pairs carrying the sample's barcode on both mates are assigned, which drops PCR-crossover chimeras whose mates come from different samples.
