//! Shared chord voicing for the harmony devices (`device-chord`, `device-kadenz`): the scale table, the
//! diatonic third-stacking, the explicit chord qualities, and the voicing shaping (inversion, drop spread,
//! octave transpose, MIDI-range dropping). It lives in its own plain lib crate because each device is a
//! cdylib carrying its own `#[panic_handler]`, so one device can never link another.

#![cfg_attr(target_family = "wasm", no_std)]

/// The selectable scales, as semitone offsets from the tonic. All are SEVEN-tone: the chord builder stacks
/// thirds by stepping the degree index by two and wrapping `% 7`, which only spells thirds on a heptatonic
/// scale. WASM CONTRACT: the order mirrors `ChordDeviceBoxAdapter.ScaleNames`, so the array index is the
/// `scaleIndex` parameter value.
pub const SCALES: [[i32; 7]; 9] = [
    [0, 2, 4, 5, 7, 9, 11],  // Major (Ionian)
    [0, 2, 3, 5, 7, 8, 10],  // Minor (Aeolian)
    [0, 2, 3, 5, 7, 8, 11],  // Harmonic Minor
    [0, 2, 3, 5, 7, 9, 11],  // Melodic Minor
    [0, 2, 3, 5, 7, 9, 10],  // Dorian
    [0, 1, 3, 5, 7, 8, 10],  // Phrygian
    [0, 2, 4, 6, 7, 9, 11],  // Lydian
    [0, 2, 4, 5, 7, 9, 10],  // Mixolydian
    [0, 1, 3, 5, 6, 8, 10]   // Locrian
];

/// Voices in one chord: a stack of thirds up to the thirteenth.
pub const MAX_VOICES: usize = 6;

/// `0` takes the quality from the key and scale (a degree's diatonic quality); every other value spells an
/// explicit chord rooted on the step's degree, so a progression can leave the scale (borrowed chords,
/// secondary dominants). WASM CONTRACT: the order mirrors `KadenzDeviceBoxAdapter.QualityNames`, and the
/// count fits the four bits a packed step gives it.
pub const QUALITY_AUTO: i32 = 0;
pub const QUALITY_COUNT: i32 = 16;

/// The semitone intervals of each explicit quality, indexed by the quality value (index 0 is unused: it is
/// `QUALITY_AUTO`, which stacks scale thirds instead).
const QUALITY_INTERVALS: [&[i32]; QUALITY_COUNT as usize] = [
    &[0, 4, 7],          // unused (QUALITY_AUTO)
    &[0, 4, 7],          // Major
    &[0, 3, 7],          // Minor
    &[0, 3, 6],          // Diminished
    &[0, 4, 8],          // Augmented
    &[0, 2, 7],          // Sus2
    &[0, 5, 7],          // Sus4
    &[0, 4, 7, 10],      // Dom7
    &[0, 3, 7, 10],      // Min7
    &[0, 4, 7, 11],      // Maj7
    &[0, 3, 6, 9],       // Dim7
    &[0, 3, 6, 10],      // HalfDim7
    &[0, 4, 7, 10, 14],  // Dom9
    &[0, 3, 7, 10, 14],  // Min9
    &[0, 4, 7, 11, 14],  // Maj9
    &[0, 4, 7, 14]       // Add9
];

pub fn clamp_i32(value: i32, min: i32, max: i32) -> i32 {
    if value < min { min } else if value > max { max } else { value }
}

/// Sort a fixed voice slice ascending (insertion sort: at most six elements, no allocation).
pub fn sort_voices(voices: &mut [i32]) {
    let mut outer = 1;
    while outer < voices.len() {
        let value = voices[outer];
        let mut inner = outer;
        while inner > 0 && voices[inner - 1] > value {
            voices[inner] = voices[inner - 1];
            inner -= 1;
        }
        voices[inner] = value;
        outer += 1;
    }
}

