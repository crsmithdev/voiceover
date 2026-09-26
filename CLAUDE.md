# Voiceover

`docs/spec.md` is the specification. Code comments cite it by section number,
such as "10.10".

Test a prompt or caller change with `bun scripts/rehearse.ts [case]`. It runs
the caller against a test receiver in a local LiveKit room, with no phone.

`scripts/call.ts` and `scripts/test-call.ts` are dry runs by default.
`--dial` places a real telephone call to a real number, so run it only when
Chris asks for a call.
