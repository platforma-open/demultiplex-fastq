---
'@platforma-open/milaboratories.demultiplex-fastq.workflow': patch
---

Switch mitool exec to the `memory-from-limits` entrypoint and bump container memory from 16 GiB to 32 GiB on both `mitool parse` (per group) and `mitool export-fastq` (per sample).

Fixes the symptom where jobs reach near-completion then restart: the platform's K8s OOM retry was masking a tail-of-run heap spike. The `:main` entrypoint pins JVM heap to `MaxRAMPercentage=80%` of the container, which on a 16 GiB request leaves only ~12.8 GiB for the JVM — insufficient for the end-of-stream `MultiSampleRun.Writers` flush across many per-tuple mic writers plus `ParseReportAggregator` histogram materialisation. `:memory-from-limits` pins `-Xmx` to the actual container request, and 32 GiB gives ~28.8 GiB usable heap.