/// Read `pitch` as a scale degree in `key`, returning its octave and degree index. The pitch is snapped
/// DOWN to the scale tone at or below it, so a black key off the scale still chooses a degree rather than
/// being dropped.
pub fn degree_at_pitch(scale: &[i32; 7], key: i32, pitch: u32) -> (i32, i32) {
    let relative = pitch as i32 - key;
    let pitch_class = relative.rem_euclid(12);
    let mut degree = 0i32;
    let mut index = 0;
    while index < 7 {
        if scale[index] <= pitch_class {
            degree = index as i32;
        }
        index += 1;
    }
    (relative.div_euclid(12), degree)
}

/// Stack `count` diatonic thirds from `base_step`, writing MIDI pitches into `voices`. Mirrors the TS
/// `Chord.compile` (`scale[step % 7] + floor(step / 7) * 12`, `step = base + index * 2`), with `rem_euclid`
/// / `div_euclid` so a negative step transposes correctly below the tonic.
pub fn stack_diatonic(scale: &[i32; 7], key: i32, octave: i32, base_step: i32, count: usize, voices: &mut [i32]) {
    let mut index = 0;
    while index < count {
        let step = base_step + (index as i32) * 2;
        let interval = scale[step.rem_euclid(7) as usize] + step.div_euclid(7) * 12;
        voices[index] = key + octave * 12 + interval;
        index += 1;
    }
}

/// Spell an EXPLICIT quality rooted on `root`, writing `count` MIDI pitches into `voices`. A `count` beyond
/// the quality's own intervals keeps stacking by wrapping into the next octave, so the voice knob still
/// thickens a triad the way diatonic stacking does.
pub fn stack_quality(root: i32, quality: i32, count: usize, voices: &mut [i32]) {
    let intervals = QUALITY_INTERVALS[clamp_i32(quality, 0, QUALITY_COUNT - 1) as usize];
    let mut index = 0;
    while index < count {
        voices[index] = root + intervals[index % intervals.len()] + (index / intervals.len()) as i32 * 12;
        index += 1;
    }
}

/// Lift the lowest voices an octave, never the whole chord (that is what the octave transpose is for), so
/// the top voice keeps its place and the chord keeps its identity. Leaves the slice sorted.
pub fn apply_inversion(voices: &mut [i32], count: usize, inversion: usize) {
    let liftable = count - 1;
    let lifted = if inversion > liftable { liftable } else { inversion };
    let mut index = 0;
    while index < lifted {
        voices[index] += 12;
        index += 1;
    }
    sort_voices(&mut voices[..count]);
}

/// Drop voicings from the top down: step 1 drops the SECOND voice from the top an octave (drop-2), step 2
/// also the third (drop-3), step 3 also the fourth. A step with no voice to drop is a no-op. Leaves the
/// slice sorted.
pub fn apply_spread(voices: &mut [i32], count: usize, spread: usize) {
    let mut step = 1;
    while step <= spread {
        if count >= step + 1 {
            voices[count - 1 - step] -= 12;
        }
        step += 1;
    }
    sort_voices(&mut voices[..count]);
}

/// Transpose the finished voicing by `semitones` and compact it to the voices that stay inside MIDI range
/// `0..=127`, returning how many survive. Voices leaving the range are DROPPED, never clamped (clamping
/// would fold distinct pitches onto one), mirroring `device-pitch`.
pub fn transpose_into_range(voices: &mut [i32], count: usize, semitones: i32) -> usize {
    let mut kept = 0;
    let mut index = 0;
    while index < count {
        let value = voices[index] + semitones;
        if (0..=127).contains(&value) {
            voices[kept] = value;
            kept += 1;
        }
        index += 1;
    }
    kept
}

