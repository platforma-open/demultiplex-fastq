---
"@platforma-open/milaboratories.demultiplex-fastq": patch
"@platforma-open/milaboratories.demultiplex-fastq.workflow": patch
"@platforma-open/milaboratories.demultiplex-fastq.ui": patch
---

- Bump `@platforma-open/milaboratories.software-mitool` to `2.3.1-58-main` and pass `--no-stdout-report` to `mitool parse` so the final report body no longer duplicates into the live per-group log. Saved `report.txt` / `report.json` are unchanged.
- `export-by-sample`: use fixed-schema local filenames (`g<i>.mic`) for each `mitool export-fastq` input. The exec command shape is now a pure function of input count, independent of barcode/groupKey values.
- Settings panel: add help tooltips on the "Sample barcode (SMPL1)" dropdown and the "Tag pattern" field. The tag-pattern tooltip documents the mitool grammar: `{SMPL1}`, `N{n:m}`, `(R1:*)` / `(R2:*)`, `^`, `\`, `|`, and the default pattern.
