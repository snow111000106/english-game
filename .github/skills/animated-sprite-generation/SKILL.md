---
name: animated-sprite-generation
description: "Use when creating short looping game animations such as boba bubbles, milk pouring, strawberry sparkle, reward bursts, mascot idle motion, or factory machine movement."
license: MIT
---

# Animated Sprite Generation

Source: https://github.com/0xheycat/isometric-game-skills/tree/master/skills/animated-sprite-generation  
Upstream license: MIT, Copyright (c) 2026 0xheycat

## Overview

2D game animation is often frame-based. Short loops should keep lighting, scale, silhouette, and anchor stable while only the intended part moves.

## When to Use

- Boba bubbles floating in a cup.
- Strawberry sparkle reward effects.
- Milk or tea pouring into a cup.
- Mascot idle bounce.
- Factory machine buttons and mixers.

## Process

1. Decide frame count: usually 4–8 frames for simple UI loops.
2. Define fixed canvas size and anchor point.
3. Generate or draw frames with stable style and lighting.
4. Vary only the motion phrase per frame.
5. Assemble frames into a horizontal strip or CSS animation sequence.
6. Preview the loop at 6–12 FPS.
7. Check that the last frame transitions cleanly to the first.

## Prompt Pattern

```text
Original cute strawberry boba game animation frame [N of 6], [subject motion phase],
same character proportions, same camera angle, same lighting, transparent background,
pastel cartoon style, no text, no watermark
```

## Verification Checklist

- [ ] Loop is seamless.
- [ ] Only intended parts move.
- [ ] Canvas size and anchor are identical for every frame.
- [ ] No flicker in lighting or style.
- [ ] Frame count is small enough for web performance.
