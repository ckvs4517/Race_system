# Script rules

- Scripts must run on Windows, macOS, and Linux with Node.js 22 and no npm install.
- Use `process.execPath`, `node:` built-ins, and path-safe spawn argument arrays.
- Never overwrite an input backup; write a new output file.
- Default local preview data must stay under `.dev-data/` and never contact production.
- Successful output should be concise; print captured logs only when a command fails.
