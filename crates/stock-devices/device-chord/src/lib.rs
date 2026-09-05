//! The CHORD MIDI-effect device (`ChordDeviceBox`): a PIC side module the engine wires BEFORE the instrument
//! (instrument <- this <- sequencer), a PULL SOURCE in the event chain. Every incoming note-on is read as a
//! SCALE DEGREE in the configured key/scale and replaced by a diatonic chord stacked in thirds from that
//! degree, so one finger plays harmony that stays in key. Mirrors the TS `Chord.compile` in `lib-dsp`
//! (`scale[step % 7] + floor(step / 7) * 12`, `step = variation + index * 2`).
//!
//! Parameters (`ChordDeviceBox`): key `[10]` (0..11, C..B), scaleIndex `[11]` (into `SCALES`), degree `[12]`
//! (-7..7 scale steps of diatonic transpose), numNotes `[13]` (1..6 stacked thirds), inversion `[14]` (0..3),
//! spread `[15]` (0..3 drop-voicing steps), octave `[16]` (-2..2), strum `[17]` (0..240 pulses between
//! successive voices), velocity `[18]` (bipolar tilt across the voicing). Automation is honored: the block is
//! split at update boundaries, exactly as `abi::render_midi_effect` does.
//!
//! Unlike a stateless transpose this device is STATEFUL, for two reasons. A chord's voices carry generated
//! note ids, so the incoming note-off must release the ids ITS note-on produced (the `held` table) rather than
//! the pitch it arrived with. And `strum` staggers a chord's voices in time, so a voice can fall past the end
//! of the current block; those events wait in `pending` and are emitted when the transport reaches them.
//!
//! Exports: `kind()` (midi effect), `state_size()`, `init(...)`, `parameter_changed(...)`, `map_parameter(...)`,
//! `process_events(...)`, `reset(...)`.

#![cfg_attr(target_family = "wasm", no_std)]

#[cfg(target_family = "wasm")]
use core::panic::PanicInfo;
use abi::{EventRecord, ParamValue, EVENT_NOTE_OFF, EVENT_NOTE_ON};
use math::value_mapping::{Linear, LinearInteger};

#[cfg(target_family = "wasm")]
#[panic_handler]
fn panic(info: &PanicInfo) -> ! {
    abi::panic_to_host(info) // deposit the message in the engine's panic buffer, then trap (never a silent hang)
}

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

/// Voices in one chord (`numNotes` max): a stack of thirds up to the thirteenth.
pub const MAX_VOICES: usize = 6;
/// The widest strum, in pulses: 240 = a 1/16 at `PPQN.Quarter` 960, i.e. the whole voicing inside one step.
const MAX_STRUM: i64 = 240;
/// Simultaneously sounding input notes whose voices are tracked for their release.
const MAX_HELD: usize = 32;
/// Strum-deferred events (note-ons and note-offs) waiting for the transport to reach them.
const MAX_PENDING: usize = 128;
/// Events emitted in one block.
const EMIT_MAX: usize = 128;
/// The on-stack buffer the upstream pull writes into.
const PULL_SCRATCH: usize = 256;
/// The shortest a strummed voice may sound, in pulses, when its note-off would otherwise precede its own
/// (still deferred) note-on — a staccato note under a wide strum.
const MIN_LENGTH: f64 = 1.0;

const KEY_FIELD: [u16; 1] = [10];
const SCALE_FIELD: [u16; 1] = [11];
const DEGREE_FIELD: [u16; 1] = [12];
const NOTES_FIELD: [u16; 1] = [13];
const INVERSION_FIELD: [u16; 1] = [14];
const SPREAD_FIELD: [u16; 1] = [15];
const OCTAVE_FIELD: [u16; 1] = [16];
const STRUM_FIELD: [u16; 1] = [17];
const VELOCITY_FIELD: [u16; 1] = [18];

const KEY_MAPPING: LinearInteger = LinearInteger {min: 0, max: 11};
const SCALE_MAPPING: LinearInteger = LinearInteger {min: 0, max: (SCALES.len() - 1) as i32};
const DEGREE_MAPPING: LinearInteger = LinearInteger {min: -7, max: 7};
const NOTES_MAPPING: LinearInteger = LinearInteger {min: 1, max: MAX_VOICES as i32};
const INVERSION_MAPPING: LinearInteger = LinearInteger {min: 0, max: 3};
const SPREAD_MAPPING: LinearInteger = LinearInteger {min: 0, max: 3};
const OCTAVE_MAPPING: LinearInteger = LinearInteger {min: -2, max: 2};
const STRUM_MAPPING: Linear = Linear {min: 0.0, max: MAX_STRUM as f32};
const VELOCITY_MAPPING: Linear = Linear::bipolar();

