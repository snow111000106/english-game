---
name: isometric-character-sprites
description: "Use when generating consistent game character sprites, mascot directions, idle poses, and movement frames with stable proportions and anchors. Helpful for original cute boba-factory characters."
license: MIT
---

# Isometric Character Sprites

Source: https://github.com/0xheycat/isometric-game-skills/tree/master/skills/isometric-character-sprites  
Upstream license: MIT, Copyright (c) 2026 0xheycat

## Overview

Characters need consistent proportions, a fixed feet-anchor, and stable style across poses/directions. Otherwise they appear to slide, jitter, or change identity during movement.

## When to Use

- Creating the main mascot or unlockable characters.
- Generating idle / happy / speaking / reward animations.
- Character size or style drifts between images.
- Movement looks like sliding or floating.

## Process

1. Lock art direction, palette, canvas size, and character height.
2. Generate the same original character in required directions or poses.
3. Keep the same baseline and anchor point across all frames.
4. Use fixed seed/settings when available.
5. Clean alpha edges after generation.
6. Test by cycling frames in place; the feet or base must not jump.
7. Store prompt, seed, frame names, and anchor metadata.

## Recommended Poses for This App

- idle-happy
- listening
- speaking
- got-1-star
- got-2-stars
- got-3-stars
- making-boba
- drinking-boba
- unlocked-celebration

## Verification Checklist

- [ ] Same character proportions across all frames.
- [ ] Same feet/base anchor across all frames.
- [ ] No official or copyrighted character copy.
- [ ] Transparent background and clean alpha.
- [ ] Animation preview does not jump or slide.
