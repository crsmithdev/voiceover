---
name: Caller
description: A local operating surface for one person to write a rundown, watch what the caller is permitted to say during a live telephone call, and read the as-run log.
colors:
  ground: "#f1f3f7"
  raised: "#ffffff"
  sunk: "#f7f8fa"
  rail: "#252b38"
  rail-text: "#eef1f5"
  rail-muted: "#99a3b2"
  rail-sel: "rgba(255,255,255,.10)"
  line: "#e0e5ec"
  line-strong: "#cdd5e0"
  text: "#14181f"
  muted: "#5f6b7a"
  accent: "#3b5bdb"
  accent-soft: "#eef1fd"
  accent-hover: "#3450c6"
  ok: "#0f7b43"
  ok-soft: "#e9f6ee"
  no: "#c22c1f"
  no-soft: "#fdecea"
  no-hover: "#a92418"
  warn: "#96590a"
  warn-soft: "#fdf3e3"
  placeholder: "#9aa4b2"
  split-brain: "#7a8cea"
  split-voice: "#b3bef4"
typography:
  page-title:
    fontFamily: "Barlow, system-ui, -apple-system, sans-serif"
    fontSize: "19px"
    fontWeight: 600
    letterSpacing: "-0.01em"
  section:
    fontFamily: "{typography.page-title.fontFamily}"
    fontSize: "15px"
    fontWeight: 600
  card-title:
    fontFamily: "{typography.page-title.fontFamily}"
    fontSize: "13px"
    fontWeight: 600
  rail-mark:
    fontFamily: "{typography.page-title.fontFamily}"
    fontSize: "18px"
    fontWeight: 600
  body:
    fontFamily: "{typography.page-title.fontFamily}"
    fontSize: "15px"
    lineHeight: 1.55
  ui:
    fontFamily: "{typography.page-title.fontFamily}"
    fontSize: "14px"
  small:
    fontFamily: "{typography.page-title.fontFamily}"
    fontSize: "13px"
  label:
    fontFamily: "{typography.page-title.fontFamily}"
    fontSize: "12px"
    fontWeight: 600
    letterSpacing: "0.04em"
    textTransform: "uppercase"
  figure:
    fontFamily: "Red Hat Mono, ui-monospace, monospace"
    fontSize: "21px"
    fontWeight: 600
  figure-small:
    fontFamily: "{typography.figure.fontFamily}"
    fontSize: "12px"
  caption:
    fontFamily: "{typography.page-title.fontFamily}"
    fontSize: "11px"
spacing:
  unit: "8px"
rounded:
  sm: "4px"
  md: "6px"
  pill: "999px"
components:
  rail:
    backgroundColor: "{colors.rail}"
    textColor: "{colors.rail-text}"
    width: "208px"
  rail-item:
    textColor: "{colors.rail-muted}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "8px 10px"
  rail-item-selected:
    backgroundColor: "{colors.rail-sel}"
    textColor: "{colors.rail-text}"
  onair-lamp:
    textColor: "{colors.rail-muted}"
    rounded: "{rounded.md}"
    padding: "9px 10px"
  onair-lamp-air:
    backgroundColor: "{colors.no}"
    textColor: "#ffffff"
  onair-lamp-rehearsal:
    backgroundColor: "{colors.warn}"
    textColor: "#ffffff"
  card:
    backgroundColor: "{colors.raised}"
    borderColor: "{colors.line}"
    rounded: "{rounded.md}"
  field:
    backgroundColor: "{colors.raised}"
    borderColor: "{colors.line-strong}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "7px 10px"
  field-focus:
    borderColor: "{colors.accent}"
    ring: "0 0 0 3px {colors.accent-soft}"
  field-locked:
    backgroundColor: "{colors.sunk}"
    textColor: "{colors.muted}"
    borderColor: "{colors.line}"
  line-type-selected:
    backgroundColor: "{colors.accent}"
    textColor: "#ffffff"
  rundown-stamp:
    backgroundColor: "{colors.raised}"
    borderColor: "{colors.line-strong}"
    textColor: "{colors.muted}"
    rounded: "{rounded.pill}"
    padding: "3px 9px"
  rundown-stamp-locked:
    backgroundColor: "{colors.no}"
    textColor: "#ffffff"
  key-take:
    backgroundColor: "{colors.accent}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "12px 16px"
  key-hangup:
    backgroundColor: "{colors.no}"
    textColor: "#ffffff"
  key-disabled:
    backgroundColor: "{colors.sunk}"
    textColor: "{colors.placeholder}"
  tally-cell-on:
    backgroundColor: "{colors.accent-soft}"
    borderColor: "{colors.accent}"
    textColor: "{colors.accent}"
  needs-you:
    backgroundColor: "{colors.no-soft}"
    borderColor: "{colors.no}"
    textColor: "{colors.no}"
  stat-block:
    backgroundColor: "{colors.raised}"
    labelTypography: "{typography.label}"
    valueTypography: "{typography.figure}"