/// One sounding input note and the voices it produced: the generated ids and pitches its note-off must
/// release, plus each voice's scheduled note-on position so a release can never be ordered before it.
#[derive(Clone, Copy)]
struct Held {
    input_id: u32,
    count: u32,
    ids: [u32; MAX_VOICES],
    pitches: [u32; MAX_VOICES],
    starts: [f64; MAX_VOICES]
}

/// The device's per-instance state (engine-allocated, zeroed). Parameter values are seeded in `init` to the
/// box defaults rather than left zeroed, since a zero `numNotes` would emit nothing until the engine pushed
/// the real values.
pub struct ChordState {
    key: i32,
    scale_index: i32,
    degree: i32,
    notes: i32,
    inversion: i32,
    spread: i32,
    octave: i32,
    strum: f32,
    velocity_tilt: f32,
    key_id: u32,
    scale_id: u32,
    degree_id: u32,
    notes_id: u32,
    inversion_id: u32,
    spread_id: u32,
    octave_id: u32,
    strum_id: u32,
    velocity_id: u32,
    held: [Held; MAX_HELD],
    held_count: u32,
    pending: [EventRecord; MAX_PENDING],
    pending_count: u32,
    next_id: u32
}

fn blank_event() -> EventRecord {
    EventRecord {position: 0.0, offset: 0, kind: 0, id: 0, pitch: 0, velocity: 0.0, cent: 0.0, duration: 0.0}
}

fn clamp_i32(value: i32, min: i32, max: i32) -> i32 {
    if value < min { min } else if value > max { max } else { value }
}

