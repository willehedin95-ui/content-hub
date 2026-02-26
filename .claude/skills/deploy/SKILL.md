---
name: deploy
description: Build, commit, and push Content Hub to Vercel
disable-model-invocation: true
allowed-tools: Bash(npm run build *), Bash(git *)
---

# Deploy Content Hub to Vercel

Build-check, commit all changes, and push to main for Vercel auto-deploy.

## Steps

1. **Build check** — Run `npm run build` in the content-hub directory. If it fails, fix the errors before proceeding.

2. **Stage changes** — Run `git add` for the relevant changed files (not blanket `git add -A`). Skip any `.env` files or credentials.

3. **Commit** — Create a descriptive commit message summarizing what changed. End with:
   ```
   Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
   ```

4. **Push** — Push to main:
   ```bash
   git push origin main
   ```

5. **Report** — Tell the user the git short hash of the pushed commit (e.g. `508b6dd`) so they can verify the deploy is live by checking the version shown in the sidebar footer.

## Important

- Always verify build passes before committing
- Never force push
- The project auto-deploys to Vercel on push to main