---

## Overview

**Creative North Star: "What It May Say"**

The screen is organised around the boundary, not around the call. The rundown
is a list of what the caller is permitted to say; the live view shows each of
those facts and whether it has been said or withheld; the as-run log says what
happened and what still needs Chris. The transcript is evidence, not the
subject.

The system has one material: a light operating surface of white cards on a
very light grey ground, with a dark grey rail down the left. Colour is spent
only on state. An accent blue marks the one action you can take now. Green
means a fact was stated, red means it was withheld or the call is live, amber
means a limit is near. Nothing else on the page is coloured.

The density is operational. One person watches one call and keeps a hand near
the key. Labels are short and sentence case; only small caps headings and stat
labels are uppercase. Figures are mono and tabular, so a clock and a count
never shift width as they change.

**Key Characteristics:**
- A dark grey rail against a light grey page, with white cards
- One accent blue for the primary action; green, red and amber only for state
- Small caps labels over large mono figures for every measured value
- The elapsed clock is tabular figures in the monitor head, not a dial
- The rundown fields grey out the moment the call locks them
- Rundown rows strike through and clear when the call ends

## Colors

The palette is a light grey ground, white cards, a dark rail, one accent, and
three state colours that mean state and nothing else.

### Primary
- **Accent** (`accent`): The one action available now. The Take key, the
  selected line type, a focused field's ring, the speaker label of the caller's
  own turns, the selected prompt and the selected log row.
- **Accent Soft** (`accent-soft`): The tint behind a selected row, a focused
  field's ring and the lit phase cell.
- **Accent Hover** (`accent-hover`): The Take key under the pointer.

### State
- **Stated** (`ok`): A fact the caller has said, and a preflight check that
  passes.
- **Stated Soft** (`ok-soft`): The fill behind a lit green phase cell.
- **Withheld** (`no`): A refusal, a failed preflight check, the live ON AIR
  lamp, the hang-up key and the Needs you block.
- **Withheld Soft** (`no-soft`): The fill behind the Needs you block and a lit
  red phase cell.
- **Limit** (`warn`): A soft or hard limit in reach, a deferred item, a
  rehearsal in progress and an amber flag in the log.
- **Limit Soft** (`warn-soft`): The fill behind a lit amber phase cell and a
  tag in the feed.

### Surfaces
- **Ground** (`ground`): The page behind every card. It is grey, never white,
  so a white card still reads as raised.
- **Raised** (`raised`): Cards, fields, the monitor column and the rail-side
  action bar.
- **Sunk** (`sunk`): A fact row, a table head, the cart wall and a disabled
  key. It sits below the card it is inside.
- **Rail** (`rail`): The left rail only. It is the one dark surface.
- **Rail Text** / **Rail Muted** (`rail-text`, `rail-muted`): Text on the rail.
  Body text never uses these.
- **Line** (`line`): Every hairline divider and card edge.
- **Line Strong** (`line-strong`): A field or control edge, which has to read
  against white.
