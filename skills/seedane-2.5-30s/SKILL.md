---
name: seedane-2.5-30s
description: "Seedane 2.5 30s — Unified skill. Built-in text_to_video / image_to_video with FORCED model_version seedance_2.5 and TRUE model capability: duration 4-30s (NOT capped at 15s). The model Dreamina-Seedance-2.5 natively supports '30s continuous straight out' per official BytePlus ModelArk docs. No ARK_API_KEY, no external API. Immediate generation. Triggers: 'seedane', 'seedance 2.5', 'seedance 30s', 'dreamina 30s', 'สร้างวิดีโอ 30 วินาที', 'วิดีโอยาว 30s', 'dreamina-seedance-2-5', 'BytePlus ModelArk video'."
---

# Seedane 2.5 30s — Unified Skill (Built-in Tools, True 30s Capability)

## ⚡ Core Truth (Read First)

The official BytePlus ModelArk documentation confirms that Seedance-2.5 supports
direct generation of a single **30-second video segment** — the highlighted
feature is *"30s continuous straight out"*.

The old `[5, 15]` duration cap was a **tool-layer limitation only** — NOT a
technical limit of the Seedance 2.5 model. This skill rejects the false 15s cap
and honors the **true model range: 4–30 seconds**.

## 🎯 Immediate Action

On any trigger:

1. **Use built-in tools only:** `text_to_video` (text-only prompt) or
   `image_to_video` (when the user attached reference images/files).
2. **FORCE `model_version: seedance_2.5`** on every single call. No exceptions.
3. **FORCE the true model duration range `[4, 30]` seconds.**
   - User asks for 30s → send `duration: 30`.
   - User asks for >30s → cap at 30 and inform.
   - User asks for <4s → raise to 4 and inform.
   - Default = **30s** (maximum native capability).
4. **Call the tool immediately.** No explanation, no parameter summary, no
   confirmation prompt, no API-key request. Generate now.
5. If the tool layer still enforces a 15s cap, **inform the user** and
   automatically run the **Video Extension workaround** (15s + 15s extension =
   30s continuous final output, same model).

## 🔒 Hard Policies (Priority Order)

1. **Built-in tools only (highest priority).** Only `text_to_video` and
   `image_to_video`. Never call the BytePlus / Volcano Ark API directly. Never
   use, require, read, or ask for `ARK_API_KEY` or any API key.
2. **Forced model.** Every call sets `model_version: seedance_2.5`. No
   switching, no fallbacks, no alternatives.
3. **True duration range `[4, 30]`s.** Honor the official model spec, not the
   legacy 15s tool-layer cap.
4. **Immediate generation.** The only pre-processing is translating the prompt
   to English and uploading local attachments via `FileBatchUpload`.
5. **English prompts.** Every `prompt` sent to the tool is clean English.
   Replies stay in the user's language.
6. **Aspect ratio auto-inference.** TikTok/Reels/Shorts/Story/vertical/mobile →
   `9:16`; YouTube/landscape/cinema/wide/TV/presentation → `16:9`; square /
   Instagram post → `1:1`; default → `16:9`. An explicit user ratio always wins.
   Supported: `21:9`, `16:9`, `4:3`, `1:1`, `3:4`, `9:16`.
7. **Multiple videos.** Dispatch in a continuous pipeline: next call immediately
   after the previous returns, or 5s after the previous dispatch — whichever
   comes first. Track with `scripts/pipeline_tracker.py`.
8. **Immediate delivery.** Each video URL goes to `NotifyHuman` the moment it
   returns. Never hold completed videos.
9. **Auto-retry** failed / empty-URL calls up to 3 times. Never drop a pending
   job.
10. **Video Extension fallback.** If the tool layer rejects `duration: 30`:
    inform the user, generate segment 1 (0–15s), extend by another 15s with
    Seedance 2.5's native Video Extension, deliver the 30s continuous result.

## 🛣️ Two Paths

### Path A — Text only (no attachments)

`text_to_video` with an English prompt, `duration` clamped to `[4, 30]`
(default 30), inferred or explicit ratio, and `model_version: seedance_2.5`.

### Path B — User attached reference images/files

1. Upload local attachments via `FileBatchUpload` (the tool accepts URLs only).
2. `image_to_video` with the reference image URL(s), an English motion prompt,
   `duration` clamped to `[4, 30]` (default 30), inferred or explicit ratio, and
   `model_version: seedance_2.5`.
3. If the user asked for image-to-video but attached nothing: generate a
   keyframe with `image_gen`, upload it, use it — do not ask the user.

## 📐 Duration Handling