/// The velocity for voice `index` of `count`, ascending. `tilt` is bipolar: negative fades the upper voices
/// out (the chord sits under the melody), positive pushes them forward. The tilt reaches at most 75% at the
/// top voice, so even a full negative tilt leaves the voicing audible rather than silent.
pub fn voice_velocity(tilt: f32, velocity: f32, index: usize, count: usize) -> f32 {
    if count <= 1 {
        return velocity.max(0.0).min(1.0);
    }
    let position = index as f32 / (count - 1) as f32;
    (velocity * (1.0 + tilt * 0.75 * position)).max(0.0).min(1.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn voiced(scale_index: usize, key: i32, pitch: u32, count: usize) -> Vec<i32> {
        let scale = &SCALES[scale_index];
        let (octave, degree) = degree_at_pitch(scale, key, pitch);
        let mut voices = [0i32; MAX_VOICES];
        stack_diatonic(scale, key, octave, degree, count, &mut voices);
        voices[..count].to_vec()
    }

    #[test]
    fn a_degree_stacks_the_diatonic_thirds_of_its_scale() {
        assert_eq!(voiced(0, 0, 60, 3), vec![60, 64, 67], "C major I -> C E G");
        assert_eq!(voiced(0, 0, 62, 3), vec![62, 65, 69], "ii is minor without being told so");
        assert_eq!(voiced(1, 0, 60, 3), vec![60, 63, 67], "the minor scale makes i minor");
    }

    #[test]
    fn a_pitch_off_the_scale_snaps_down_to_a_degree() {
        assert_eq!(voiced(0, 0, 61, 3), voiced(0, 0, 60, 3));
    }

    #[test]
    fn explicit_qualities_spell_chords_the_scale_cannot() {
        let mut voices = [0i32; MAX_VOICES];
        stack_quality(60, 1, 3, &mut voices);
        assert_eq!(voices[..3].to_vec(), vec![60, 64, 67], "Major");
        stack_quality(60, 7, 4, &mut voices);
        assert_eq!(voices[..4].to_vec(), vec![60, 64, 67, 70], "Dom7 — the chord C major has no diatonic V7 for");
        stack_quality(60, 11, 4, &mut voices);
        assert_eq!(voices[..4].to_vec(), vec![60, 63, 66, 70], "HalfDim7");
    }

    #[test]
    fn a_quality_thickened_past_its_intervals_wraps_into_the_next_octave() {
        let mut voices = [0i32; MAX_VOICES];
        stack_quality(60, 1, 5, &mut voices);
        assert_eq!(voices[..5].to_vec(), vec![60, 64, 67, 72, 76], "a triad keeps stacking an octave up");
    }

    #[test]
    fn quality_auto_is_never_spelled_explicitly() {
        assert_eq!(QUALITY_AUTO, 0, "the packed step reads 0 as `derive it from the scale`");
    }

    #[test]
    fn inversion_lifts_the_lowest_voices_only() {
        let mut voices = [60, 64, 67, 0, 0, 0];
        apply_inversion(&mut voices, 3, 1);
        assert_eq!(voices[..3].to_vec(), vec![64, 67, 72]);
        let mut voices = [60, 64, 67, 0, 0, 0];
        apply_inversion(&mut voices, 3, 9);
        assert_eq!(voices[..3].to_vec(), vec![67, 72, 76], "a triad has only two voices to lift");
    }

    #[test]
    fn spread_drops_voices_from_the_top_an_octave() {
        let mut voices = [60, 64, 67, 0, 0, 0];
        apply_spread(&mut voices, 3, 1);
        assert_eq!(voices[..3].to_vec(), vec![52, 60, 67], "drop-2");
    }

    #[test]
    fn voices_leaving_midi_range_are_dropped_not_clamped() {
        let mut voices = [120, 124, 127, 0, 0, 0];
        let kept = transpose_into_range(&mut voices, 3, 12);
        assert_eq!(kept, 0, "everything leaves the top of the range");
        let mut voices = [60, 64, 67, 0, 0, 0];
        let kept = transpose_into_range(&mut voices, 3, -12);
        assert_eq!(voices[..kept].to_vec(), vec![48, 52, 55]);
    }

    #[test]
    fn velocity_tilt_fades_or_lifts_the_upper_voices() {
        assert_eq!(voice_velocity(0.0, 0.8, 2, 3), 0.8, "no tilt leaves every voice alone");
        assert_eq!(voice_velocity(-1.0, 0.8, 0, 3), 0.8, "the bottom voice is never tilted");
        assert!((voice_velocity(-1.0, 0.8, 2, 3) - 0.2).abs() < 1e-6, "the top voice keeps 25% at full negative tilt");
        assert_eq!(voice_velocity(1.0, 1.0, 2, 3), 1.0, "never above full scale");
    }
}
