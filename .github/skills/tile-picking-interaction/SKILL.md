---
name: tile-picking-interaction
description: "Use when designing pointer, mouse, touch, hover, drag, selection, and feedback interactions for game boards, factories, maps, or draggable reward ingredients."
license: MIT
---

# Tile Picking & Interaction

Source: https://github.com/0xheycat/isometric-game-skills/tree/master/skills/tile-picking-interaction  
Upstream license: MIT, Copyright (c) 2026 0xheycat

## Overview

Good interaction maps the pointer or touch position to the exact object the player expects, then gives immediate visual feedback.

## When to Use

- Clicking or tapping selects the wrong object.
- Adding hover highlights, drag-to-place, or click-to-collect.
- Building a map, factory board, ingredient shelf, or reward garden.
- Touch interactions feel unclear to a child.

## Process

1. Convert pointer position to local game-area coordinates.
2. Account for camera transform, scroll position, and scaling.
3. Hit-test the intended object or tile.
4. Clamp selection to valid bounds.
5. Show hover/pressed/selected feedback before committing.
6. On click/tap/drop, dispatch a clear gameplay action.
7. Test mouse and touch at different viewport sizes.

## Child-Friendly Interaction Rules

- Targets should be large: ideally at least 44×44 CSS pixels.
- Avoid tiny precision clicking.
- Give sound/visual feedback for every successful action.
- Use forgiving drop zones.
- Use disabled states with explanation instead of silent failure.

## Verification Checklist

- [ ] Tapping selects the object the child expects.
- [ ] Hover/pressed/selected feedback is visible.
- [ ] Works with mouse and touch.
- [ ] Works after responsive layout changes.
- [ ] Wrong actions are prevented or explained.