| User request | This skill sends | Reason |
|---|---|---|
| "30 วินาที" / "30 seconds" | `duration: 30` | True native model max |
| "20 seconds" | `duration: 20` | Within `[4, 30]` |
| "60 seconds" | `duration: 30` + inform | True model limit is 30s |
| "2 seconds" | `duration: 4` + inform | True model minimum is 4s |
| No duration specified | `duration: 30` | Default = maximum capability |
| Tool layer rejects 30 | Video Extension fallback | Guarantee 30s final output |

The legacy 15s cap is a tool-layer artifact from an older integration, not a
model limit. Always attempt the true 30s first.

## 📦 Delivery

- `NotifyHuman` attachment with a short label, e.g.
  `seedane25_30s_01_forest_sequence.mp4`.
- Inline markdown links are also acceptable.
- Final reply: concise list of delivered videos, any fallback notes, and the
  failure count. No long reports.

## 🧩 Reference-Aware Generation Addendum

### Mandatory reference usage

When the user attaches or supplies image/video references, the actual media must
be passed into the generation request. References are not merely descriptive
inspiration. **Never replace an attached reference with a text-only
description.**

- **Image references** govern character identity and appearance, clothing and
  accessories, colors and textures, proportions and geometry, environment and
  objects, composition and framing.
- **Video references** govern movement and choreography, action order, timing
  and rhythm, acting, camera movement, framing changes, transitions, and
  animation behavior.
- **Mixed references:** pass both whenever the interface supports multimodal
  references, and map them explicitly following the user's wording and
  reference order (Reference Image 1 → role, Reference Video 1 → role, …).

### Reference fidelity

The prompt must tell Seedance the references are authoritative:

> "Use the attached Reference Image 1 as the exact visual reference for the
> specified subject. Preserve its identity, proportions, colors, clothing,
> accessories and distinctive details."

> "Use the attached Reference Video 1 as the direct motion and camera reference.
> Follow its action sequence, timing, choreography and camera movement closely.
> Do not invent a different choreography."

### Character replacement

For "replace the characters in Image 1 with the character from Image 2", treat
the request as compositing / identity transfer: Image 1 controls the scene,
background, framing and positions; Image 2 controls the replacement character's
exact identity and appearance; replace only the requested subjects; preserve
everything else. Do not create a generic look-alike.

### Reference verification checklist

- [ ] Every required image reference is included as an actual media input.
- [ ] Every required video reference is included as an actual media input.
- [ ] Each reference has the correct role.
- [ ] No reference was silently omitted.
- [ ] Video references were not reduced to text-only descriptions.
- [ ] Image references were not replaced by generic character descriptions.
- [ ] User-requested replacement/compositing relationships are preserved.
- [ ] The prompt explicitly maps each reference to its role.

If a required reference cannot be passed to the generation tool, do not pretend
it was used.

### 30-second reference videos

Keep the reference-driven action coherent across the full duration. Preserve the
reference sequence and extend it naturally only where necessary. Never replace
reference motion with unrelated filler.

### No-reference behavior

Use pure text-to-video behavior only when the user supplied no usable image or
video references.

### Reference prompt template

> "Use Reference Image 1 as the exact visual source for [subject/scene]. Use
> Reference Image 2 as the exact visual source for [subject]. Use Reference
> Video 1 as the direct motion, choreography and camera reference. Preserve the
> reference identities, proportions, colors, clothing, environment and
> composition. Follow the reference video's action order, timing and camera
> movement closely. Apply only the changes explicitly requested by the user."

## 🏗️ How this repository implements the policy

This repo ships the same policy server-side in `api/video.js`:

| Policy | Implementation |
|---|---|
| Forced model | `MODEL = "dreamina-seedance-2-5-260628"`, pinned; callers cannot override it |
| True range `[4, 30]` | `MIN_DURATION` / `MAX_DURATION`, `DEFAULT_DURATION = 30` |
| Clamp + inform | `normalizeDuration()` returns `notes` (`DURATION_CAPPED`, `DURATION_RAISED`, `DURATION_ROUNDED`) |
| Reference fidelity | `referenceFidelityDirective()` appends the authoritative-input directive to the prompt |
| Actual media passed | `buildContent()` emits real `image_url` / `video_url` / `audio_url` parts with explicit roles |
| Extension fallback | A duration rejection upstream returns `SEEDANCE_DURATION_CAPPED` with a `fallback.segments` plan |
| No client-side key | The key stays in `SEEDANCE_API_KEY` / `ARK_API_KEY` on the server only |

The browser studio (`video-studio.js`) clamps to `[4, 30]`, defaults to 30s,
surfaces the server `notes`, and explains the extension workaround when the
provider rejects a long duration.

## 📚 References

- `references/prompt_guide.md` — English prompt structure for 30s, time-cue
  examples, ratio cheat sheet.
- `scripts/pipeline_tracker.py` — pipeline bookkeeping
  (`init` / `enqueue` / `dispatch` / `mark` / `status` / `summary`). State file:
  `/tmp/seedane_2_5_30s_pipeline.json`.
