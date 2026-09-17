---
name: Caller
description: A local control room for one person to write a rundown, watch a telephone call on air, and read the as-run log.
colors:
  console: "#2f302b"
  console-raised: "#383933"
  console-well: "#232420"
  edge: "#1d1e1a"
  rule: "#4a4b44"
  legend: "#e4e2d8"
  legend-dim: "#a4a296"
  lamp-off: "#3f403a"
  lamp-off-legend: "#b3b1a5"
  red-glass: "#4a2622"
  paper: "#e9ebe8"
  paper-rule: "#c3c7c0"
  ink: "#1b1c18"
  ink-dim: "#585b54"
  red: "#c2301f"
  red-lit-legend: "#fff4ea"
  red-text: "#f07a6d"
  green: "#3e9b5c"
  amber: "#e3a62a"
  lit-ink: "#17130c"
typography:
  display:
    fontFamily: "Barlow Condensed, Barlow, system-ui, sans-serif"
    fontSize: "34px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "0.01em"
  clock:
    fontFamily: "Barlow Condensed, Barlow, system-ui, sans-serif"
    fontSize: "50px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.02em"
  wordmark:
    fontFamily: "Barlow Condensed, Barlow, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.14em"
  key:
    fontFamily: "Barlow Condensed, Barlow, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.1em"
  headline:
    fontFamily: "Barlow Condensed, Barlow, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.1em"
  readout:
    fontFamily: "Barlow Condensed, Barlow, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.02em"
  event:
    fontFamily: "Barlow Condensed, Barlow, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.6
    letterSpacing: "0.02em"
  label-large:
    fontFamily: "Barlow Condensed, Barlow, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.08em"
  label:
    fontFamily: "Barlow Condensed, Barlow, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.08em"
  label-small:
    fontFamily: "Barlow Condensed, Barlow, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.07em"
  body:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tnum"
  body-small:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  note:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.4
  timecode:
    fontFamily: "Red Hat Mono, ui-monospace, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.9
rounded:
  sm: "2px"
  md: "3px"
  lg: "4px"
  guard: "7px"
  lamp: "50%"
spacing:
  unit: "8px"
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
components:
  gallery-strip:
    backgroundColor: "{colors.console-raised}"
    textColor: "{colors.legend}"
    height: "56px"
    padding: "0 24px"
  mode-key:
    backgroundColor: "{colors.console}"
    textColor: "{colors.legend-dim}"
    typography: "{typography.label-large}"
    rounded: "{rounded.md}"
    height: "32px"
    padding: "0 14px"
  mode-key-pressed:
    backgroundColor: "{colors.legend}"
    textColor: "{colors.lit-ink}"
  onair-lamp-off:
    backgroundColor: "{colors.red-glass}"
    textColor: "#c9968c"
    rounded: "{rounded.md}"
    height: "34px"
    width: "112px"
  onair-lamp-air:
    backgroundColor: "{colors.red}"
    textColor: "{colors.red-lit-legend}"
  onair-lamp-rehearsal:
    backgroundColor: "{colors.amber}"
    textColor: "{colors.lit-ink}"
  rundown-sheet:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    width: "360px"
  rundown-field:
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "0"
    padding: "4px 0"
  rundown-stamp:
    textColor: "{colors.ink-dim}"
    typography: "{typography.label-small}"
    rounded: "{rounded.sm}"
    padding: "5px 8px"
  rundown-stamp-locked:
    backgroundColor: "{colors.red}"
    textColor: "{colors.red-lit-legend}"
  rundown-button:
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "5px 10px"
  rundown-button-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  line-type-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.label-small}"
    padding: "7px 2px"
  programme-monitor:
    backgroundColor: "{colors.console-well}"
    textColor: "{colors.legend}"
    rounded: "{rounded.md}"
  panel:
    backgroundColor: "{colors.console-raised}"
    textColor: "{colors.legend}"
    rounded: "{rounded.md}"
    padding: "14px"
  tally-cell:
    backgroundColor: "{colors.lamp-off}"
    textColor: "{colors.lamp-off-legend}"
    typography: "{typography.label-small}"
    rounded: "{rounded.sm}"
    height: "34px"
  tally-cell-red:
    backgroundColor: "{colors.red}"
    textColor: "{colors.red-lit-legend}"
  tally-cell-green:
    backgroundColor: "{colors.green}"
    textColor: "{colors.lit-ink}"
  tally-cell-amber:
    backgroundColor: "{colors.amber}"
    textColor: "{colors.lit-ink}"
  tally-cell-white:
    backgroundColor: "{colors.legend}"
    textColor: "{colors.lit-ink}"
  key-take:
    backgroundColor: "{colors.green}"
    textColor: "{colors.lit-ink}"
    typography: "{typography.key}"
    rounded: "{rounded.lg}"
    padding: "12px 16px"
    height: "72px"
  key-take-disabled:
    backgroundColor: "{colors.lamp-off}"
    textColor: "{colors.lamp-off-legend}"
  key-dump:
    backgroundColor: "{colors.red}"
    textColor: "{colors.red-lit-legend}"
  key-reset:
    backgroundColor: "{colors.legend}"
    textColor: "{colors.lit-ink}"
  cart-key:
    backgroundColor: "{colors.console-raised}"
    textColor: "{colors.legend}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "6px 10px"
    height: "44px"
  cart-key-active:
    backgroundColor: "{colors.amber}"
    textColor: "{colors.lit-ink}"
  talkback-input:
    backgroundColor: "{colors.console-well}"
    textColor: "{colors.legend}"
    rounded: "{rounded.md}"
    height: "40px"
    padding: "0 12px"
  talkback-button:
    backgroundColor: "{colors.green}"
    textColor: "{colors.lit-ink}"
    typography: "{typography.label-large}"
    rounded: "{rounded.md}"
    height: "40px"
    padding: "0 16px"