- **Text** / **Muted** (`text`, `muted`): Body text and secondary text on light.

### Named Rules
**The State Rule.** Green, red and amber mean state. Green is said, red is
withheld or live, amber is a limit or a deferral. Never use them as decoration.

**The One Action Rule.** Accent blue marks the action available right now, and
only one control on the screen carries it.

**The Dark Rail Rule.** The rail is the only dark surface. No other panel takes
the rail colours, and rail text colours never appear on light.

**The Figures Rule.** Every measured value is mono and tabular: clocks,
durations, counts, latencies. Prose is never mono.

## Layout

The page is a two column grid: a 208px rail and the room. The room is a grid of
a working column and a 360px monitor column, with an action bar across the foot
of the working column. Each column scrolls on its own and the page never does.

The stage decides what the room holds:

| Stage | Working column | Monitor column |
| --- | --- | --- |
| Standby | The rundown, being written | The preflight, then what it may state, will not say and always says |
| Live | The rundown, locked and greyed | The transcript as it arrives |
| Ended | Hidden | The as-run log, full width |

Log and Prompts replace the room entirely, each a list beside a detail pane.

| Breakpoint | Behaviour |
| --- | --- |
| above 1180px | Rail, working column, 360px monitor |
| 1180px and below | The rail narrows to 180px and the monitor to 320px |
| 900px and below | The rail becomes a top strip; the room stacks into one column |

## Elevation & Depth

Depth is a border and a ground change, never a shadow. A card is white on grey
with a 1px `line` edge. A field is white with a `line-strong` edge. A focused
field gains a 3px `accent-soft` ring. Nothing on the page casts a drop shadow.

### Named Rules
**The No Shadow Rule.** Separation comes from the ground, a hairline and
spacing. If a thing needs a shadow to read, it is in the wrong place.

## Shapes

Corners are 6px on cards, fields, keys and controls, 4px on a phase cell, and a
full pill on the rundown stamp and the latency bar. Borders are 1px everywhere.

## Components

### Buttons
- **Rail item:** Transparent with rail-muted text, 8px by 10px. The selected
  item takes `rail-sel` and rail text. Rail items lock during a call.
- **Take key:** Accent blue, white text, a big line and a small line under it.
  It goes to the sunk grey when the preflight fails.
- **Hang-up key:** During a call the Take key becomes Withheld red and shows
  the Shift H shortcut.
- **New rundown key:** After a call, a white key with a strong edge.
- **Sheet button:** White with a strong edge; the edge turns muted on hover.
- **Cart key:** White with a strong edge; the edge and text turn accent on
  hover. Disabled keys go sunk.

### Chips and flags
- **Rundown stamp:** A pill at the top right of the rundown. It reads Editable,
  then Locked on air on Withheld red, then Cleared with a dashed edge.
- **Log flag:** A dot and a short word in amber or red text, with no fill.
- **Feed tag:** A small amber pill inside a transcript line.

### Cards and containers
- **Corner Style:** 6px.
- **Background:** Raised for cards; Sunk for a fact row, a table head and the
  cart wall.
- **Border:** 1px Line.
- **Internal Padding:** 11px by 14px in a card row; 14px by 16px in a rundown
  slot; 16px by 18px in the monitor.

### Figures
Every stat is a small caps label over a large mono figure, in a hairline grid
of equal blocks. The elapsed clock follows the same rule in the monitor head,
with the limit caption beneath it; it turns amber past the soft limit.

## Do and Don't

- **Do** keep the rail the only dark surface.
- **Do** spend green, red and amber on state alone.
- **Do** set every measured value in tabular mono figures.
- **Do** grey a rundown field the moment the call locks it.
- **Don't** give any surface a drop shadow.
- **Don't** put a second accent-blue control on the screen at the same time.
- **Don't** use white as the page ground; the ground is grey so cards can read.
- **Don't** colour a row to draw attention when spacing would do it.
