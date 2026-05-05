---
'@platforma-open/milaboratories.demultiplex-fastq.workflow': patch
'@platforma-open/milaboratories.demultiplex-fastq': patch
---

Bump bundled mitool to 2.3.1-59-main, which includes milib 3.5.0-22-master with the fdatasync-on-close fix. Resolves source-file hash mismatch on networked filesystems (NFS/EFS) where empty-file SHA-256 was read instead of the actual content.

Also bump `@platforma-sdk/block-tools` to 2.7.19.
