# MAIN-13412 — RichTextEditor: stop link bleed + add unlink controls

## Problem

In the shared `RichTextEditor`, the hyperlink tool has two UX problems reported by speakers (but present in every editor, admin included):

1. **Links "bleed" — you can't stop hyperlinking.** Once a link is applied, text typed immediately after a linked word keeps inheriting the link. Likewise, clicking the Link button with no selection turns everything subsequently typed into a link. The only escapes today are pressing **Enter** (a new paragraph clears the mark) or typing all the text first and applying the link afterward. This is the default TipTap behavior: the link mark is *inclusive* and is carried as a "stored mark."

2. **No discoverable way to unlink.** There is no visible "remove link" control. Removal is technically possible — open the link dialog while the cursor is on a link, clear the URL field, and confirm (`setLink` calls `unsetLink()` on empty input) — but this is completely hidden. A user has no obvious way to remove a link.

## Goals

1. **Break out of links automatically.** Make the link mark non-inclusive so text typed immediately after a hyperlink is *not* linked.
2. **Handle the empty-selection case.** When the Link button is used with no text selected (and the cursor is not already on a link), insert the URL as a discrete linked text node instead of arming a stored mark that bleeds into later typing.
3. **Add discoverable unlink controls (both):**
   - A dedicated **Remove link** toolbar button, enabled only when the cursor is inside a link.
   - A **Remove link** button inside the URL dialog when editing an existing link.
4. Apply to **all editors** — the fix lives in the shared component, so admin and speaker surfaces both benefit. No variant gating.

## Non-goals

- No backend changes — stored HTML and rendering are unaffected.
- No change to what content is allowed; we only change how the link mark extends and how it can be removed.
- No stripping of already-saved links.
- No change to the image/YouTube prompts beyond the shared `PromptDialog` plumbing needed for the dialog Remove button.
