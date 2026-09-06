# Kadenz

Kadenz is a **chord progression player**. It runs on its own clock: once the transport is playing it walks
through the progression you have written and emits complete chord voicings, with no incoming notes
required. Put it in front of any instrument and it plays the harmony for you.

It is the harmonic counterpart to [Euclid](euclid): where Euclid generates rhythm, Kadenz generates
harmony. If instead you want to harmonise notes you play yourself, use [Chord](chord) — that device turns
each note you send it into a chord, while Kadenz needs no input at all.

## The progression

The grid at the bottom of the device *is* the progression. Each column is one step:

| Row | Meaning |
| --- | --- |
| **Chord** | The scale degree the chord is built on, as a roman numeral (I to VII). Drag up or down to change. |
| **Quality** | `Auto` spells the chord the key and scale imply — so ii is minor in a major key without you asking. Any other value spells that chord explicitly, which is how you write chords that leave the scale (a `Dom7` on II is the classic V/V). |
| **Bars** | How long the step lasts, counted in grid units (see **Rate**). |
| **Play** | Click to turn the step into a rest. A rest still takes up its time; the progression just goes quiet for it. |

**Steps** sets how many columns are active. The progression loops once the last step finishes.

### Presets

**Presets** fills the grid with a common progression — I–V–vi–IV, ii–V–I, a twelve-bar blues, Pachelbel,
and others. It is a starting point, not a lock: everything stays editable afterwards.

### Generate

**Generate** writes a fresh progression using a weighted model of functional harmony — chords move from
tonic to predominant to dominant and resolve, which is what makes the result sound intentional rather than
random. It ends on a cadence so the loop closes properly.

Generation happens *when you press the button*, not during playback. The progression it produces is
written into the grid as ordinary steps, so you can edit any of them afterwards, it is saved with your
project, and it plays back identically every time. Pressing **Generate** again rolls a new one.

## Parameters

| Parameter | Range | Description |
| --- | --- | --- |
| Key | C to B | The tonic the whole progression is read against. |
| Scale | 9 scales | Major, Minor, Harmonic Minor, Melodic Minor, Dorian, Phrygian, Lydian, Mixolydian, Locrian. Changing it re-colours every `Auto` chord at once — the same degrees, a different mood. |
| Rate | 1/1 to 1/128 | The length of one grid unit, which is what **Bars** counts. At the default 1/4, a four-unit step is one bar. |
| Gate | 0% to 200% | How much of its own step each chord sustains. Below 100% the chord stops short and leaves a gap; above 100% it overlaps into the next. |
| Notes | 1 to 6 | Voices per chord: 3 is a triad, 4 a seventh, 5 a ninth. |
| Inversion | 0 to 3 | Lifts the lowest voices an octave, which keeps the chord's identity while moving where it sits. Each step can add its own inversion on top of this. |
| Spread | 0 to 3 | Drop voicings, opening the chord out by dropping upper voices an octave. |
| Octave | -2 to +2 | Transposes the finished voicing. |
| Strum | 0 to 240 | Staggers the voices in time instead of striking them together — a guitar-like roll. |
| Velocity | 0% to 100% | Base velocity of the chord. |
| Tilt | -100% to +100% | Tilts velocity across the voicing: negative fades the upper voices back, positive pushes them forward. |

Every parameter is automatable, so the key, scale, rate and voicing can all change over the course of an
arrangement. The progression itself is not automation — it is part of the device.

## Notes

- Kadenz emits nothing while the transport is stopped; it is a player, not a sound source.
- Voices that would fall outside MIDI range are dropped rather than folded back, so a wide **Spread** with
  an extreme **Octave** thins the chord instead of distorting it.
- Because it ignores incoming notes, a Kadenz placed after another MIDI effect replaces that effect's
  output rather than transforming it.
