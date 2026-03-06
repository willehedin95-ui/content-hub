# VEO Studio — Reverse Engineering Notes

## Overview
VEO Studio (veo.0xroas.com) is a Next.js app deployed on Vercel that converts a script + settings into a multi-shot video pipeline. It uses Google Gemini for AI (script analysis, image generation) and Kie.ai (Nano Banana) as an alternative image provider. Video generation is via Kie.ai's Veo 3.1 integration.

## Data Model

### Project
```json
{
  "id": "cuid",
  "userId": "cuid",
  "name": "Project name",
  "script": "Full script text (user writes this manually)",
  "style": "Art style description (e.g. 'Photorealistic ugc Vertical selfie-style video')",
  "videoMode": "ugc | cinematic | stylized",
  "userReq": "Additional requirements (free text — framing, lighting, environment, performance notes)",
  "productImageUrl": null | "url",   // Optional product photo upload
  "productInfo": null | "string",     // Product name + visual description
  "maxShots": 3,                      // Maximum shots (user configurable)
  "imageProvider": "google | kie",    // Google Gemini or Kie AI (Nano Banana)
  "status": "DRAFT | RUNNING | COMPLETED | FAILED",
  "resultUrl": null | "url",
  "pipelineData": null,
  "createdAt": "datetime",
  "updatedAt": "datetime"
}
```

### Pipeline Steps (stored in separate `steps` table)
```json
{
  "id": "cuid",
  "projectId": "cuid",
  "step": "EXTRACT_CHARACTERS | GENERATE_CHARACTER_REFS | DESIGN_STORYBOARD | DECOMPOSE_SHOTS | CAMERA_TREE | GENERATE_IMAGE | GENERATE_VIDEO",
  "status": "SUCCESS | FAILED | RUNNING | PENDING",
  "order": 0,           // Sequential order
  "prompt": "Full prompt sent to AI",
  "imageUrl": null | "url",  // Generated image/video URL
  "error": null | "string",
  "durationMs": 3845,
  "metadata": null | JSON,   // e.g. {"shotIdx": 0}, {"characterId": "Young white woman"}, {"reused": true}
  "createdAt": "datetime",
  "updatedAt": "datetime"
}
```

## Settings Page
- **Google Gemini API Key** — Required for script analysis, character extraction, and image generation
- **Kie.ai API Key** — Required for fast Veo 3.1 video generation tasks
- Keys are encrypted at rest, user provides their own

## Project Configuration UI

### Video Mode (3 options)
1. **UGC / Selfie** — iPhone selfie-style talking videos. Ultra-realistic, authentic look.
2. **Cinematic** — Professional film quality with dramatic lighting and color grading.
3. **Stylized / 3D** — Pixar, anime, watercolor — any creative art style you want.

### Script
- Free text area where user writes/pastes the full script
- Character descriptions are EMBEDDED in the script (e.g. "Young white woman with long, straight black hair... says: ...")
- No separate character description field — the AI extracts characters FROM the script

### Product Placement (Toggle)
- Toggle on/off
- When enabled: Product Photo upload, Product Name, Visual Description, Placement Style
- Placement styles: Held in hand, On table, In background, Unboxing, Using it

### Settings
- **Art Style**: Free text (e.g. "Photorealistic ugc Vertical selfie-style video, shot from the driver's seat of a parked car")
- **Additional Requirements**: Long-form free text for detailed directorial instructions (framing, lighting, environment, editing style, performance notes)
- **Maximum Shots (Optional)**: Number input (e.g. 3)
- **Image Generation Provider**: Google Gemini or Kie AI (Nano Banana)
- **Review images before video generation**: Checkbox (default checked)
- **Reuse first generated frame for all subsequent scenes**: Checkbox with special icon — critical for talking head UGC where character stays in same position

## Pipeline Architecture (The Key Insight)

The pipeline runs 7 sequential steps. Each step's output feeds the next. All AI calls go through Google Gemini (for text/analysis) or the selected image provider.

### Step 1: EXTRACT_CHARACTERS
**Input**: The user's script text
**Prompt**: `Extract all characters from the following script: [script]`
**Output**: List of character identifiers (e.g. "Young white woman", "Melatonin Character")
**Purpose**: Parse the script to identify all distinct characters that need reference images

