//! The KADENZ MIDI-effect device (`KadenzDeviceBox`): a self-clocked chord-progression player. Unlike
//! `device-chord`, which harmonizes notes it receives, Kadenz needs NO input at all — it free-runs on the
//! transport like `device-euclid`, walking a rate grid and emitting a full chord voicing whenever the
//! progression reaches a new step.
//!
//! The progression is an AUTHORED list: up to 32 steps read from the box as one packed `int32` array
//! (`KadenzStep.pack` on the TS side owns the same layout), plus a `length` saying how many are live. A
//! step carries a scale degree, an optional explicit quality (so a progression can leave the scale —
//! borrowed chords, secondary dominants), its duration in grid units, an inversion offset, and a rest flag.
//!
//! Parameters: key `[10]`, scaleIndex `[11]`, rateIndex `[12]`, gate `[13]`, numNotes `[14]`,
//! inversion `[15]`, spread `[16]`, octave `[17]`, strum `[18]`, velocity `[19]`, velocityTilt `[20]`.
//! Observed (non-automatable) fields: length `[21]`, steps `[30]`.
//!
//! Voicing is shared with `device-chord` through `device-chord-common`; scheduling is shared with
//! `device-euclid` through `device-sequencer-common`.

#![cfg_attr(target_family = "wasm", no_std)]

#[cfg(target_family = "wasm")]
use core::panic::PanicInfo;
use abi::{EventRecord, FieldValue, ParamValue, EVENT_NOTE_ON};
use device_chord_common::{
    apply_inversion, apply_spread, clamp_i32, stack_diatonic, stack_quality, transpose_into_range,
    voice_velocity, MAX_VOICES, QUALITY_AUTO, SCALES
};
use device_sequencer_common::{
    emit, first_index, lifecycle_rank, note_off, rate_ppqn, release_completed, Retained, EMIT_MAX, MAX_RETAINED
};
use math::value_mapping::{Linear, LinearInteger};

#[cfg(target_family = "wasm")]
#[panic_handler]
fn panic(info: &PanicInfo) -> ! {
    abi::panic_to_host(info)
}

/// Steps in one progression. Matches the `steps` array length in `KadenzDeviceBox`.
pub const MAX_STEPS: usize = 32;
/// Strum-deferred note-ons waiting for the transport to reach them (a wide strum can push a voice past the
/// end of the block its chord started in).
const MAX_PENDING: usize = 64;
/// The widest strum, in pulses: 240 = a 1/16 at `PPQN.Quarter` 960.
const MAX_STRUM: f32 = 240.0;
/// The octave the progression is voiced in before the `octave` transpose: `5 * 12` puts degree I of key C
/// at middle C.
const BASE_OCTAVE: i32 = 5;
/// The born default of a `steps` element: degree I, quality Auto, four grid units long. MUST equal the
/// schema's element default so a fresh device sounds the same before any field is delivered.
pub const DEFAULT_STEP: i32 = 3 << 7;

const KEY_FIELD: [u16; 1] = [10];
const SCALE_FIELD: [u16; 1] = [11];
const RATE_FIELD: [u16; 1] = [12];
const GATE_FIELD: [u16; 1] = [13];
const NOTES_FIELD: [u16; 1] = [14];
const INVERSION_FIELD: [u16; 1] = [15];
const SPREAD_FIELD: [u16; 1] = [16];
const OCTAVE_FIELD: [u16; 1] = [17];
const STRUM_FIELD: [u16; 1] = [18];
const VELOCITY_FIELD: [u16; 1] = [19];
const TILT_FIELD: [u16; 1] = [20];
const LENGTH_FIELD: [u16; 1] = [21];
const STEPS_FIELD: [u16; 1] = [30];

const KEY_MAPPING: LinearInteger = LinearInteger {min: 0, max: 11};
const SCALE_MAPPING: LinearInteger = LinearInteger {min: 0, max: (SCALES.len() - 1) as i32};
const RATE_MAPPING: LinearInteger = LinearInteger {min: 0, max: 16};
const GATE_MAPPING: Linear = Linear {min: 0.0, max: 2.0};
const NOTES_MAPPING: LinearInteger = LinearInteger {min: 1, max: MAX_VOICES as i32};
const INVERSION_MAPPING: LinearInteger = LinearInteger {min: 0, max: 3};
const SPREAD_MAPPING: LinearInteger = LinearInteger {min: 0, max: 3};
const OCTAVE_MAPPING: LinearInteger = LinearInteger {min: -2, max: 2};
const STRUM_MAPPING: Linear = Linear {min: 0.0, max: MAX_STRUM};
const VELOCITY_MAPPING: Linear = Linear {min: 0.0, max: 1.0};
const TILT_MAPPING: Linear = Linear::bipolar();