/// Sort a fixed voice slice ascending (insertion sort: at most six elements, no allocation).
fn sort_voices(voices: &mut [i32]) {
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

/// Build the chord an incoming `pitch` selects, writing ascending MIDI pitches into `voices` and returning
/// the count. The pitch is read as a scale degree: it is taken relative to the key, snapped DOWN to the
/// scale tone at or below it (so a black key off the scale still chooses a degree rather than being dropped),
/// and thirds are stacked from there — `Chord.compile`'s `scale[step % 7] + floor(step / 7) * 12`, with
/// `rem_euclid` / `div_euclid` so a negative `degree` transposes correctly below the tonic.
///
/// The voicing is then shaped in a fixed order: `inversion` lifts the lowest voices an octave, `spread`
/// applies successive DROP voicings from the top (drop-2, then drop-3, then drop-4), and `octave` transposes
/// the result. Voices leaving MIDI range 0..=127 are DROPPED, never clamped (clamping would fold distinct
/// pitches onto one), mirroring `device-pitch`.
pub fn build_chord(state: &ChordState, pitch: u32, voices: &mut [i32; MAX_VOICES]) -> usize {
    let scale = &SCALES[clamp_i32(state.scale_index, 0, (SCALES.len() - 1) as i32) as usize];
    let key = clamp_i32(state.key, 0, 11);
    let relative = pitch as i32 - key;
    let octave = relative.div_euclid(12);
    let pitch_class = relative.rem_euclid(12);
    let mut degree = 0i32;
    let mut index = 0;
    while index < 7 {
        if scale[index] <= pitch_class {
            degree = index as i32;
        }
        index += 1;
    }
    let base_step = degree + clamp_i32(state.degree, -7, 7);
    let count = clamp_i32(state.notes, 1, MAX_VOICES as i32) as usize;
    let mut index = 0;
    while index < count {
        let step = base_step + (index as i32) * 2;
        let interval = scale[step.rem_euclid(7) as usize] + step.div_euclid(7) * 12;
        voices[index] = key + octave * 12 + interval;
        index += 1;
    }
    // Inversion lifts the lowest voices an octave, never the whole chord (that is what `octave` is for), so
    // the top voice keeps its place and the chord keeps its identity.
    let inversion = clamp_i32(state.inversion, 0, 3) as usize;
    let liftable = count - 1;
    let lifted = if inversion > liftable { liftable } else { inversion };
    let mut index = 0;
    while index < lifted {
        voices[index] += 12;
        index += 1;
    }
    sort_voices(&mut voices[..count]);
    // Spread drops voicings from the top down: step 1 drops the SECOND voice from the top an octave (drop-2),
    // step 2 also the third (drop-3), step 3 also the fourth. A step with no voice to drop is a no-op.
    let spread = clamp_i32(state.spread, 0, 3) as usize;
    let mut step = 1;
    while step <= spread {
        if count >= step + 1 {
            voices[count - 1 - step] -= 12;
        }
        step += 1;
    }
    sort_voices(&mut voices[..count]);
    let transpose = clamp_i32(state.octave, -2, 2) * 12;
    let mut kept = 0;
    let mut index = 0;
    while index < count {
        let value = voices[index] + transpose;
        if (0..=127).contains(&value) {
            voices[kept] = value;
            kept += 1;
        }
        index += 1;
    }
    kept
}

/// The velocity for voice `index` of `count`, ascending. `velocity_tilt` is bipolar: negative fades the upper
/// voices out (the chord sits under the melody), positive pushes them forward. The tilt reaches at most
/// 75% at the top voice, so even a full negative tilt leaves the voicing audible rather than silent.
fn voice_velocity(state: &ChordState, velocity: f32, index: usize, count: usize) -> f32 {
    if count <= 1 {
        return velocity.max(0.0).min(1.0);
    }
    let position = index as f32 / (count - 1) as f32;
    (velocity * (1.0 + state.velocity_tilt * 0.75 * position)).max(0.0).min(1.0)
}

fn emit(events: &mut [EventRecord], count: &mut usize, record: EventRecord) {
    if *count < events.len() {
        events[*count] = record;
        *count += 1;
    }
}

fn note_off(id: u32, pitch: u32, position: f64) -> EventRecord {
    EventRecord {position, offset: 0, kind: EVENT_NOTE_OFF, id, pitch, velocity: 0.0, cent: 0.0, duration: 0.0}
}

/// Emit `record` now when it falls inside the block, otherwise hold it until the transport reaches it. A
/// strum can push a voice past `to`; without the queue that voice would be emitted at the wrong pulse.
fn schedule(state: &mut ChordState, to: f64, record: EventRecord, events: &mut [EventRecord], count: &mut usize) {
    if record.position < to {
        emit(events, count, record);
    } else if (state.pending_count as usize) < MAX_PENDING {
        state.pending[state.pending_count as usize] = record;
        state.pending_count += 1;
    }
}

/// Emit every deferred event that has come due before `to`, removing it from the queue.
fn flush_pending(state: &mut ChordState, to: f64, events: &mut [EventRecord], count: &mut usize) {
    let mut index = 0;
    while index < state.pending_count as usize {
        if state.pending[index].position < to {
            emit(events, count, state.pending[index]);
            state.pending[index] = state.pending[state.pending_count as usize - 1];
            state.pending_count -= 1;
        } else {
            index += 1;
        }
    }
}

fn find_held(state: &ChordState, input_id: u32) -> Option<usize> {
    let mut index = 0;
    while index < state.held_count as usize {
        if state.held[index].input_id == input_id {
            return Some(index);
        }
        index += 1;
    }
    None
}

/// Note-ON before note-OFF at an equal position, matching `device-arpeggio`: a mono synth downstream still
/// holds the previous note when the next starts, so abutting chords glide instead of retriggering.
fn lifecycle_rank(record: &EventRecord) -> u8 {
    if record.kind == EVENT_NOTE_OFF { 1 } else { 0 }
}

/// Produce one block's events for `[from, to)`: flush the strum queue, then replace each incoming note-on
/// with its chord and each note-off with the releases for the voices ITS note-on produced. Returns the count
/// of position-sorted events written (note-ON before note-off at an equal position).
pub fn process(state: &mut ChordState, from: f64, to: f64, flags: u32, input: &[EventRecord], out: &mut [EventRecord]) -> usize {
    let mut events = [blank_event(); EMIT_MAX];
    let mut count = 0;
    if flags & abi::BlockFlags::DISCONTINUOUS != 0 {
        // A transport jump: release every voice at `from` and abandon the strum queue (its deferred note-ons
        // belong to a position the transport has left). A voice still waiting in that queue is released here
        // too, without ever having sounded; the unmatched note-off is ignored downstream (as `device-pitch`
        // relies on) and that is cheaper than tracking which voices the earlier blocks actually emitted.
        let mut index = 0;
        while index < state.held_count as usize {
            let held = state.held[index];
            let mut voice = 0;
            while voice < held.count as usize {
                emit(&mut events, &mut count, note_off(held.ids[voice], held.pitches[voice], from));
                voice += 1;
            }
            index += 1;
        }
        state.held_count = 0;
        state.pending_count = 0;
    } else {
        flush_pending(state, to, &mut events, &mut count);
    }
    for record in input {
        match record.kind {
            EVENT_NOTE_ON => {
                let mut voices = [0i32; MAX_VOICES];
                let voiced = build_chord(state, record.pitch, &mut voices);
                if voiced == 0 || (state.held_count as usize) >= MAX_HELD {
                    continue;
                }
                let strum = if state.strum > 0.0 { state.strum as f64 } else { 0.0 };
                let mut entry = Held {
                    input_id: record.id, count: voiced as u32,
                    ids: [0; MAX_VOICES], pitches: [0; MAX_VOICES], starts: [0.0; MAX_VOICES]
                };
                let mut voice = 0;
                while voice < voiced {
                    let id = state.next_id;
                    state.next_id = state.next_id.wrapping_add(1);
                    let position = record.position + voice as f64 * strum;
                    entry.ids[voice] = id;
                    entry.pitches[voice] = voices[voice] as u32;
                    entry.starts[voice] = position;
                    schedule(state, to, EventRecord {
                        position,
                        offset: record.offset,
                        kind: EVENT_NOTE_ON,
                        id,
                        pitch: voices[voice] as u32,
                        velocity: voice_velocity(state, record.velocity, voice, voiced),
                        cent: record.cent,
                        duration: record.duration
                    }, &mut events, &mut count);
                    voice += 1;
                }
                state.held[state.held_count as usize] = entry;
                state.held_count += 1;
            }
            EVENT_NOTE_OFF => {
                if let Some(index) = find_held(state, record.id) {
                    let held = state.held[index];
                    state.held[index] = state.held[state.held_count as usize - 1];
                    state.held_count -= 1;
                    let strum = if state.strum > 0.0 { state.strum as f64 } else { 0.0 };
                    let mut voice = 0;
                    while voice < held.count as usize {
                        let staggered = record.position + voice as f64 * strum;
                        let earliest = held.starts[voice] + MIN_LENGTH;
                        let position = if staggered < earliest { earliest } else { staggered };
                        schedule(state, to, note_off(held.ids[voice], held.pitches[voice], position), &mut events, &mut count);
                        voice += 1;
                    }
                }
            }
            _ => emit(&mut events, &mut count, *record)
        }
    }
    events[..count].sort_unstable_by(|left, right| {
        left.position.partial_cmp(&right.position).unwrap_or(core::cmp::Ordering::Equal)
            .then(lifecycle_rank(left).cmp(&lifecycle_rank(right)))
    });
    let written = count.min(out.len());
    out[..written].copy_from_slice(&events[..written]);
    written
}

/// What the host wires this device as (read at load): a MIDI effect (a pull source in the event chain).
#[no_mangle]
pub extern "C" fn kind() -> u32 {
    abi::DEVICE_KIND_MIDI_EFFECT
}

/// Bytes the engine must allocate (zeroed) for one instance's state block.
#[no_mangle]
pub extern "C" fn state_size(_sample_rate: f32) -> u32 {
    core::mem::size_of::<ChordState>() as u32
}

/// Seed a (zeroed) state with the box parameter defaults and bind each parameter. Kept separate from the
/// `init` export so tests can seed a state directly (the export takes a `u32` pointer, which truncates on a
/// 64-bit native test build). Mirrors the `ChordDeviceBox` field defaults (C major, a triad, no strum).
pub fn seed(state: &mut ChordState) {
    state.key = 0;
    state.scale_index = 0;
    state.degree = 0;
    state.notes = 3;
    state.inversion = 0;
    state.spread = 0;
    state.octave = 0;
    state.strum = 0.0;
    state.velocity_tilt = 0.0;
    state.key_id = abi::bind_parameter(&KEY_FIELD);
    state.scale_id = abi::bind_parameter(&SCALE_FIELD);
    state.degree_id = abi::bind_parameter(&DEGREE_FIELD);
    state.notes_id = abi::bind_parameter(&NOTES_FIELD);
    state.inversion_id = abi::bind_parameter(&INVERSION_FIELD);
    state.spread_id = abi::bind_parameter(&SPREAD_FIELD);
    state.octave_id = abi::bind_parameter(&OCTAVE_FIELD);
    state.strum_id = abi::bind_parameter(&STRUM_FIELD);
    state.velocity_id = abi::bind_parameter(&VELOCITY_FIELD);
}

#[no_mangle]
pub extern "C" fn init(state_ptr: u32, _sample_rate: f32) {
    seed(unsafe { &mut *(state_ptr as *mut ChordState) });
}

fn apply_parameter(state: &mut ChordState, id: u32, value: ParamValue) {
    if id == state.key_id {
        state.key = abi::int_value(value, &KEY_MAPPING);
    } else if id == state.scale_id {
        state.scale_index = abi::int_value(value, &SCALE_MAPPING);
    } else if id == state.degree_id {
        state.degree = abi::int_value(value, &DEGREE_MAPPING);
    } else if id == state.notes_id {
        state.notes = abi::int_value(value, &NOTES_MAPPING);
    } else if id == state.inversion_id {
        state.inversion = abi::int_value(value, &INVERSION_MAPPING);
    } else if id == state.spread_id {
        state.spread = abi::int_value(value, &SPREAD_MAPPING);
    } else if id == state.octave_id {
        state.octave = abi::int_value(value, &OCTAVE_MAPPING);
    } else if id == state.strum_id {
        state.strum = abi::float_value(value, &STRUM_MAPPING);
    } else if id == state.velocity_id {
        state.velocity_tilt = abi::float_value(value, &VELOCITY_MAPPING);
    }
}

#[no_mangle]
pub extern "C" fn parameter_changed(state_ptr: u32, id: u32, kind: u32, value: f32, modulation: f32) {
    let state = unsafe { &mut *(state_ptr as *mut ChordState) };
    apply_parameter(state, id, ParamValue::from_wire(kind, value, modulation));
}

/// Parity probe: the REAL value stored for a UNIT automation value, ids in `init` bind order.
#[no_mangle]
pub extern "C" fn map_parameter(id: u32, unit: f32) -> f32 {
    let value = ParamValue::Unit(unit);
    match id {
        0 => abi::int_value(value, &KEY_MAPPING) as f32,
        1 => abi::int_value(value, &SCALE_MAPPING) as f32,
        2 => abi::int_value(value, &DEGREE_MAPPING) as f32,
        3 => abi::int_value(value, &NOTES_MAPPING) as f32,
        4 => abi::int_value(value, &INVERSION_MAPPING) as f32,
        5 => abi::int_value(value, &SPREAD_MAPPING) as f32,
        6 => abi::int_value(value, &OCTAVE_MAPPING) as f32,
        7 => abi::float_value(value, &STRUM_MAPPING),
        8 => abi::float_value(value, &VELOCITY_MAPPING),
        _ => f32::NAN
    }
}

/// Transport STOP: drop the sounding-note table and the strum queue. Parameter values and bound ids survive
/// (bindings, not sounding state), mirroring `device-pitch`.
#[no_mangle]
pub extern "C" fn reset(state_ptr: u32) {
    let state = unsafe { &mut *(state_ptr as *mut ChordState) };
    state.held_count = 0;
    state.pending_count = 0;
}

#[no_mangle]
pub extern "C" fn process_events(from: f64, to: f64, flags: u32, state_ptr: u32, out_ptr: u32, max: u32) -> u32 {
    let state = unsafe { &mut *(state_ptr as *mut ChordState) };
    let out = unsafe { core::slice::from_raw_parts_mut(out_ptr as *mut EventRecord, max as usize) };
    // Split the range at parameter-update boundaries (as `render_midi_effect` does) so automated key / scale /
    // degree / voicing take effect at the right pulse. The source is pulled per sub-range.
    let mut written = 0usize;
    let mut sub_from = from;
    let mut boundary = abi::first_update_position(from);
    loop {
        let sub_to = if boundary < to { boundary } else { to };
        let mut scratch = [blank_event(); PULL_SCRATCH];
        let pulled = abi::pull_events(sub_from, sub_to, flags, &mut scratch);
        written += process(state, sub_from, sub_to, flags, &scratch[..pulled], &mut out[written..]);
        if sub_to >= to {
            break;
        }
        abi::apply_param_changes::<ChordState>(state, boundary, apply_parameter);
        sub_from = sub_to;
        boundary = abi::next_update_position(boundary);
    }
    written as u32
}

#[cfg(test)]
mod tests {
    //! The chord builder (degree selection, stacking, inversion, spread, octave, velocity tilt) and the event
    //! pipeline (voice ids, strum deferral, releases). In-crate so the tests can seed the private state.
    use super::*;

    fn state() -> ChordState {
        let mut state: ChordState = unsafe { core::mem::zeroed() };
        state.notes = 3;
        state
    }

    fn chord(state: &ChordState, pitch: u32) -> Vec<i32> {
        let mut voices = [0i32; MAX_VOICES];
        let count = build_chord(state, pitch, &mut voices);
        voices[..count].to_vec()
    }

    #[test]
    fn a_root_note_becomes_the_diatonic_triad_of_its_degree() {
        let state = state();
        assert_eq!(chord(&state, 60), vec![60, 64, 67], "C4 in C major -> C E G");
        assert_eq!(chord(&state, 62), vec![62, 65, 69], "D4 -> the ii chord D F A, not a major triad");
        assert_eq!(chord(&state, 71), vec![71, 74, 77], "B4 -> the diminished vii chord B D F");
    }

    #[test]
    fn a_note_off_the_scale_snaps_down_to_a_degree_instead_of_being_dropped() {
        let state = state();
        assert_eq!(chord(&state, 61), chord(&state, 60), "C#4 selects the same degree as C4");
    }

    #[test]
    fn the_key_transposes_the_whole_scale() {
        let mut state = state();
        state.key = 2;
        assert_eq!(chord(&state, 62), vec![62, 66, 69], "D major -> D F# A");
    }

    #[test]
    fn the_scale_selects_the_chord_quality() {
        let mut state = state();
        state.scale_index = 1;
        assert_eq!(chord(&state, 60), vec![60, 63, 67], "C minor -> C Eb G");
        state.scale_index = 2;
        assert_eq!(chord(&state, 67), vec![67, 71, 74], "harmonic minor raises the seventh, so V is major");
    }

    #[test]
    fn num_notes_stacks_further_thirds() {
        let mut state = state();
        state.notes = 1;
        assert_eq!(chord(&state, 60), vec![60]);
        state.notes = 4;
        assert_eq!(chord(&state, 60), vec![60, 64, 67, 71], "a seventh");
        state.notes = 6;
        assert_eq!(chord(&state, 60), vec![60, 64, 67, 71, 74, 77], "up to the eleventh");
    }

    #[test]
    fn degree_transposes_diatonically_not_chromatically() {
        let mut state = state();
        state.degree = 3;
        assert_eq!(chord(&state, 60), vec![65, 69, 72], "three scale steps up from I is the IV chord");
        state.degree = -7;
        assert_eq!(chord(&state, 60), vec![48, 52, 55], "a full negative octave of scale steps");
    }

    #[test]
    fn inversion_lifts_the_lowest_voices_and_never_the_whole_chord() {
        let mut state = state();
        state.inversion = 1;
        assert_eq!(chord(&state, 60), vec![64, 67, 72], "first inversion");
        state.inversion = 2;
        assert_eq!(chord(&state, 60), vec![67, 72, 76], "second inversion");
        state.inversion = 3;
        assert_eq!(chord(&state, 60), vec![67, 72, 76], "a triad has only two voices to lift");
    }

    #[test]
    fn spread_drops_voices_from_the_top_an_octave() {
        let mut state = state();
        state.spread = 1;
        assert_eq!(chord(&state, 60), vec![52, 60, 67], "drop-2 sends the second voice from the top down");
        state.notes = 4;
        state.spread = 2;
        // Cmaj7 closed is 60 64 67 71; counting from the top, drop-2-and-3 lowers 67 and 64 an octave.
        assert_eq!(chord(&state, 60), vec![52, 55, 60, 71], "drop-2 and drop-3 open a seventh chord");
    }

    #[test]
    fn octave_transposes_the_finished_voicing() {
        let mut state = state();
        state.octave = -1;
        assert_eq!(chord(&state, 60), vec![48, 52, 55]);
        state.octave = 2;
        assert_eq!(chord(&state, 60), vec![84, 88, 91]);
    }

    #[test]
    fn voices_leaving_midi_range_are_dropped_not_clamped() {
        assert_eq!(chord(&state(), 127), vec![127], "the upper thirds exceed 127 and are dropped, never folded");
        let mut low = state();
        low.octave = -2;
        assert!(chord(&low, 0).iter().all(|pitch| (0..=127).contains(pitch)), "nothing falls below 0 either");
    }

    #[test]
    fn velocity_tilt_fades_or_lifts_the_upper_voices() {
        let mut state = state();
        assert_eq!(voice_velocity(&state, 0.8, 2, 3), 0.8, "no tilt leaves every voice alone");
        state.velocity_tilt = -1.0;
        assert_eq!(voice_velocity(&state, 0.8, 0, 3), 0.8, "the bottom voice is never tilted");
        assert!((voice_velocity(&state, 0.8, 2, 3) - 0.2).abs() < 1e-6, "the top voice keeps 25% at full negative tilt");
        state.velocity_tilt = 1.0;
        assert!(voice_velocity(&state, 0.5, 2, 3) > 0.5, "a positive tilt pushes the upper voices forward");
        assert_eq!(voice_velocity(&state, 1.0, 2, 3), 1.0, "never above full scale");
    }

    fn note_on(id: u32, position: f64, pitch: u32) -> EventRecord {
        EventRecord {position, offset: 0, kind: EVENT_NOTE_ON, id, pitch, velocity: 0.8, cent: 0.0, duration: 480.0}
    }

    fn release(id: u32, position: f64, pitch: u32) -> EventRecord {
        EventRecord {position, offset: 0, kind: EVENT_NOTE_OFF, id, pitch, velocity: 0.0, cent: 0.0, duration: 0.0}
    }

    fn pitches(out: &[EventRecord], kind: u32) -> Vec<u32> {
        out.iter().filter(|event| event.kind == kind).map(|event| event.pitch).collect()
    }

    #[test]
    fn one_note_on_emits_the_whole_chord_and_its_note_off_releases_every_voice() {
        let mut state = state();
        let mut out = [blank_event(); 32];
        let written = process(&mut state, 0.0, 480.0, 0, &[note_on(7, 0.0, 60)], &mut out);
        assert_eq!(pitches(&out[..written], EVENT_NOTE_ON), vec![60, 64, 67]);
        let ids: Vec<u32> = out[..written].iter().map(|event| event.id).collect();
        assert_eq!(ids.len(), 3, "each voice carries its own generated id");
        assert!(ids.iter().all(|id| *id != 7), "the voices do not reuse the input note id");
        let written = process(&mut state, 480.0, 960.0, 0, &[release(7, 480.0, 60)], &mut out);
        assert_eq!(pitches(&out[..written], EVENT_NOTE_OFF), vec![60, 64, 67]);
        assert_eq!(out[..written].iter().map(|event| event.id).collect::<Vec<u32>>(), ids,
                   "the release carries the ids ITS note-on generated");
        assert_eq!(state.held_count, 0, "the held entry is freed");
    }

    #[test]
    fn a_note_off_replays_the_voicing_its_note_on_produced_across_a_mid_note_edit() {
        let mut state = state();
        let mut out = [blank_event(); 32];
        process(&mut state, 0.0, 480.0, 0, &[note_on(7, 0.0, 60)], &mut out);
        state.degree = 4; // the chord is edited while the note sounds
        let written = process(&mut state, 480.0, 960.0, 0, &[release(7, 480.0, 60)], &mut out);
        assert_eq!(pitches(&out[..written], EVENT_NOTE_OFF), vec![60, 64, 67],
                   "the release matches what sounded, not what the parameters now say");
    }

    #[test]
    fn two_overlapping_input_notes_are_released_independently() {
        let mut state = state();
        let mut out = [blank_event(); 32];
        process(&mut state, 0.0, 100.0, 0, &[note_on(1, 0.0, 60), note_on(2, 50.0, 62)], &mut out);
        assert_eq!(state.held_count, 2);
        let written = process(&mut state, 100.0, 200.0, 0, &[release(1, 100.0, 60)], &mut out);
        assert_eq!(pitches(&out[..written], EVENT_NOTE_OFF), vec![60, 64, 67], "only the first chord releases");
        assert_eq!(state.held_count, 1, "the second note keeps sounding");
    }

    #[test]
    fn strum_defers_voices_past_the_block_and_they_arrive_on_later_blocks() {
        let mut state = state();
        state.strum = 10.0;
        let mut out = [blank_event(); 32];
        let written = process(&mut state, 0.0, 5.0, 0, &[note_on(1, 0.0, 60)], &mut out);
        assert_eq!(pitches(&out[..written], EVENT_NOTE_ON), vec![60], "only the bottom voice falls in this block");
        assert_eq!(state.pending_count, 2, "the other two wait for their pulse");
        let written = process(&mut state, 5.0, 15.0, 0, &[], &mut out);
        assert_eq!(pitches(&out[..written], EVENT_NOTE_ON), vec![64], "the second voice arrives at pulse 10");
        let written = process(&mut state, 15.0, 25.0, 0, &[], &mut out);
        assert_eq!(pitches(&out[..written], EVENT_NOTE_ON), vec![67], "the third at pulse 20");
        assert_eq!(state.pending_count, 0);
    }

    #[test]
    fn a_strummed_voice_never_releases_before_its_own_note_on() {
        // A staccato note far shorter than the strum: voice 2 starts at pulse 200 but the input released at 10.
        let mut state = state();
        state.strum = 100.0;
        let mut out = [blank_event(); 32];
        let written = process(&mut state, 0.0, 1000.0, 0, &[note_on(1, 0.0, 60), release(1, 10.0, 60)], &mut out);
        let events = &out[..written];
        for event in events.iter().filter(|event| event.kind == EVENT_NOTE_OFF) {
            let start = events.iter()
                .find(|other| other.kind == EVENT_NOTE_ON && other.id == event.id)
                .expect("every release has its note-on in the same block");
            assert!(event.position > start.position, "a release never precedes its own note-on");
        }
    }

    #[test]
    fn a_transport_jump_releases_everything_held_and_drops_the_strum_queue() {
        let mut state = state();
        state.strum = 10.0;
        let mut out = [blank_event(); 32];
        process(&mut state, 0.0, 5.0, 0, &[note_on(1, 0.0, 60)], &mut out);
        assert_eq!(state.pending_count, 2);
        let written = process(&mut state, 100.0, 110.0, abi::BlockFlags::DISCONTINUOUS, &[], &mut out);
        assert_eq!(pitches(&out[..written], EVENT_NOTE_OFF), vec![60, 64, 67]);
        assert!(out[..written].iter().all(|event| event.position == 100.0), "released at `from`");
        assert_eq!(state.held_count, 0);
        assert_eq!(state.pending_count, 0, "deferred voices belong to a position the transport has left");
    }

    #[test]
    fn output_is_sorted_by_position_with_note_ons_before_note_offs() {
        let mut state = state();
        let mut out = [blank_event(); 32];
        process(&mut state, 0.0, 100.0, 0, &[note_on(1, 0.0, 60)], &mut out);
        let written = process(&mut state, 100.0, 300.0, 0, &[release(1, 200.0, 60), note_on(2, 200.0, 62)], &mut out);
        let events = &out[..written];
        assert!(events.windows(2).all(|pair| pair[0].position <= pair[1].position), "sorted by position");
        let first_off = events.iter().position(|event| event.kind == EVENT_NOTE_OFF).unwrap();
        let last_on = events.iter().rposition(|event| event.kind == EVENT_NOTE_ON).unwrap();
        assert!(last_on < first_off, "at an equal position every note-on precedes the note-offs");
    }

    #[test]
    fn unknown_event_kinds_pass_through_untouched() {
        let mut state = state();
        let mut out = [blank_event(); 32];
        let mut other = blank_event();
        other.kind = 42;
        other.pitch = 99;
        let written = process(&mut state, 0.0, 100.0, 0, &[other], &mut out);
        assert_eq!(written, 1);
        assert_eq!(out[0].kind, 42);
        assert_eq!(out[0].pitch, 99);
    }

    #[test]
    fn map_parameter_reports_the_adapter_ranges_in_bind_order() {
        assert_eq!(map_parameter(0, 1.0), 11.0, "key spans the twelve pitch classes");
        assert_eq!(map_parameter(1, 1.0), (SCALES.len() - 1) as f32);
        assert_eq!(map_parameter(2, 0.0), -7.0);
        assert_eq!(map_parameter(2, 1.0), 7.0);
        assert_eq!(map_parameter(3, 1.0), MAX_VOICES as f32);
        assert_eq!(map_parameter(4, 1.0), 3.0);
        assert_eq!(map_parameter(6, 0.0), -2.0);
        assert_eq!(map_parameter(7, 1.0), MAX_STRUM as f32);
        assert_eq!(map_parameter(8, 0.5), 0.0, "velocity is bipolar and centred");
        assert!(map_parameter(99, 0.5).is_nan());
    }
}
