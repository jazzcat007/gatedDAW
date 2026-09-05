# Chord

Turns a single note into a diatonic chord in a configured key and scale.

---

![screenshot](chord.webp)

---

## 0. Overview

_Chord_ is a MIDI effect that reads each incoming note as a scale degree and replaces it with a chord built by stacking thirds from that degree — a diatonic harmonizer. Play a single-note melody or bassline into it and get chords that stay in key automatically.

Example uses:

- One-finger chord comping from a melody or bassline
- Instant harmony under a lead line, in a fixed key and scale
- Voicing experiments (inversions, drop voicings, spread)
- Strummed chords from a single incoming note

---

## 1. Key & Scale

**Key** sets the tonic (C through B). **Scale** selects the seven-tone scale the chord degrees are drawn from: Major, Minor, Harmonic Minor, Melodic Minor, Dorian, Phrygian, Lydian, Mixolydian, Locrian.

An incoming note that falls outside the scale (a black key in the "wrong" place) snaps down to the nearest scale tone at or below it, so it always resolves to a real degree rather than being dropped.

---

## 2. Degree

Transposes the chord diatonically by scale steps, not semitones. At **0** the note's own degree is used. At **+3**, for example, a note that would build the I chord instead builds the IV chord — three scale steps up. Range: **-7 to +7**.

---

## 3. Notes

How many thirds are stacked to build the chord. Range: **1 to 6**.

- **1**: The bare note (no harmony added)
- **3**: A triad
- **4**: A seventh chord
- **5-6**: Extended chords (ninth, eleventh)

---

## 4. Inversion

Lifts the chord's lowest voices up an octave, one at a time, without changing which note is on top. Range: **0 to 3**.

- **0**: Root position
- **1**: First inversion (the root moves on top)
- **2**: Second inversion
- **3**: Third inversion (only audible with 4+ notes)

---

## 5. Spread

Opens the voicing by dropping voices from the top down an octave — drop-2, then drop-3, then drop-4. Range: **0 to 3**.

- **0**: Closed voicing (thirds stacked tightly)
- **1+**: Progressively wider spacing between voices

---

## 6. Octave

Transposes the finished chord by whole octaves. Range: **-2 to +2**.

---

## 7. Strum

Staggers each voice's start (and matching release) by this many pulses instead of firing the whole chord at once, for a strummed or rolled attack. Range: **0 to 240 pulses** (0 = no stagger, up to a 1/16 note at the default tempo grid).

A voice's own release never lands before its own start, even under a wide strum on a short note.

---

## 8. Velocity

Tilts velocity across the voicing. Range: **-100% to +100%** (bipolar).

- **Negative**: Upper voices fade under the bottom voice (the chord sits under a lead)
- **0%**: Every voice keeps the input velocity
- **Positive**: Upper voices come forward

---

## 9. Technical Notes

- Voices leaving MIDI range 0-127 are dropped, never clamped, so distinct pitches are never folded together
- A note-off releases exactly the voices its own note-on produced, even if the chord parameters changed while it was sounding
- A transport jump releases every sounding voice and discards any still-strumming chord