/// One decoded progression step. The packed `int32` layout is the WASM CONTRACT shared with the TS
/// `KadenzStep.pack` / `unpack`: degree `0..2`, quality `3..6`, duration-1 `7..10`, inversion `11..12`,
/// rest `13`.
#[derive(Clone, Copy, PartialEq, Debug)]
pub struct Step {
    pub degree: i32,
    pub quality: i32,
    pub duration: i32,
    pub inversion: i32,
    pub rest: bool
}

pub fn unpack_step(bits: i32) -> Step {
    Step {
        degree: bits & 0x7,
        quality: (bits >> 3) & 0xF,
        duration: ((bits >> 7) & 0xF) + 1,
        inversion: (bits >> 11) & 0x3,
        rest: (bits >> 13) & 1 == 1
    }
}

pub struct KadenzState {
    retained: [Retained; MAX_RETAINED],
    retained_count: u32,
    pending: [EventRecord; MAX_PENDING],
    pending_count: u32,
    next_id: u32,
    key: i32,
    scale_index: i32,
    rate: f64,
    gate: f32,
    notes: i32,
    inversion: i32,
    spread: i32,
    octave: i32,
    strum: f32,
    velocity: f32,
    velocity_tilt: f32,
    key_id: u32,
    scale_id: u32,
    rate_id: u32,
    gate_id: u32,
    notes_id: u32,
    inversion_id: u32,
    spread_id: u32,
    octave_id: u32,
    strum_id: u32,
    velocity_id: u32,
    tilt_id: u32,
    length_id: u32,
    steps_id: u32,
    length: i32,
    steps: [i32; MAX_STEPS],
    /// Grid-unit offset at which each step begins, and the total units in one pass. Rebuilt only when the
    /// steps or the length change, exactly as Euclid caches its Bjorklund pattern.
    starts: [i32; MAX_STEPS],
    cycle: i32,
    table_dirty: bool
}

fn blank_event() -> EventRecord {
    EventRecord {position: 0.0, offset: 0, kind: 0, id: 0, pitch: 0, velocity: 0.0, cent: 0.0, duration: 0.0}
}

fn active_length(state: &KadenzState) -> usize {
    clamp_i32(state.length, 1, MAX_STEPS as i32) as usize
}

/// Rebuild the cumulative start table. Rests still occupy their time, so the cycle length is the sum of
/// every active step's duration.
fn update_table(state: &mut KadenzState) {
    let length = active_length(state);
    let mut accumulated = 0;
    let mut index = 0;
    while index < length {
        state.starts[index] = accumulated;
        accumulated += unpack_step(state.steps[index]).duration;
        index += 1;
    }
    state.cycle = accumulated;
    state.table_dirty = false;
}

/// The step that BEGINS at grid `index`, or `None` when the index falls inside a step already sounding.
fn step_beginning_at(state: &KadenzState, index: i64) -> Option<usize> {
    if state.cycle <= 0 {
        return None;
    }
    let phase = index.rem_euclid(state.cycle as i64) as i32;
    let length = active_length(state);
    let mut step = 0;
    while step < length {
        if state.starts[step] == phase {
            return Some(step);
        }
        step += 1;
    }
    None
}

