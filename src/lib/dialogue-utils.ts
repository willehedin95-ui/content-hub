/**
 * Pure utility functions for extracting/replacing dialogue in VEO prompts.
 * Client-safe — no server dependencies.
 */

/** Extract the dialogue from a veo_prompt. Looks for: [word][optional punctuation] says: "..." or '...' */
export function extractDialogue(veoPrompt: string): string | null {
  // Allow optional comma/period/etc between the preceding word and "says"
  // Support both double quotes ("...") and single quotes ('...')
  const match = veoPrompt.match(/\w+[,.]?\s+says?:\s*"([^"]*(?:\\.[^"]*)*)"/i)
    || veoPrompt.match(/\w+[,.]?\s+says?:\s*'([^']*(?:\\.[^']*)*)'/i)
    || veoPrompt.match(/\w+[,.]?\s+says?:\s*\\"([^\\]*(?:\\.[^\\]*)*)\\"/i);
  return match ? match[1].replace(/\\"/g, '"') : null;
}

/** Replace the dialogue in a veo_prompt with translated text */
export function replaceDialogue(veoPrompt: string, newDialogue: string): string {
  // Replace the dialogue portion while keeping the rest of the prompt intact
  // Allow optional comma/period between preceding word and "says"
  // Support both double quotes ("...") and single quotes ('...')
  const escaped = newDialogue.replace(/"/g, '\\"');
  const escapedSingle = newDialogue.replace(/'/g, "\\'");

  // Try double quotes first
  let result = veoPrompt.replace(
    /(\w+[,.]?\s+says?:\s*)"[^"]*(?:\\.[^"]*)*"/i,
    `$1"${escaped}"`
  );

  // If no double-quote match, try single quotes
  if (result === veoPrompt) {
    result = veoPrompt.replace(
      /(\w+[,.]?\s+says?:\s*)'[^']*(?:\\.[^']*)*'/i,
      `$1'${escapedSingle}'`
    );
  }

  // If still no match, try escaped double quotes
  if (result === veoPrompt) {
    result = veoPrompt.replace(
      /(\w+[,.]?\s+says?:\s*)\\"[^\\]*(?:\\.[^\\]*)*\\"/i,
      `$1\\"${escaped}\\"`
    );
  }

  return result;
}
