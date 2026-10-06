# Seedane 2.5 — 30s Prompt Guide

Every prompt sent to the model is **English**, regardless of the language the
user wrote in. Replies to the user stay in their language.

## 1. Prompt skeleton

```
[Subject + identity] [doing what] in [environment].
[Shot size + lens feel], [camera movement].
[Lighting], [color palette], [mood].
[Style / medium], [frame rate feel], [detail notes].
```

Keep it under ~6,000 characters (the gateway's `MAX_PROMPT_CHARS`). Dense,
concrete nouns beat long adjective chains.

## 2. Writing for a full 30 seconds

A 30s single segment needs a *beat structure*, otherwise the model loops or
stalls. Use explicit time cues:

```
0-6s: wide establishing shot of the misty pine valley at dawn, slow drone push in.
6-14s: cut closer — the traveller in the red coat walks along the ridge, handheld follow.
14-22s: low-angle tracking shot as she crests the ridge, sunlight breaks through the fog.
22-30s: slow pull back to a wide silhouette against the sunrise, camera settles, holds.
```

Rules that keep a 30s take coherent:

- 3–5 beats maximum. More than that reads as a trailer, not a shot.
- One continuous subject thread across every beat.
- Name the camera move in each beat (push in, pull back, pan left, orbit,
  handheld follow, static lock-off).
- Keep lighting and palette consistent unless a change is the point.
- End on a resolvable state (a hold, a settle, a fade-ready wide).

## 3. Durations

| User says | Send | Note to user |
|---|---|---|
| 30s / "as long as possible" / nothing | `30` | — |
| 4–30s | the exact value | — |
| > 30s | `30` | "True model maximum is 30s." |
| < 4s | `4` | "True model minimum is 4s." |

## 4. Ratio cheat sheet

| Signal in the request | Ratio |
|---|---|
| TikTok, Reels, Shorts, Story, vertical, mobile, phone | `9:16` |
| YouTube, landscape, cinema, wide, TV, presentation | `16:9` |
| Square, Instagram feed post | `1:1` |
| Cinemascope, ultrawide, anamorphic | `21:9` |
| Retro TV, classic broadcast | `4:3` |
| Portrait poster, book cover motion | `3:4` |
| Nothing conclusive | `16:9` |

An explicit user ratio always wins. Frame-based and edit/extend modes inherit
the source media's ratio (`adaptive`) — do not fight it.

> This repository's gateway currently forwards `16:9`, `9:16`, `1:1` and
> `adaptive`. Map other requested ratios to the nearest supported one and say so.

## 5. Reference-driven prompts

When references are attached, the prompt must name them and state that they are
authoritative:

```
Use Reference Image 1 as the exact visual source for the traveller: preserve her
face, proportions, red wool coat, leather satchel and boots.
Use Reference Image 2 as the exact visual source for the valley location:
preserve its geography, tree line, rock colors and time of day.
Use Reference Video 1 as the direct motion, choreography and camera reference:
follow its action order, timing and camera movement closely.
Apply only the changes explicitly requested: replace the original walker with
the traveller from Reference Image 1. Keep everything else unchanged.
```

Pair every reference with a one-line role (`purpose`), because the gateway turns
those lines into an explicit `@Image 1: …` mapping block in the prompt.

## 6. Negative guidance that actually helps

Short and specific:

```
No text overlays, no watermarks, no extra limbs, no face morphing between beats,
no sudden style change, no duplicated subject.
```

## 7. Worked examples

**Text-to-video, vertical, 30s**

```
A street-food vendor in Bangkok assembling a bowl of boat noodles at night.
0-7s: close macro of broth pouring, steam rising, handheld, shallow depth of field.
7-15s: hands drop noodles and herbs into the bowl, slow push in.
15-23s: pull back to reveal the vendor smiling under warm market lights.
23-30s: slow rise to a wide of the whole stall, neon reflections on wet pavement.
Warm tungsten and neon palette, shallow depth of field, photoreal, 24fps film look.
No text overlays, no watermarks.
```
Ratio `9:16`, duration `30`, resolution `720p`.

**Image reference → motion, landscape, 30s**

```
Use Reference Image 1 as the exact visual source for the character and her
costume. Preserve identity, proportions, colors and accessories exactly.
0-8s: she stands still on the cliff edge, wind moving her coat, static lock-off.
8-18s: she turns toward camera, slow orbit left around her.
18-26s: she steps forward, handheld follow from behind at shoulder height.
26-30s: camera settles into a wide silhouette against the sea, holds.
Overcast grey-blue palette, soft diffused light, photoreal, 24fps.
No face morphing, no costume changes, no added characters.
```
Ratio `16:9`, duration `30`, resolution `720p`.
