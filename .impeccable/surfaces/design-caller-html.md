---
version: 1
slug: "design-caller-html"
primary_target: "design/caller.html"
related_targets: []
---

# Surface: Caller local UI prototype (design/caller.html)

Mode: Operate. One user, watches every real call live, ready to hang up.
Screens: compose (rundown + preflight), on air (live call), as-run log (report), log archive, rehearsal.
Build path: code-led (image generation unavailable: OpenAI key has no credits).

## Direction contract

THESIS: A call runs like a live broadcast. The brief is the rundown, the call is on air, the report is the as-run log. It refuses the agent-dashboard default: sidebar, chat bubbles, status pill.

OWN-WORLD: Warm powder-coated console grey panels; the rundown on cool printout white; backlit tally lamps carry state (red caller mic live, green line to them live, amber thinking, interrupted or rehearsal; other phases light warm white); an LED studio clock with warm white seconds and amber and red limit ticks; flat condensed uppercase legends; mono only for timecodes, log numbers and latency figures in rows. An 8px gutter sets the room; panels keep their own small spacing.

STORY: Chris writes the rundown in place, reads back what it will never say, sees the preflight lamps pass, takes it on air, watches the programme feed with each gap timed, can hang up at any time, and reads an as-run log that says what happened and what needs him. The rundown visibly clears after the call.

FIRST VIEWPORT: Top gallery strip: wordmark, mode keys (On air, Rehearsal, Log), ON AIR lamp at right. Three columns: rundown sheet 360px left; programme monitor centre (standby preflight before, feed during, as-run log after); console right 320px with the studio clock on top, 12 fixed tally cells, answered-by readout, counters, and the TAKE key that becomes the guarded HANG UP key.

FORM: Control Room, candidate 6 of 7 on the grounded list, seed key be5891c5. Signature interaction: TAKE lights the ON AIR lamp and locks the rundown; phase changes swap lamps in fixed cells with a short colour fade (150 to 220ms); at the end the rundown rows strike and clear.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
