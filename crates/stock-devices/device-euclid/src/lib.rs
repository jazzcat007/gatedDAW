//! Euclidean Sequencer MIDI-effect device.
//!
//! Standalone trigger generator: emits notes on a Euclidean rhythm grid without requiring
//! an incoming held note. Pattern is cached Bjorklund E(pulses, steps) with rotation.
//!
//! Parameters:
//! steps 1..64, pulses 0..steps, rotation -64..64, rateIndex, gate, pitch, velocity.
//!
//! Built on device-sequencer-common for rate-grid stepping, gate duration, note-off scheduling,
//! transport discontinuity handling.

#![cfg_attr(target_family = "wasm", no_std)]

use abi::{EventRecord, ParamValue, EVENT_NOTE_ON};
#[cfg(target_family = "wasm")]
use core::panic::PanicInfo;
use device_sequencer_common::{
    emit, first_index, lifecycle_rank, note_off, rate_ppqn, release_completed, Retained, EMIT_MAX,
    MAX_RETAINED,
};
use math::value_mapping::{Linear, LinearInteger};

#[cfg(target_family = "wasm")]
#[panic_handler]
fn panic(info: &PanicInfo) -> ! {
    abi::panic_to_host(info)
}

const STEPS_FIELD: [u16; 1] = [10];
const PULSES_FIELD: [u16; 1] = [11];
const ROTATION_FIELD: [u16; 1] = [12];
const RATE_FIELD: [u16; 1] = [13];
const GATE_FIELD: [u16; 1] = [14];
const PITCH_FIELD: [u16; 1] = [15];
const VELOCITY_FIELD: [u16; 1] = [16];

const STEPS_MAPPING: LinearInteger = LinearInteger { min: 1, max: 64 };
const PULSES_MAPPING: LinearInteger = LinearInteger { min: 0, max: 64 };
const ROTATION_MAPPING: LinearInteger = LinearInteger { min: -64, max: 64 };
const RATE_MAPPING: LinearInteger = LinearInteger { min: 0, max: 16 };
const GATE_MAPPING: Linear = Linear { min: 0.0, max: 2.0 };
const PITCH_MAPPING: LinearInteger = LinearInteger { min: 0, max: 127 };
const VELOCITY_MAPPING: Linear = Linear { min: 0.0, max: 1.0 };

#[derive(Clone, Copy)]
struct EuclidState {
    retained: [Retained; MAX_RETAINED],
    retained_count: u32,
    next_id: u32,
    steps: i32,
    pulses: i32,
    rotation: i32,
    rate: f64,
    gate: f32,
    pitch: u32,
    velocity: f32,
    steps_id: u32,
    pulses_id: u32,
    rotation_id: u32,
    rate_id: u32,
    gate_id: u32,
    pitch_id: u32,
    velocity_id: u32,
    pattern: [bool; 64],
    pattern_dirty: bool,
}

fn bjorklund(steps: usize, pulses: usize) -> [bool; 64] {
    let mut pattern = [false; 64];
    if steps == 0 || pulses == 0 {
        return pattern;
    }
    let steps = steps.min(64);
    let pulses = pulses.min(steps);
    if pulses >= steps {
        for i in 0..steps {
            pattern[i] = true;
        }
        return pattern;
    }
    // Integer/Bresenham form of Bjorklund distribution. It produces the same evenly
    // spaced Euclidean necklaces without allocation, which matters for the no_std WASM DSP.
    for index in 0..steps {
        pattern[index] = ((index + 1) * pulses) / steps != (index * pulses) / steps;
    }
    pattern
}

fn update_pattern(state: &mut EuclidState) {
    let steps = state.steps.max(1).min(64) as usize;
    let pulses = state.pulses.clamp(0, steps as i32) as usize;
    let base = bjorklund(steps, pulses);
    let rot = (state.rotation as usize) % steps;
    for i in 0..steps {
        let src = (i + rot) % steps;
        state.pattern[i] = base[src];
    }
    for i in steps..64 {
        state.pattern[i] = false;
    }
    state.pattern_dirty = false;
}

