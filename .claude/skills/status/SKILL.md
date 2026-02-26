---
name: status
description: Quick project health check — git status, running servers, recent commits
disable-model-invocation: true
allowed-tools: Bash(git *), Bash(lsof *), Bash(npm run build *)
---

# Content Hub Status Check

Give a quick overview of the project's current state.

## Gather

Run these in parallel:

1. **Git status**:
   ```bash
   cd "/Users/williamhedin/Claude Code/content-hub" && git status --short
   ```

2. **Recent commits**:
   ```bash
   cd "/Users/williamhedin/Claude Code/content-hub" && git log --oneline -5
   ```

3. **Dev server**:
   ```bash
   lsof -i :3000 2>/dev/null | head -5
   ```

4. **Current branch**:
   ```bash
   cd "/Users/williamhedin/Claude Code/content-hub" && git branch --show-current
   ```

## Report

Summarize in a compact format:
- Branch + uncommitted changes count
- Last 5 commits (one-liners)
- Dev server running? (yes/no + PID)