---

# Design System: Caller

## Overview

**Creative North Star: "The Control Room"**

A call runs like a live broadcast. The brief is the rundown, the call is on air, and the report is the as-run log. The interface is a broadcast gallery: a console of warm grey panels, one sheet of cool paper, and backlit lamps that show state.

The system has two materials. The console is dark, warm and matte. It holds the programme monitor, the studio clock, the tally and the keys. The rundown sheet is the only paper surface, and it is the only place where Chris writes. Colour belongs to the lamps. A lamp is dark until a state lights it, and it stays in a fixed place.

The density is operational. One person watches one call and keeps a hand near the key. Every legend is short, condensed and uppercase. Every sentence is plain Barlow in sentence case. The world rejects the agent-dashboard default: a navigation sidebar, chat bubbles and status pills.

**Key Characteristics:**
- Warm powder-coat console grey around one cool paper rundown sheet
- Red, green and amber lamps with a dark off state in fixed cells
- Condensed uppercase legends; plain sentence-case body text
- Mono only for timecodes, numbers and latency figures in rows
- A single large key that changes from TAKE to a guarded hang-up key
- Rundown rows strike through and clear when the call ends

## Colors

The palette is a dark warm console, one cool paper sheet, and three lamp colours that mean state and nothing else.

### Primary
- **Tally Red** (`red`): The caller's microphone is live. It lights the ON AIR lamp, the Speaking cell, the hang-up key, the caller dot in the feed, the hard-limit tick and the locked rundown stamp.
- **Red Glass** (`red-glass`): The unlit ON AIR lamp. The lamp stays visible as dark red glass between calls.
- **Red Signal Text** (`red-text`): Red words on the dark console, such as a refused event, a Not clean flag and the Hard 12 caption.
- **Red Lamp Legend** (`red-lit-legend`): The warm white legend on a lit red lamp or key.

### Secondary
- **Tally Green** (`green`): The line to the other party is live. It lights the Listening cell, the TAKE key, the Say it key, passed preflight checks and the dot for the other party.

### Tertiary
- **Tally Amber** (`amber`): Wait, attention or rehearsal. It lights Thinking and Interrupted, the soft limit, Needs you, the rehearsal lamp, a pressed cart key and the selected log row edge. The focus ring also uses amber.