/// Voice the chord a step calls for, writing ascending MIDI pitches into `voices` and returning the count.
/// `QUALITY_AUTO` stacks diatonic thirds (the degree's own quality in the key); any other quality spells its
/// explicit intervals on the degree's root, which is what lets a progression leave the scale.
pub fn build_step_chord(state: &KadenzState, step: Step, voices: &mut [i32; MAX_VOICES]) -> usize {
    let scale = &SCALES[clamp_i32(state.scale_index, 0, (SCALES.len() - 1) as i32) as usize];
    let key = clamp_i32(state.key, 0, 11);
    let degree = clamp_i32(step.degree, 0, 6);
    let count = clamp_i32(state.notes, 1, MAX_VOICES as i32) as usize;
    if step.quality == QUALITY_AUTO {
        stack_diatonic(scale, key, BASE_OCTAVE, degree, count, voices);
    } else {
        stack_quality(key + BASE_OCTAVE * 12 + scale[degree as usize], step.quality, count, voices);
    }
    let inversion = clamp_i32(state.inversion + step.inversion, 0, 3) as usize;
    apply_inversion(voices, count, inversion);
    apply_spread(voices, count, clamp_i32(state.spread, 0, 3) as usize);
    transpose_into_range(voices, count, clamp_i32(state.octave, -2, 2) * 12)
}

/// Emit `record` now when it falls inside the block, otherwise hold it until the transport reaches it.
fn schedule(state: &mut KadenzState, to: f64, record: EventRecord, events: &mut [EventRecord], count: &mut usize) {
    if record.position < to {
        emit(events, count, record);
    } else if (state.pending_count as usize) < MAX_PENDING {
        state.pending[state.pending_count as usize] = record;
        state.pending_count += 1;
    }
}

