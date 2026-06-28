---
name: layer-game-assets
description: "AI game asset creation skill for generating images, sprites, textures, UI elements, audio, 3D models, editing, upscaling, and background removal. Use when creating game images or production-ready learning-game assets."
license: MIT
---

# Layer — AI Game Asset Creation

Source: https://github.com/layerai/skills  
Upstream license: MIT, Copyright (c) 2026 Layer AI

## When to Use

Use this skill when the game needs:

- Character concepts, sprites, icons, textures, UI elements, illustrations
- Pixel art / game sprites / tile assets
- Environment or concept art
- Stylized characters and NPCs
- Image editing, recoloring, restyling, inpainting, outpainting
- Upscaling or enhancement
- Background removal, transparency, vectorization, tileable textures
- Sound effects or other game audio assets

## Safe Art Direction Rules

- Do not copy protected game characters or official assets.
- Use the child’s preferences only as high-level inspiration, e.g. “cute round pink fantasy mascot”, not “Kirby clone”.
- Prefer original strawberry-boba-factory characters, ingredients, machines, UI stickers, and rewards.
- Keep prompts age-appropriate, cheerful, non-scary, and readable.

## Generation Workflow

1. Define the exact asset type: character, ingredient, machine, background, UI icon, reward, sticker, button, animation frame.
2. Define constraints: transparent PNG, square canvas, simple silhouette, no text, no watermark, child-safe.
3. Draft 2–3 prompt variants.
4. Generate a small batch first.
5. Pick the best result and refine.
6. Remove background / clean edges if the asset is a sprite.
7. Save source prompt and final asset path in `src/assets/README.md` or an asset manifest.
8. Export a backup copy of the generated asset.

## Prompt Template

```text
Original cute strawberry boba factory game asset, [subject], round soft cartoon shapes,
pastel pink and cream palette, child-friendly, happy expression, simple silhouette,
clean vector-like shading, transparent background, no text, no watermark, high readability,
mobile game UI style
```

## Verification Checklist

- [ ] Asset is original and not a copy of an existing protected character.
- [ ] The silhouette is clear at small sizes.
- [ ] No text, watermark, signature, or unwanted logo is present.
- [ ] Background is transparent if it is a sprite/icon.
- [ ] Colors match the game palette.
- [ ] Prompt and generation settings are recorded.
