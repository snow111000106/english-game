---
name: image-prompt-expert
description: "Expert workflow for crafting high-quality prompts for image generation and editing models. Use when creating or improving visual prompts for cute game assets, UI, characters, backgrounds, sprites, and reward items."
---

# Image Prompt Expert

Source: https://github.com/florencevision/grok-skills/tree/main/skills/image-prompt-expert  
Adapted locally for this children’s English learning game. Check upstream license before copying external content verbatim.

## Purpose

Help turn a vague visual idea into precise, safe, repeatable image-generation prompts.

## Core Principles

- Be specific: subject, action, environment, mood, lighting, camera/composition, color palette, style, output format.
- Put the most important subject first.
- Use constraints for production assets: transparent background, no text, no watermark, simple silhouette, consistent palette.
- Iterate from feedback: keep what works, change one or two things at a time.
- Avoid copyrighted characters and official game-art names in final prompts.

## Prompt Structure

```text
[Original subject/action], [environment/setting], [mood], [lighting], [composition],
[style], [palette], [technical constraints], [negative constraints]
```

## Strawberry Boba Factory Examples

### Character

```text
Original cute round pink berry mascot for a children's English learning game,
holding a strawberry boba cup, happy face, tiny red shoes, soft pastel cartoon style,
simple silhouette, clean vector-like shading, transparent background, no text, no watermark
```

### Ingredient Icon

```text
Original mobile game ingredient icon, shiny strawberry milk tea pearl, soft round shape,
pastel pink highlight, sticker style, centered composition, transparent background,
no text, no watermark, readable at 64px
```

### Factory Machine

```text
Original cute strawberry boba drink mixer machine, toy-like factory equipment,
pink cream and mint colors, rounded corners, small bubbles and strawberries,
children's educational game style, front-facing 2D icon, transparent background,
no text, no watermark
```

## Negative Prompt Suggestions

Use when the model supports negative prompts:

```text
copyrighted character, official mascot, logo, text, watermark, signature, scary, realistic,
complex background, cluttered, blurry, low quality, extra limbs, distorted face
```

## Iteration Workflow

1. Ask what asset is needed and where it appears in the game.
2. Draft 2–3 prompts with slightly different styles.
3. Generate or hand off to the image model/tool.
4. Review: shape, age-appropriateness, readability, palette, copyright risk.
5. Refine with precise changes.
6. Record the final prompt near the generated asset.