### Step 2: GENERATE_CHARACTER_REFS (one per character)
**Input**: Character name + extracted visual description from script + art style
**Prompt structure**:
```
Generate a single reference sheet showing ONLY this one character: "[name]".
[Visual Description] — detailed appearance from script
[Physical Features] — age, gender, ethnicity, skin tone, hair, body type
[Dynamic Features] — clothing, accessories, props
[Art Style] — e.g. "Photorealistic, cinematic lighting"
[Requirements]
- Show ONLY this single character, nothing else
- Three-view layout: front view, side view, back view
- Clean, simple background (solid white or light gray)
- Consistent proportions across all three views
- No other characters, objects, or text in the image
```
**Output**: A three-view reference sheet image (front/side/back)
**Image provider**: Google Gemini (always, regardless of selected provider)
**Duration**: ~30-130 seconds per character

### Step 3: DESIGN_STORYBOARD
**Input**: Script + character count + style + additional requirements + max shots
**Prompt structure**:
```
Design a storyboard for the script with [N] characters.
Style: [art style]
Requirement: [additional requirements]
CRITICAL REQUIREMENT: Strictly limit each shot to feature AT MOST ONE character visibly on screen.
CRITICAL REQUIREMENT: You MUST strictly limit the storyboard to a MAXIMUM of [maxShots] shots.
Script: [full script]
```
**Output**: Structured storyboard with shot descriptions, visual details, character assignments, dialogue per shot
**Purpose**: Break the script into discrete visual shots with specific directions

### Step 4: DECOMPOSE_SHOTS (one per shot)
**Input**: Storyboard shot description
**Prompt structure**:
```
Decompose shot [N] into first frame, last frame, and motion.

Visual: [detailed shot visual description from storyboard, including character in <angle brackets>]
```
**Output**: First frame description, last frame description, and motion/action between them
**Purpose**: Break each storyboard shot into concrete animation keyframes — what the frame looks like at start, what changes, and what it looks like at end
**Duration**: ~4-10 seconds per shot

### Step 5: CAMERA_TREE
**Input**: Number of cameras and shots
**Prompt**: `Construct camera tree from [N] cameras and [N] shots.`
**Output**: Camera assignments — which camera angle is used for which shot
**Purpose**: Ensures consistent camera work and determines which character ref image feeds each shot
**Duration**: ~1-6 seconds

### Step 6: GENERATE_IMAGE (one per shot, or reused)
**Input**: Shot decomposition first frame + character ref image + style + environment
**For UGC mode** — the prompt is specifically crafted for iPhone authenticity:
```
Generate a photorealistic image of [character description with realistic details].

Camera: smartphone front camera, vertical 9:16 aspect ratio, slightly above eye level,
directly facing the subject. Medium shot from chest up. Natural 35 to 50mm equivalent
lens feel. Slight handheld but mostly steady, fixed selfie position. Natural depth with
very subtle background blur consistent with smartphone optics.

Lighting: Diffused natural daylight evenly illuminates her face. Neutral to slightly warm
tones. No dramatic lighting. Realistic eye reflections.

Environment: [specific environment from script/settings].

Style: authentic UGC selfie style frame from an iPhone front camera recording.
Ultra realistic skin texture with visible pores and true to age facial details.
No filters. No cinematic grading. No text or graphic elements on screen.

REFERENCE MATCHING: Match the subject's face, hair texture, skin tone, and clothing
exactly to the character reference image if provided.
```
**Key feature**: "Reuse first frame" option — when enabled, shot 0's image is reused for all subsequent shots (critical for talking head where character doesn't move/change)
**Image provider**: User's choice (Google Gemini or Kie AI/Nano Banana)
**Duration**: ~30-100 seconds per unique image (0s if reused)

### Step 7: GENERATE_VIDEO (one per shot)
**Input**: Generated image (first frame) + motion description from decomposition + dialogue
**Prompt structure** (for UGC):
```
The camera remains static, framed in a [shot type]. The character with [key visual detail]
performs an on-screen movement: [motion from decomposition].
character says: "[dialogue for this shot]"
```
**Output**: Video clip (~8 seconds) starting from the generated image
**Video provider**: Kie.ai (Veo 3.1)
**Duration**: Submitted as job (~0.3s to submit, actual generation happens async)