### Neutral
- **Console** (`console`): The page ground, the mode keys at rest and the unlit persona buttons.
- **Console Raised** (`console-raised`): The gallery strip, the console panels and the cart keys.
- **Console Well** (`console-well`): The programme monitor, the log detail and the talkback input. It sits lower than the console.
- **Panel Edge** (`edge`): The 1px dark edge on panels, lamps, keys and the programme monitor.
- **Console Rule** (`rule`): Dividers, table rules and the mode key outline on the console.
- **Legend** (`legend`): Primary text on the console, and the lit colour of a white lamp or a pressed mode key.
- **Dim Legend** (`legend-dim`): Panel legends, timecodes, secondary text and captions on the console.
- **Unlit Lamp** (`lamp-off`): The face of every dark tally cell, preflight dot and disabled key.
- **Unlit Lamp Legend** (`lamp-off-legend`): The legend on an unlit lamp or a disabled key.
- **Printout White** (`paper`): The rundown sheet. It is cool against the warm console.
- **Paper Rule** (`paper-rule`): Row lines and field underlines on the rundown sheet.
- **Ink** (`ink`): Text, the header rule, the selected line type and the focused field underline on paper.
- **Dim Ink** (`ink-dim`): Slot names, hints and the sheet foot on paper.
- **Lit Ink** (`lit-ink`): The dark legend on a lit green, amber or white lamp.

### Named Rules
**The Tally Rule.** Red, green and amber mean state. Red is the caller's microphone, green is the line to them, and amber is a wait or a warning. Do not use them as decoration.

**The Dark Lamp Rule.** A lamp never disappears. When its state ends, it goes back to its unlit face in the same place.

**The One Sheet Rule.** Paper is for the rundown only. All other surfaces use the console greys.

## Typography

**Display Font:** Barlow Condensed (with Barlow, system-ui)
**Body Font:** Barlow (with system-ui)
**Label/Mono Font:** Red Hat Mono (with ui-monospace)

**Character:** Barlow Condensed reads like a legend engraved on a panel. Barlow carries the sentences, and Red Hat Mono carries the measurements in rows.

### Hierarchy
- **Display** (`display`): The as-run log outcome headline. It is sentence case with balanced wrap.
- **Clock** (`clock`): The elapsed time in the centre of the studio clock.
- **Wordmark** (`wordmark`): The Caller mark in the gallery strip, in uppercase.
- **Key** (`key`): The big legend on the TAKE, hang-up and New rundown keys, in uppercase.
- **Headline** (`headline`): Surface titles: Rundown, the monitor title, As-run log. Uppercase.
- **Readout** (`readout`): Values in the as-run label grid. The console counters use the same face at 17px.
- **Event** (`event`): Event lines in the feed, such as Dialing or Asked if it is a machine.
- **Body** (`body`): Transcript text, rundown fields and verdicts. Transcript lines stop at 68ch. Tabular figures are on for the whole page.
- **Body Small** (`body-small`): The monitor subtitle, preflight reasons and log dates.
- **Note** (`note`): Hints, the sheet foot, the prototype note and retention notes.
- **Label Large** (`label-large`): Mode keys, preflight names, read-back headings and Needs you. Uppercase.
- **Label** (`label`): Panel legends, slot names, table heads, cart keys and rundown buttons. Uppercase.
- **Label Small** (`label-small`): Tally cells, the rundown stamp and the line type control. Uppercase.
- **Timecode** (`timecode`): Feed timecodes. The same face at 12px shows the reply gap, and at 14px shows log numbers.

### Named Rules
**The Legend Rule.** A name for a control, a panel or a field is a condensed uppercase legend with tracking. A sentence is Barlow in sentence case.

**The Row Measurement Rule.** Timecodes, telephone numbers in the log and latency figures use Red Hat Mono. The clock face and the readouts use condensed figures.

## Layout

The desktop room is a three-column grid under a 56px gallery strip. The rundown sheet is 360px on the left. The programme monitor fills the centre. The console is 320px on the right. The room fills the viewport height, and each column scrolls on its own.

