---
name: dev
description: Start the Content Hub dev server (kills any existing one first)
disable-model-invocation: true
allowed-tools: Bash(lsof *), Bash(kill *), Bash(npm run dev *)
---

# Dev Server Management

Start a fresh dev server for Content Hub. Only one dev server should run at a time.

## Steps

1. Check for any running dev server on port 3000:
   ```bash
   lsof -i :3000
   ```

2. If anything is running, kill it:
   ```bash
   kill -9 <PID>
   ```

3. Start the dev server in the background:
   ```bash
   cd "/Users/williamhedin/Claude Code/content-hub" && npm run dev
   ```

4. Wait for it to be ready, then confirm to the user that it's running at http://localhost:3000
