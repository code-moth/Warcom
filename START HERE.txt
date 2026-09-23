WARCOM 3.0 PORTABLE WINDOWS 11 x64 EDITION
========================================

0. Download the latest "WARCOM-{version}-runtime-win-x64.zip" file from the "releases" directory.
1. Right-click the ZIP and choose Extract All. Do not run it inside the ZIP.
2. Open the extracted WARCOM-runtime-win-x64 folder.
3. Double-click Start WARCOM.cmd.
4. Your browser opens http://127.0.0.1:4173.

No installation, Node.js download, compiler, npm, account, or Internet access is needed.
The package includes Node.js v24.19.0, the C++ engine, and the built browser interface.
Keep all folders together in a writable location, such as Documents\WARCOM.
Keep the command window open while playing. Press Ctrl+C to stop WARCOM.

If another WARCOM instance is running, close its command window or use a different port:
    powershell -NoProfile -ExecutionPolicy Bypass -File .\run.ps1 -Port 4180

HOW TO USE
----------
Start with Load training engagement, or add units and assignments yourself.
Save changes before closing. Resolve individual assignments or a full round.
Files & settings provides snapshots, imports and exports. Battle log shows results and undo.
No personal campaign data is included. The initial workspace is empty.

BACKUPS
-------
Your battles are stored in data\ beside this file. Back up that whole folder.
To upgrade, stop WARCOM and copy your data folder into the new extracted package.
The error log is data\server.stderr.log. Keep the package out of read-only system folders.

DOCUMENTATION AND SOURCE
------------------------
README.md explains the rules, workflows, architecture and known differences.
Its setup/build instructions apply to the SOURCE package, not this prebuilt runtime.
VALIDATION.md records the completed tests. MIGRATION_PLAN.md records compatibility decisions.
The matching full source is supplied in WARCOM-source-master.zip, including .git on master.
Source commit: 3f5d38bb62638cde0bb893bca74906f651bd3cb8

The original GPL-3.0 license is in LICENSE. Bundled component notices are in licenses\.
Whip is unavailable because its original weapon table is incomplete. Armor indexing is
corrected by default; Files & settings offers legacy compatibility. Historical DOS random
sequences are not reproduced. The application operates entirely locally.