The 8px unit sets the room gutters (16px) and the gallery strip padding (24px). Inside panels and rows, the spacing uses a 4px step: 4, 8, 12, 16, 20 and 24px. The feed line is a grid of 56px timecode, 72px speaker and text columns. The reply gap line indents to the text column.

The console is a vertical stack. The studio clock is on top, then the tally, then the readouts. The key sits at the bottom of the column. In rehearsal, the clock shrinks to 150px and the cart wall opens under the programme monitor.

The Log view replaces all three columns with a list and a detail pane at 7fr to 6fr.

| Breakpoint | Behaviour |
|---|---|
| above 1180px | Three columns: rundown sheet, programme monitor, console |
| 1180px and below | The console becomes one row across the top: clock, tally, readouts, key. The rundown sheet (330px) and the programme monitor sit below. |
| 760px and below | One column. The console is a sticky bottom bar with a 96px clock and the key. The tally and readouts hide, and a phase caption shows under the clock. During and after a call, the programme monitor moves above the rundown sheet. |

## Elevation & Depth

Depth is physical, and each material has one treatment. The rundown sheet lies on the console with a soft drop shadow. The programme monitor sinks into the console with an inset shadow. Panels and cart keys sit flush with a 1px top highlight. Only a lit lamp gives off light.

### Shadow Vocabulary
- **Paper on console** (`box-shadow: 0 6px 18px rgba(0,0,0,.35)`): The rundown sheet only.
- **Monitor well** (`box-shadow: inset 0 2px 10px rgba(0,0,0,.45)`): The programme monitor.
- **Panel highlight** (`box-shadow: inset 0 1px 0 rgba(255,255,255,.05)`): Console panels. Cart keys use .06.
- **Unlit lamp** (`box-shadow: inset 0 1px 2px rgba(0,0,0,.45)`): Tally cells. Preflight dots use .6.
- **Lamp glow** (`box-shadow: 0 0 14px <lamp colour at .5 to .55>`): A lit tally cell. Dots use 8px and the ON AIR lamp uses 18px.
- **Sticky console** (`box-shadow: 0 -8px 20px rgba(0,0,0,.35)`): The bottom console bar at 760px and below.

### Named Rules
**The Glow Is State Rule.** A glow appears only on a lit lamp. A surface without a live state has no glow.

## Shapes

The corners are nearly square, like a panel of machined parts. Paper, lamp cells and stamps use a 2px radius. Panels, mode keys, cart keys and inputs use 3px. The big key uses 4px. Rundown fields have no radius and no box; they are a 1px underline. Lamps in the feed and the preflight are round dots.

Borders are 1px. Console parts take a dark edge, and paper parts take an ink line. The rundown header has a 2px ink rule. The guard around the hang-up key is a 2px frame, 6px out, with a 7px radius.

The studio clock is a ring of 60 second LEDs, a thin minute arc and 12 minute ticks. The ticks at 8 and 12 are larger and carry amber and red.

## Components

### Buttons
The keys are hardware. They are flat, near square and lit by state.
- **Shape:** Mode keys and cart keys have slightly softened corners (3px). The big key has 4px.
- **Mode keys:** Console ground, dim legend, 1px rule outline, 32px high. A pressed mode key turns Legend with a Lit Ink legend. The mode keys lock during a call.
- **TAKE key:** Tally Green with a Lit Ink legend, 72px minimum height, with a big legend and one line under it. It is dark (Unlit Lamp) until the preflight passes.
- **Hang-up key:** During a call the TAKE key becomes Tally Red and shows the Shift H shortcut. A 2px guard frame surrounds it.
- **New rundown key:** After a call, the key turns Legend with a Lit Ink legend.
- **Press:** Keys move down 1px for 80ms. Colour changes take 150 to 220ms.
- **Rundown buttons:** On paper, a 1px ink outline. On hover, the fill turns Ink and the legend turns Printout White.

### Chips
- **Rundown stamp:** A small bordered legend at the top right of the rundown sheet. It reads Editable, then Locked on air in Tally Red, then Cleared with a dashed border.
- **Log flags:** A dot and a short word in amber or red text. They have no fill.