## Key Architectural Differences from Our Pipeline

### 1. Script-First, Not Concept-First
VEO Studio starts with a **user-written script** — the user provides the complete script with character descriptions embedded. Our pipeline starts with brainstorm → concept → script generation. They don't generate scripts at all.

### 2. Three-View Character Reference Sheets
They generate **front/side/back reference sheets** on clean backgrounds, not single character portraits. This gives the image generator more visual information for consistency.

### 3. Shot Decomposition into First Frame + Last Frame + Motion
Each shot is decomposed into three components:
- **First frame**: What the image should look like at the START of the clip
- **Last frame**: What should change by the END
- **Motion**: What movement happens between them
This gives the video generator very precise control over what happens in each clip.

### 4. Camera Tree
A dedicated step that maps cameras to shots — ensures consistent camera angles across the video.

### 5. Image Reuse for Talking Head
When "Reuse first generated frame" is checked, they generate ONE image for shot 0 and reuse it for ALL subsequent shots. This is brilliant for UGC talking head videos where the person stays in the same position — it guarantees perfect character consistency because every clip starts from the exact same reference image.

### 6. Google Gemini for All AI Steps
They use Google Gemini for ALL text analysis (character extraction, storyboard, shot decomposition, camera tree) AND for image generation. Kie.ai is only used for video generation (Veo 3.1) and optionally for images (Nano Banana).

### 7. Review Gate Between Images and Videos
The "Review images before video generation" checkbox creates a gate — you can see and regenerate individual shot images before committing to expensive video generation.

### 8. No Brainstorm / No AI Script Generation
The tool does NOT generate scripts or concepts. The user writes the script manually (or uses AI elsewhere). The tool's job is purely: script → character refs → storyboard → images → videos.

## UGC-Specific Image Prompt Analysis

Their UGC image prompt is notable for what it includes:
- "smartphone front camera" (not iPhone specifically)
- "vertical 9:16 aspect ratio"
- "slightly above eye level"
- "Natural 35 to 50mm equivalent lens feel"
- "Slight handheld but mostly steady"
- "very subtle background blur consistent with smartphone optics"
- "Ultra realistic skin texture with visible pores"
- "No filters. No cinematic grading"
- "REFERENCE MATCHING" clause at the end

And what it does NOT include (compared to our approach):
- No mention of "Apple iPhone computational photography pipeline"
- No mention of "flattened midtones" or "mild overexposure on highlights"
- No specific iPhone model
- Simpler, more general "authentic UGC selfie style"

## Product Placement = Product as "Character"

When Product Placement is enabled, the EXTRACT_CHARACTERS step identifies the product as a separate "character":
- Script mentions "HappySleep pillow" → Character extraction outputs both "Swedish Woman" AND "HappySleep Pillow"
- The pillow gets its own GENERATE_CHARACTER_REFS step with a dedicated reference sheet prompt:
  ```
  Generate a single reference sheet showing ONLY this one object/creature: "HappySleep Pillow".
  [Visual Description] A realistic standard-sized ergonomically contoured pillow made of soft fabric,
  likely white or light grey, featuring a prominent curve specifically designed to cradle and support
  the neck...
  ```
- This means when the product appears in shots, it has its own reference image for consistency
- The product ref image is passed alongside the character ref to the image generator

This is elegant — product placement isn't a separate system, it's handled by the same character extraction + reference pipeline.

## Video Prompt Analysis

Their video prompts are MUCH shorter than ours (~200-400 chars):
```
The camera remains static, framed in a medium close-up. The character with long,
straight black hair performs an on-screen movement: her left hand raises slightly
from a resting position, opening its palm and gesturing towards the camera.
character says: "[dialogue]"
```

Key observations:
- Camera is almost always "remains static" for UGC
- Only describes the MOTION that happens (not full scene setup — the image handles that)
- Includes the dialogue as a `character says: "..."` block
- No cinematography block, no lighting, no environment — those are in the IMAGE prompt
- Very focused: image = what it looks like, video prompt = what moves + what's said
