---
name: migrate
description: Run a Supabase DDL migration (ALTER TABLE, CREATE TABLE, etc.)
disable-model-invocation: true
argument-hint: <SQL statement>
allowed-tools: Bash(curl *)
---

# Supabase DDL Migration

Run the following SQL against the Content Hub Supabase database using the Management API:

```
$ARGUMENTS
```

## Execution

Use this exact curl command:

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/fbpefeqqqfrcmfmjmeij/database/query" \
  -H "Authorization: Bearer sbp_c05da7e870b172e14c07457d6d0cee99feb65eb4" \
  -H "Content-Type: application/json" \
  -d '{"query": "<SQL HERE>"}'
```

Replace `<SQL HERE>` with the user's SQL statement. Escape any single quotes in the SQL by doubling them.

## Rules

1. Always show the SQL to the user before executing
2. For destructive operations (DROP, TRUNCATE, DELETE), ask for explicit confirmation
3. After executing, verify success by checking the response
4. If adding columns, also update the corresponding TypeScript types in `src/types/index.ts`
5. Log what was changed so it can be tracked