fn flush_pending(state: &mut KadenzState, to: f64, events: &mut [EventRecord], count: &mut usize) {
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

pub fn process(state: &mut KadenzState, from: f64, to: f64, flags: u32, out: &mut [EventRecord]) -> usize {
    let mut events = [blank_event(); EMIT_MAX];
    let mut count = 0;
    let discontinuous = flags & abi::BlockFlags::DISCONTINUOUS != 0;
    let transporting = flags & abi::BlockFlags::TRANSPORTING != 0;
    if discontinuous {
        // A transport jump: release everything sounding at `from` and abandon the strum queue, whose
        // deferred note-ons belong to a position the transport has left.
        let mut index = 0;
        while index < state.retained_count as usize {
            let retained = state.retained[index];
            emit(&mut events, &mut count, note_off(retained.id, retained.pitch, from));
            index += 1;
        }
        state.retained_count = 0;
        state.pending_count = 0;
    } else {
        flush_pending(state, to, &mut events, &mut count);
        release_completed(&mut state.retained, &mut state.retained_count, to, &mut events, &mut count);
    }
    if transporting && state.rate > 0.0 {
        if state.table_dirty {
            update_table(state);
        }
        let strum = if state.strum > 0.0 { state.strum as f64 } else { 0.0 };
        let mut index = first_index(from, state.rate);
        let mut position = index as f64 * state.rate;
        while position < to {
            if let Some(step_index) = step_beginning_at(state, index) {
                let step = unpack_step(state.steps[step_index]);
                if !step.rest {
                    let mut voices = [0i32; MAX_VOICES];
                    let voiced = build_step_chord(state, step, &mut voices);
                    let span = step.duration as f64 * state.rate * state.gate.max(0.0) as f64;
                    let duration = if span < 1.0 { 1.0 } else { span };
                    let mut voice = 0;
                    while voice < voiced && (state.retained_count as usize) < MAX_RETAINED {
                        let id = state.next_id;
                        state.next_id = state.next_id.wrapping_add(1);
                        let start = position + voice as f64 * strum;
                        let pitch = voices[voice] as u32;
                        schedule(state, to, EventRecord {
                            position: start,
                            offset: 0,
                            kind: EVENT_NOTE_ON,
                            id,
                            pitch,
                            velocity: voice_velocity(state.velocity_tilt, state.velocity, voice, voiced),
                            cent: 0.0,
                            duration
                        }, &mut events, &mut count);
                        state.retained[state.retained_count as usize] =
                            Retained {id, pitch, complete: start + duration};
                        state.retained_count += 1;
                        voice += 1;
                    }
                }
            }
            index += 1;
            position = index as f64 * state.rate;
        }
    }
    release_completed(&mut state.retained, &mut state.retained_count, to, &mut events, &mut count);
    events[..count].sort_unstable_by(|left, right| {
        left.position.partial_cmp(&right.position).unwrap_or(core::cmp::Ordering::Equal)
            .then(lifecycle_rank(left).cmp(&lifecycle_rank(right)))
    });
    let written = count.min(out.len());
    out[..written].copy_from_slice(&events[..written]);
    written
}

#[no_mangle]
pub extern "C" fn kind() -> u32 {
    abi::DEVICE_KIND_MIDI_EFFECT
}

#[no_mangle]
pub extern "C" fn state_size(_sample_rate: f32) -> u32 {
    core::mem::size_of::<KadenzState>() as u32
}

/// Seed a (zeroed) state with the box defaults and bind every parameter / observed field. Kept separate
/// from the `init` export so tests can seed a state directly.
pub fn seed(state: &mut KadenzState) {
    state.next_id = 1;
    state.key = 0;
    state.scale_index = 0;
    state.rate = rate_ppqn(3); // a quarter note per grid unit, so a four-unit step is one bar
    state.gate = 0.9;
    state.notes = 3;
    state.inversion = 0;
    state.spread = 0;
    state.octave = 0;
    state.strum = 0.0;
    state.velocity = 0.8;
    state.velocity_tilt = 0.0;
    state.length = 4;
    let mut index = 0;
    while index < MAX_STEPS {
        state.steps[index] = DEFAULT_STEP;
        index += 1;
    }
    state.table_dirty = true;
    state.key_id = abi::bind_parameter(&KEY_FIELD);
    state.scale_id = abi::bind_parameter(&SCALE_FIELD);
    state.rate_id = abi::bind_parameter(&RATE_FIELD);
    state.gate_id = abi::bind_parameter(&GATE_FIELD);
    state.notes_id = abi::bind_parameter(&NOTES_FIELD);
    state.inversion_id = abi::bind_parameter(&INVERSION_FIELD);
    state.spread_id = abi::bind_parameter(&SPREAD_FIELD);
    state.octave_id = abi::bind_parameter(&OCTAVE_FIELD);
    state.strum_id = abi::bind_parameter(&STRUM_FIELD);
    state.velocity_id = abi::bind_parameter(&VELOCITY_FIELD);
    state.tilt_id = abi::bind_parameter(&TILT_FIELD);
    state.length_id = abi::observe_field(&LENGTH_FIELD);
    state.steps_id = abi::observe_field(&STEPS_FIELD);
}

#[no_mangle]
pub extern "C" fn init(state_ptr: u32, _sample_rate: f32) {
    seed(unsafe { &mut *(state_ptr as *mut KadenzState) });
}

fn apply_parameter(state: &mut KadenzState, id: u32, value: ParamValue) {
    if id == state.key_id {
        state.key = abi::int_value(value, &KEY_MAPPING);
    } else if id == state.scale_id {
        state.scale_index = abi::int_value(value, &SCALE_MAPPING);
    } else if id == state.rate_id {
        state.rate = rate_ppqn(abi::int_value(value, &RATE_MAPPING));
    } else if id == state.gate_id {
        state.gate = abi::float_value(value, &GATE_MAPPING);
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
        state.velocity = abi::float_value(value, &VELOCITY_MAPPING);
    } else if id == state.tilt_id {
        state.velocity_tilt = abi::float_value(value, &TILT_MAPPING);
    }
}

fn apply_field(state: &mut KadenzState, id: u32, value: FieldValue) {
    if id == state.length_id {
        if let FieldValue::Int(length) = value {
            state.length = length;
            state.table_dirty = true;
        }
    } else if id == state.steps_id {
        if let FieldValue::Ints(words) = value {
            let used = words.len().min(MAX_STEPS);
            let mut index = 0;
            while index < used {
                state.steps[index] = words[index];
                index += 1;
            }
            state.table_dirty = true;
        }
    }
}

#[no_mangle]
pub extern "C" fn parameter_changed(state_ptr: u32, id: u32, kind: u32, value: f32, modulation: f32) {
    let state = unsafe { &mut *(state_ptr as *mut KadenzState) };
    apply_parameter(state, id, ParamValue::from_wire(kind, value, modulation));
}

#[no_mangle]
pub extern "C" fn field_changed(state_ptr: u32, id: u32, kind: u32, bits: u32, len: u32) {
    let state = unsafe { &mut *(state_ptr as *mut KadenzState) };
    apply_field(state, id, unsafe { FieldValue::from_wire(kind, bits, len) });
}

/// Parity probe: the REAL value stored for a UNIT automation value, ids in `seed` bind order.
#[no_mangle]
pub extern "C" fn map_parameter(id: u32, unit: f32) -> f32 {
    let value = ParamValue::Unit(unit);
    match id {
        0 => abi::int_value(value, &KEY_MAPPING) as f32,
        1 => abi::int_value(value, &SCALE_MAPPING) as f32,
        2 => abi::int_value(value, &RATE_MAPPING) as f32,
        3 => abi::float_value(value, &GATE_MAPPING),
        4 => abi::int_value(value, &NOTES_MAPPING) as f32,
        5 => abi::int_value(value, &INVERSION_MAPPING) as f32,
        6 => abi::int_value(value, &SPREAD_MAPPING) as f32,
        7 => abi::int_value(value, &OCTAVE_MAPPING) as f32,
        8 => abi::float_value(value, &STRUM_MAPPING),
        9 => abi::float_value(value, &VELOCITY_MAPPING),
        10 => abi::float_value(value, &TILT_MAPPING),
        _ => f32::NAN
    }
}

/// Transport STOP: drop sounding voices and the strum queue. Parameter values, observed fields and bound
/// ids survive (bindings, not sounding state).
#[no_mangle]
pub extern "C" fn reset(state_ptr: u32) {
    let state = unsafe { &mut *(state_ptr as *mut KadenzState) };
    state.retained_count = 0;
    state.pending_count = 0;
}

#[no_mangle]
pub extern "C" fn process_events(from: f64, to: f64, flags: u32, state_ptr: u32, out_ptr: u32, max: u32) -> u32 {
    let state = unsafe { &mut *(state_ptr as *mut KadenzState) };
    let out = unsafe { core::slice::from_raw_parts_mut(out_ptr as *mut EventRecord, max as usize) };
    let mut written = 0usize;
    let mut sub_from = from;
    let mut boundary = abi::first_update_position(from);
    loop {
        let sub_to = if boundary < to { boundary } else { to };
        let mut scratch = [blank_event(); EMIT_MAX];
        let produced = process(state, sub_from, sub_to, flags, &mut scratch);
        let copied = produced.min(out.len() - written);
        out[written..written + copied].copy_from_slice(&scratch[..copied]);
        written += copied;
        if sub_to >= to {
            break;
        }
        abi::apply_param_changes::<KadenzState>(state, boundary, apply_parameter);
        sub_from = sub_to;
        boundary = abi::next_update_position(boundary);
    }
    written as u32
}

#[cfg(test)]
mod tests {
    //! The step packing, the cumulative-duration table, chord spelling per step, and the emission pipeline.
    use super::*;
    use abi::EVENT_NOTE_OFF;

    fn pack(degree: i32, quality: i32, duration: i32, inversion: i32, rest: bool) -> i32 {
        (degree & 0x7)
            | ((quality & 0xF) << 3)
            | (((duration - 1) & 0xF) << 7)
            | ((inversion & 0x3) << 11)
            | ((rest as i32) << 13)
    }

    fn state() -> KadenzState {
        let mut state: KadenzState = unsafe { core::mem::zeroed() };
        state.rate = rate_ppqn(3);
        state.gate = 1.0;
        state.notes = 3;
        state.velocity = 0.8;
        state.length = 4;
        let mut index = 0;
        while index < MAX_STEPS {
            state.steps[index] = DEFAULT_STEP;
            index += 1;
        }
        state.table_dirty = true;
        state
    }

    fn progression(state: &mut KadenzState, steps: &[i32]) {
        state.length = steps.len() as i32;
        for (index, packed) in steps.iter().enumerate() {
            state.steps[index] = *packed;
        }
        state.table_dirty = true;
    }

    fn pitches(out: &[EventRecord], kind: u32) -> Vec<u32> {
        out.iter().filter(|event| event.kind == kind).map(|event| event.pitch).collect()
    }

    #[test]
    fn the_packed_layout_round_trips() {
        let step = unpack_step(pack(5, 7, 12, 2, true));
        assert_eq!(step, Step {degree: 5, quality: 7, duration: 12, inversion: 2, rest: true});
        assert_eq!(unpack_step(DEFAULT_STEP), Step {degree: 0, quality: 0, duration: 4, inversion: 0, rest: false},
                   "the born default is one bar of I at a quarter-note grid");
    }

    #[test]
    fn the_table_accumulates_each_step_duration() {
        let mut state = state();
        progression(&mut state, &[pack(0, 0, 4, 0, false), pack(4, 0, 2, 0, false), pack(5, 0, 8, 0, false)]);
        update_table(&mut state);
        assert_eq!(&state.starts[..3], &[0, 4, 6]);
        assert_eq!(state.cycle, 14, "a rest or a long chord still occupies its own time");
    }

    #[test]
    fn a_step_begins_only_at_its_own_offset_and_the_cycle_wraps() {
        let mut state = state();
        progression(&mut state, &[pack(0, 0, 4, 0, false), pack(4, 0, 4, 0, false)]);
        update_table(&mut state);
        assert_eq!(step_beginning_at(&state, 0), Some(0));
        assert_eq!(step_beginning_at(&state, 1), None, "inside the first chord, not a new one");
        assert_eq!(step_beginning_at(&state, 4), Some(1));
        assert_eq!(step_beginning_at(&state, 8), Some(0), "the progression loops");
        assert_eq!(step_beginning_at(&state, 12), Some(1));
    }

    #[test]
    fn a_degree_is_voiced_with_the_quality_its_scale_gives_it() {
        let state = state();
        let mut voices = [0i32; MAX_VOICES];
        let count = build_step_chord(&state, unpack_step(pack(0, 0, 4, 0, false)), &mut voices);
        assert_eq!(voices[..count].to_vec(), vec![60, 64, 67], "I in C major is C E G at middle C");
        let count = build_step_chord(&state, unpack_step(pack(5, 0, 4, 0, false)), &mut voices);
        assert_eq!(voices[..count].to_vec(), vec![69, 72, 76], "vi is minor without being told so");
    }

    #[test]
    fn an_explicit_quality_lets_a_step_leave_the_scale() {
        let state = state();
        let mut voices = [0i32; MAX_VOICES];
        // Degree ii of C major is D minor; spelling it Dom7 makes the V/V that the scale has no chord for.
        let count = build_step_chord(&state, unpack_step(pack(1, 7, 4, 0, false)), &mut voices);
        assert_eq!(voices[..count].to_vec(), vec![62, 66, 69], "D F# A — a raised third the scale cannot give");
    }

    #[test]
    fn a_progression_emits_one_chord_per_step_boundary() {
        let mut state = state();
        progression(&mut state, &[pack(0, 0, 1, 0, false), pack(4, 0, 1, 0, false)]);
        let rate = state.rate;
        let mut out = [blank_event(); 64];
        let written = process(&mut state, 0.0, rate, abi::BlockFlags::TRANSPORTING, &mut out);
        assert_eq!(pitches(&out[..written], EVENT_NOTE_ON), vec![60, 64, 67], "the I chord at the first grid unit");
        let written = process(&mut state, rate, rate * 2.0, abi::BlockFlags::TRANSPORTING, &mut out);
        assert_eq!(pitches(&out[..written], EVENT_NOTE_ON), vec![67, 71, 74], "the V chord one unit later");
    }

    #[test]
    fn a_rest_step_occupies_time_without_sounding() {
        let mut state = state();
        progression(&mut state, &[pack(0, 0, 1, 0, false), pack(4, 0, 1, 0, true)]);
        let rate = state.rate;
        let mut out = [blank_event(); 64];
        let written = process(&mut state, 0.0, rate, abi::BlockFlags::TRANSPORTING, &mut out);
        assert_eq!(pitches(&out[..written], EVENT_NOTE_ON).len(), 3);
        let written = process(&mut state, rate, rate * 2.0, abi::BlockFlags::TRANSPORTING, &mut out);
        assert_eq!(pitches(&out[..written], EVENT_NOTE_ON).len(), 0, "the rest emits nothing");
        let written = process(&mut state, rate * 2.0, rate * 3.0, abi::BlockFlags::TRANSPORTING, &mut out);
        assert_eq!(pitches(&out[..written], EVENT_NOTE_ON), vec![60, 64, 67], "and the cycle resumes after it");
    }

    #[test]
    fn gate_shortens_the_chord_within_its_step() {
        let mut state = state();
        state.gate = 0.5;
        progression(&mut state, &[pack(0, 0, 2, 0, false)]);
        let rate = state.rate;
        let mut out = [blank_event(); 64];
        let written = process(&mut state, 0.0, rate * 2.0, abi::BlockFlags::TRANSPORTING, &mut out);
        let releases: Vec<f64> = out[..written].iter()
            .filter(|event| event.kind == EVENT_NOTE_OFF).map(|event| event.position).collect();
        assert_eq!(releases, vec![rate, rate, rate], "a half gate over a two-unit step releases at one unit");
    }

    #[test]
    fn nothing_is_emitted_while_the_transport_is_stopped() {
        let mut state = state();
        let rate = state.rate;
        let mut out = [blank_event(); 64];
        let written = process(&mut state, 0.0, rate, 0, &mut out);
        assert_eq!(written, 0, "a self-clocked device is silent unless the transport runs");
    }

    #[test]
    fn a_transport_jump_releases_every_sounding_voice() {
        let mut state = state();
        progression(&mut state, &[pack(0, 0, 8, 0, false)]);
        let rate = state.rate;
        let mut out = [blank_event(); 64];
        process(&mut state, 0.0, rate, abi::BlockFlags::TRANSPORTING, &mut out);
        assert_eq!(state.retained_count, 3, "the chord is still sounding");
        let flags = abi::BlockFlags::TRANSPORTING | abi::BlockFlags::DISCONTINUOUS;
        let written = process(&mut state, 500.0, 500.0 + rate, flags, &mut out);
        assert!(out[..written].iter().any(|event| event.kind == EVENT_NOTE_OFF && event.position == 500.0),
                "everything held is released at the jump");
        assert_eq!(state.pending_count, 0);
    }

    #[test]
    fn strum_defers_voices_past_the_block_and_they_arrive_later() {
        let mut state = state();
        state.strum = 300.0;
        progression(&mut state, &[pack(0, 0, 4, 0, false)]);
        let mut out = [blank_event(); 64];
        let written = process(&mut state, 0.0, 100.0, abi::BlockFlags::TRANSPORTING, &mut out);
        assert_eq!(pitches(&out[..written], EVENT_NOTE_ON), vec![60], "only the bottom voice lands in this block");
        assert_eq!(state.pending_count, 2, "the upper voices wait for their pulse");
        let written = process(&mut state, 100.0, 700.0, abi::BlockFlags::TRANSPORTING, &mut out);
        assert_eq!(pitches(&out[..written], EVENT_NOTE_ON), vec![64, 67], "and arrive when the transport reaches them");
        assert_eq!(state.pending_count, 0);
    }

    #[test]
    fn output_is_sorted_by_position_with_note_ons_before_note_offs() {
        let mut state = state();
        progression(&mut state, &[pack(0, 0, 1, 0, false), pack(4, 0, 1, 0, false)]);
        let rate = state.rate;
        let mut out = [blank_event(); 64];
        let written = process(&mut state, 0.0, rate * 4.0, abi::BlockFlags::TRANSPORTING, &mut out);
        let events = &out[..written];
        assert!(events.windows(2).all(|pair| pair[0].position <= pair[1].position), "sorted by position");
        for pair in events.windows(2) {
            if pair[0].position == pair[1].position {
                assert!(lifecycle_rank(&pair[0]) <= lifecycle_rank(&pair[1]),
                        "at an equal position every note-on precedes the note-offs");
            }
        }
    }

    #[test]
    fn map_parameter_reports_the_adapter_ranges_in_bind_order() {
        assert_eq!(map_parameter(0, 1.0), 11.0, "key spans the twelve pitch classes");
        assert_eq!(map_parameter(1, 1.0), (SCALES.len() - 1) as f32);
        assert_eq!(map_parameter(2, 1.0), 16.0, "the rate table");
        assert_eq!(map_parameter(4, 1.0), MAX_VOICES as f32);
        assert_eq!(map_parameter(7, 0.0), -2.0);
        assert_eq!(map_parameter(8, 1.0), MAX_STRUM);
        assert_eq!(map_parameter(10, 0.5), 0.0, "the tilt is bipolar and centred");
        assert!(map_parameter(99, 0.5).is_nan());
    }
}