fn process(
    state: &mut EuclidState,
    from: f64,
    to: f64,
    flags: u32,
    out: &mut [EventRecord],
) -> usize {
    let blank = EventRecord {
        position: 0.0,
        offset: 0,
        kind: 0,
        id: 0,
        pitch: 0,
        velocity: 0.0,
        cent: 0.0,
        duration: 0.0,
    };
    let mut events = [blank; EMIT_MAX];
    let mut count = 0;
    let discontinuous = flags & abi::BlockFlags::DISCONTINUOUS != 0;
    let transporting = flags & abi::BlockFlags::TRANSPORTING != 0;

    if discontinuous {
        for i in 0..state.retained_count as usize {
            let r = state.retained[i];
            emit(&mut events, &mut count, note_off(r.id, r.pitch, from));
        }
        state.retained_count = 0;
    } else {
        release_completed(
            &mut state.retained,
            &mut state.retained_count,
            to,
            &mut events,
            &mut count,
        );
    }

    if transporting && state.rate > 0.0 {
        if state.pattern_dirty {
            update_pattern(state);
        }
        let step_len = state.rate * state.gate.max(0.0) as f64;
        let duration = if step_len < 1.0 {
            1.0
        } else {
            (step_len as i64) as f64
        };
        let steps = state.steps.max(1).min(64) as i64;
        let mut index = first_index(from, state.rate);
        let mut position = index as f64 * state.rate;
        while position < to {
            let step = (index % steps) as usize;
            if state.pattern[step] {
                if (state.retained_count as usize) < MAX_RETAINED {
                    let id = state.next_id;
                    state.next_id = state.next_id.wrapping_add(1);
                    emit(
                        &mut events,
                        &mut count,
                        EventRecord {
                            position,
                            offset: 0,
                            kind: EVENT_NOTE_ON,
                            id,
                            pitch: state.pitch,
                            velocity: state.velocity,
                            cent: 0.0,
                            duration,
                        },
                    );
                    state.retained[state.retained_count as usize] = Retained {
                        id,
                        pitch: state.pitch,
                        complete: position + duration,
                    };
                    state.retained_count += 1;
                }
            }
            index += 1;
            position = index as f64 * state.rate;
        }
    }

    release_completed(
        &mut state.retained,
        &mut state.retained_count,
        to,
        &mut events,
        &mut count,
    );
    events[..count].sort_unstable_by(|l, r| {
        l.position
            .partial_cmp(&r.position)
            .unwrap_or(core::cmp::Ordering::Equal)
            .then(lifecycle_rank(l).cmp(&lifecycle_rank(r)))
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
    core::mem::size_of::<EuclidState>() as u32
}

fn seed(state: &mut EuclidState) {
    state.next_id = 1;
    state.steps = 8;
    state.pulses = 3;
    state.rotation = 0;
    state.rate = rate_ppqn(9);
    state.gate = 1.0;
    state.pitch = 60;
    state.velocity = 0.8;
    state.pattern_dirty = true;
    state.steps_id = abi::bind_parameter(&STEPS_FIELD);
    state.pulses_id = abi::bind_parameter(&PULSES_FIELD);
    state.rotation_id = abi::bind_parameter(&ROTATION_FIELD);
    state.rate_id = abi::bind_parameter(&RATE_FIELD);
    state.gate_id = abi::bind_parameter(&GATE_FIELD);
    state.pitch_id = abi::bind_parameter(&PITCH_FIELD);
    state.velocity_id = abi::bind_parameter(&VELOCITY_FIELD);
}

#[no_mangle]
pub extern "C" fn init(state_ptr: u32, _sample_rate: f32) {
    seed(unsafe { &mut *(state_ptr as *mut EuclidState) });
}

fn apply_parameter(state: &mut EuclidState, id: u32, value: ParamValue) {
    if id == state.steps_id {
        state.steps = abi::int_value(value, &STEPS_MAPPING);
        state.pattern_dirty = true;
    } else if id == state.pulses_id {
        state.pulses = abi::int_value(value, &PULSES_MAPPING);
        state.pattern_dirty = true;
    } else if id == state.rotation_id {
        state.rotation = abi::int_value(value, &ROTATION_MAPPING);
        state.pattern_dirty = true;
    } else if id == state.rate_id {
        state.rate = rate_ppqn(abi::int_value(value, &RATE_MAPPING));
    } else if id == state.gate_id {
        state.gate = abi::float_value(value, &GATE_MAPPING);
    } else if id == state.pitch_id {
        state.pitch = abi::int_value(value, &PITCH_MAPPING) as u32;
    } else if id == state.velocity_id {
        state.velocity = abi::float_value(value, &VELOCITY_MAPPING);
    }
}

#[no_mangle]
pub extern "C" fn parameter_changed(
    state_ptr: u32,
    id: u32,
    kind: u32,
    value: f32,
    modulation: f32,
) {
    let state = unsafe { &mut *(state_ptr as *mut EuclidState) };
    apply_parameter(state, id, ParamValue::from_wire(kind, value, modulation));
}

#[no_mangle]
pub extern "C" fn map_parameter(id: u32, unit: f32) -> f32 {
    let value = ParamValue::Unit(unit);
    match id {
        0 => abi::int_value(value, &STEPS_MAPPING) as f32,
        1 => abi::int_value(value, &PULSES_MAPPING) as f32,
        2 => abi::int_value(value, &ROTATION_MAPPING) as f32,
        3 => abi::int_value(value, &RATE_MAPPING) as f32,
        4 => abi::float_value(value, &GATE_MAPPING),
        5 => abi::int_value(value, &PITCH_MAPPING) as f32,
        6 => abi::float_value(value, &VELOCITY_MAPPING),
        _ => f32::NAN,
    }
}

#[no_mangle]
pub extern "C" fn process_events(
    from: f64,
    to: f64,
    flags: u32,
    state_ptr: u32,
    out_ptr: u32,
    max: u32,
) -> u32 {
    let state = unsafe { &mut *(state_ptr as *mut EuclidState) };
    let out = unsafe { core::slice::from_raw_parts_mut(out_ptr as *mut EventRecord, max as usize) };
    let mut written = 0usize;
    let mut sub_from = from;
    let mut boundary = abi::first_update_position(from);
    let blank = EventRecord {
        position: 0.0,
        offset: 0,
        kind: 0,
        id: 0,
        pitch: 0,
        velocity: 0.0,
        cent: 0.0,
        duration: 0.0,
    };
    loop {
        let sub_to = if boundary < to { boundary } else { to };
        let mut tmp = [blank; EMIT_MAX];
        let n = process(state, sub_from, sub_to, flags, &mut tmp);
        let to_copy = n.min(out.len() - written);
        out[written..written + to_copy].copy_from_slice(&tmp[..to_copy]);
        written += to_copy;
        if sub_to >= to {
            break;
        }
        abi::apply_param_changes::<EuclidState>(state, boundary, apply_parameter);
        sub_from = sub_to;
        boundary = abi::next_update_position(boundary);
    }
    written as u32
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rate_maps() {
        assert_eq!(rate_ppqn(9), 240.0);
    }

    #[test]
    fn distributes_pulses_evenly() {
        assert_eq!(
            &bjorklund(8, 3)[..8],
            &[false, false, true, false, false, true, false, true]
        );
        assert_eq!(&bjorklund(8, 0)[..8], &[false; 8]);
        assert_eq!(&bjorklund(8, 8)[..8], &[true; 8]);
    }
}