### Cards / Containers
- **Corner Style:** 3px on console panels; 2px on the rundown sheet.
- **Background:** Console Raised for panels; Console Well for the programme monitor and the log detail.
- **Shadow Strategy:** See Elevation & Depth.
- **Border:** 1px Panel Edge.
- **Internal Padding:** 14px in panels; 16px by 24px in the monitor head; 20px in the rundown sheet.

### Inputs / Fields
- **Rundown field:** No box. A 1px Paper Rule underline, transparent ground, Ink text and a red caret.
- **Focus:** The underline turns into a 2px Ink line. There is no glow.
- **Locked:** The underlines disappear, the add buttons hide and the line type control dims to 75%.
- **Line type control:** A segmented control with a 1px ink outline. The selected segment is Ink with a Printout White legend.
- **Give out tick:** A small checkbox with an ink accent and a Label Small legend at the right of each fact.
- **Talkback input:** Console Well, 1px rule outline, green caret. On focus, the outline turns Tally Green.
- **Global focus:** A 2px amber outline, 2px out.

### Navigation
- **Gallery strip:** Wordmark, three mode keys (On air, Rehearsal, Log), the prototype note and the ON AIR lamp at the right. There is no sidebar.
- **At 760px:** The strip wraps. The prototype note drops to its own line.

### ON AIR Lamp
A 112px by 34px lamp at the right of the gallery strip. It is Red Glass with a dim legend at rest. TAKE lights it Tally Red with an 18px glow. In rehearsal, it lights amber and reads Rehearsal.

### Tally
Twelve fixed cells in three columns: Dialing, Ringing, Listening, Thinking, Speaking, Interrupted, On hold, Message, Menu, Transfer, Closing, Ended. One cell is lit at a time. Speaking is red, Listening is green, and Thinking and Interrupted are amber. The other cells light white.

### Studio Clock
An SVG ring in a console panel, 260px wide at most. The second LEDs fill clockwise over each minute. The minute arc turns amber past the soft limit at 8 minutes. The centre shows the elapsed time and a caption such as Soft in 07:40.

### Programme Feed
Rows of timecode, speaker and text. A speaker legend has a 7px dot: red for the caller, green for them. Event rows span the speaker column in the Event face, coloured by tone. A mono reply-gap line follows a reply. New rows rise 4px and fade in over 220ms.

### Latency Split
A 30px bar in four parts: a hatched end-of-turn pause, a sage transcriber part, an amber brain part and a coral voice part. Mono figures in a key sit under the bar.

### Rundown Clear
When the call ends, each rundown row strikes through with a 2px ink line in 360ms. It then fades to 12% in 300ms. The rows start 70ms apart, and the sheet then empties.

### Motion
All transitions use `cubic-bezier(.16, 1, .3, 1)`. Under reduced motion, every animation and transition shortens to 1ms.

## Do's and Don'ts

### Do:
- **Do** show state with a lamp in a fixed place: a tally cell, a dot or the ON AIR lamp.
- **Do** keep red for the caller's live microphone and hang-up, green for the line to them and TAKE, and amber for waits, warnings and rehearsal.
- **Do** return a lamp to its unlit face (`lamp-off` or `red-glass`) when its state ends.
- **Do** write every control and panel name as a condensed uppercase legend with open tracking (about 0.08em).
- **Do** set timecodes, log numbers and latency figures in Red Hat Mono.
- **Do** keep the rundown sheet as the only paper surface, with underline fields and no boxes.
- **Do** keep corners between 2px and 4px on panels, keys and lamps.
- **Do** keep small text on a lit red lamp at 4.5:1 contrast or more.

### Don't:
- **Don't** add a navigation sidebar, chat bubbles or rounded status pills.
- **Don't** use red, green or amber as decoration, accents or chart colours outside the latency split.
- **Don't** give a surface a glow unless it is a lit lamp.
- **Don't** give the console a drop shadow; only the rundown sheet casts one.
- **Don't** move, hide or reorder tally cells to show a phase. Light a different cell.
- **Don't** put body sentences in the condensed face or in uppercase.
