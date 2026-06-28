---
name: asset-pipeline-automation
description: "Use when automating generated game assets into a web app: clean PNGs, pack sprites, emit manifests, validate references, and keep art reproducible."
license: MIT
---

# Asset Pipeline Automation

Source: https://github.com/0xheycat/isometric-game-skills/tree/master/skills/asset-pipeline-automation  
Upstream license: MIT, Copyright (c) 2026 0xheycat

## Overview

Manual asset handling does not scale. A small repeatable pipeline should turn generated images into optimized assets referenced by the game.

## When to Use

- Many generated sprites or icons are being added.
- Prompt/source information is getting lost.
- Asset paths break after moving files.
- Images are too large for fast web loading.
- Atlas or manifest data must stay in sync.

## Process

1. Define folders:
   - `src/assets/raw/` for generated originals.
   - `src/assets/processed/` for optimized PNG/WebP/SVG assets.
   - `src/assets/manifest.json` for metadata.
2. Record source prompt, model/tool, seed, date, and license notes.
3. Clean backgrounds where needed.
4. Resize to target dimensions.
5. Optimize file size.
6. Emit or update an asset manifest.
7. Validate every app reference exists.
8. Add a build or npm script once the pipeline stabilizes.

## Suggested Manifest Fields

```json
{
  "id": "strawberry-icon",
  "path": "src/assets/processed/strawberry-icon.png",
  "type": "ingredient-icon",
  "prompt": "...",
  "source": "generated",
  "license": "project-owned/generated",
  "notes": "original, no copyrighted character"
}
```

## Verification Checklist

- [ ] Every asset has prompt/source metadata.
- [ ] Every referenced file exists.
- [ ] Images are optimized for web.
- [ ] Copyright risk has been reviewed.
- [ ] Re-running the pipeline is idempotent.
