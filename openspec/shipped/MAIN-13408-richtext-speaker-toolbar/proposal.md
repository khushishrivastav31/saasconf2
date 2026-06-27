# MAIN-13408 — RichTextEditor: speaker toolbar restrictions + admin image/video support

## Problem

The previous fix (#401) removed Image and YouTube buttons from the `RichTextEditor` globally.  
That removed them for admins too, which was not intended.

Additionally, the speaker toolbar still exposes formatting options that produce inconsistent styling across submitted papers: font family, font size, headings (H1/H2/H3), text colour, highlight colour, and text alignment (centre/right/justify).

## Goals

1. **Restore image and YouTube** toolbar buttons — but only in admin contexts.
2. **Strip the speaker toolbar** of formatting controls that produce visual inconsistency:
   - Font family and font size dropdowns
   - H1 / H2 / H3 heading buttons
   - Text colour and highlight colour pickers
   - Centre / right / justify alignment buttons (left-align stays; it is the only option for speakers)
3. Admin toolbar remains fully featured (current state + images + YouTube restored).

## Non-goals

- No changes to what the backend stores or renders.
- No changes to the reviewer toolbar.
- No stripping of already-saved formatting — we only limit what speakers can _add_.
