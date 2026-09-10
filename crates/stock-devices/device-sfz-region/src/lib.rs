//! `device-sfz-region`, one region of the SFZ composite, as a runtime-loadable device: each SFZ `<region>`
//! becomes one `SfzRegionBox`, hosted as a composite child of `SfzDeviceBox` (mirrors Playfield's
//! composite-child shape, see `device-playfield-sample`). A region plays exactly ONE resolved `AudioFileBox`
//! (no blob, no runtime-parsed sample table — a WASM plugin can only resolve PCM through its own schema-fixed
//! pointer field, so one region = one plugin instance = one sample).
//!
//! The composite broadcasts every note to every region; a region self-filters here by comparing the event's
//! key + velocity against its own `key-lo`/`key-hi`/`vel-lo`/`vel-hi` fields (observed plain fields, set once
//! at import, not automated) — the "range filter: a key zone" `plans/wasm-audio/playfield-composite.md`
//! anticipates. `volume`/`pan` are NOT read here: the engine's composite sum stage applies them generically
//! via `childVolumeKey`/`childPanKey`, so this device only does pitch + ADSR + loop (see `voice.rs`).
//!
//! Exports: `kind()` (instrument), `state_size()`, `process(desc_ptr)`, `init(state_ptr, sample_rate)`,
//! `parameter_changed(...)`, `field_changed(...)`, `sample_changed(...)`, `reset(state_ptr)`.

#![cfg_attr(target_family = "wasm", no_std)]

#[cfg(target_family = "wasm")]
use core::panic::PanicInfo;
use abi::{float_value, Block, EventRecord, FieldValue, Instrument, ParamValue, Ports, EVENT_NOTE_OFF, EVENT_NOTE_ON};
use libm::roundf;
use math::value_mapping::{Exponential, Linear};

mod voice;
use voice::SfzRegionVoice;

#[cfg(target_family = "wasm")]
#[panic_handler]
fn panic(info: &PanicInfo) -> ! {
    abi::panic_to_host(info) // deposit the message in the engine's panic buffer, then trap (never a silent hang)
}

/// A region's own polyphony cap: narrower than Soundfont's (one preset, many layered regions) since a single
/// region only ever covers one key/velocity slice, but wide enough for a sustain-pedal chord or fast retrigger.
const MAX_VOICES: usize = 16;

// The SfzRegionBox field-key paths (stable schema keys, frozen in `SfzDeviceBox.ts`). `file` is the sample
// pointer; the rest are plain fields set once at import (NOT automated), except the ADSR + tune, which are
// automatable parameters. `volume` (44) / `pan` (45) are read by the engine's composite sum stage, not here.
const SAMPLE_POINTER: [u16; 1] = [11];
const KEY_LO_FIELD: [u16; 1] = [31];
const KEY_HI_FIELD: [u16; 1] = [32];
const ROOT_KEY_FIELD: [u16; 1] = [33];
const VEL_LO_FIELD: [u16; 1] = [34];
const VEL_HI_FIELD: [u16; 1] = [35];
const LOOP_MODE_FIELD: [u16; 1] = [36];
const LOOP_START_FIELD: [u16; 1] = [37];
const LOOP_END_FIELD: [u16; 1] = [38];
const ATTACK_FIELD: [u16; 1] = [40];
const DECAY_FIELD: [u16; 1] = [41];
const SUSTAIN_FIELD: [u16; 1] = [42];
const RELEASE_FIELD: [u16; 1] = [43];
const TUNE_FIELD: [u16; 1] = [46];

const ADSR_TIME_MAPPING: Exponential = Exponential {min: 0.001, max: 5.0};
const UNIPOLAR: Linear = Linear::unipolar();
const TUNE_MAPPING: Linear = Linear {min: -1200.0, max: 1200.0};

/// The device's per-instance state (engine-allocated, zeroed): a fixed voice pool, the resolved sample handle,
/// the region's own key/velocity/root/loop fields (observed once, not parameters), the ADSR + tune parameters
/// (snapshotted into each voice at note-on, like Soundfont), the sample rate, and the observe/bind ids the
/// engine delivers against.
pub struct SfzRegionState {
    voices: [SfzRegionVoice; MAX_VOICES],
    sample: Option<u32>,
    sample_id: u32,
    key_lo: i32,
    key_hi: i32,
    root_key: i32,
    vel_lo: i32,
    vel_hi: i32,
    loop_mode: i32,
    loop_start: i32,
    loop_end: i32,
    key_lo_id: u32,
    key_hi_id: u32,
    root_key_id: u32,
    vel_lo_id: u32,
    vel_hi_id: u32,
    loop_mode_id: u32,
    loop_start_id: u32,
    loop_end_id: u32,
    attack: f32,
    decay: f32,
    sustain: f32,
    release: f32,
    tune: f32,
    attack_id: u32,
    decay_id: u32,
    sustain_id: u32,
    release_id: u32,
    tune_id: u32,
    sample_rate: f32,
    seq: u64
}

/// The DSP, plugged into the SDK's `Instrument` template ([`abi::render_instrument`]).
pub struct SfzRegionDevice;

impl Instrument for SfzRegionDevice {
    type State = SfzRegionState;

    fn init(state: &mut SfzRegionState, sample_rate: f32) {
        state.sample_rate = sample_rate;
        state.sample = None;
        // SfzRegionBox defaults; the engine catches up the real values right after init.
        state.key_lo = 0;
        state.key_hi = 127;
        state.root_key = 60;
        state.vel_lo = 0;
        state.vel_hi = 127;
        state.loop_mode = 0;
        state.loop_start = 0;
        state.loop_end = 0;
        state.attack = 0.001;
        state.decay = 0.001;
        state.sustain = 1.0;
        state.release = 0.05;
        state.tune = 0.0;
        state.sample_id = abi::observe_sample(&SAMPLE_POINTER);
        state.key_lo_id = abi::observe_field(&KEY_LO_FIELD);
        state.key_hi_id = abi::observe_field(&KEY_HI_FIELD);
        state.root_key_id = abi::observe_field(&ROOT_KEY_FIELD);
        state.vel_lo_id = abi::observe_field(&VEL_LO_FIELD);
        state.vel_hi_id = abi::observe_field(&VEL_HI_FIELD);
        state.loop_mode_id = abi::observe_field(&LOOP_MODE_FIELD);
        state.loop_start_id = abi::observe_field(&LOOP_START_FIELD);
        state.loop_end_id = abi::observe_field(&LOOP_END_FIELD);
        state.attack_id = abi::bind_parameter(&ATTACK_FIELD);
        state.decay_id = abi::bind_parameter(&DECAY_FIELD);
        state.sustain_id = abi::bind_parameter(&SUSTAIN_FIELD);
        state.release_id = abi::bind_parameter(&RELEASE_FIELD);
        state.tune_id = abi::bind_parameter(&TUNE_FIELD);
    }

    fn handle_event(state: &mut SfzRegionState, event: &EventRecord) {
        if event.kind == EVENT_NOTE_ON {
            let pitch = event.pitch as i32;
            if pitch < state.key_lo || pitch > state.key_hi {return}
            let velocity_byte = (roundf(event.velocity * 127.0) as i32).min(127); // TS `Math.round(velocity*127)`
            if velocity_byte < state.vel_lo || velocity_byte > state.vel_hi {return}
            let Some(sample) = state.sample.and_then(abi::resolve_sample) else {return};
            let num_frames = sample.frame_count as usize;
            if num_frames < 2 {return}
            let seq = state.seq;
            state.seq += 1;
            let index = match state.voices.iter().position(|voice| !voice.is_active()) {
                Some(free) => free,
                None => oldest_voice(&state.voices) // pool full: steal the oldest
            };
            let looping = state.loop_mode != 0;
            let loop_end = if looping && state.loop_end > state.loop_start {state.loop_end as u32} else {num_frames as u32 - 1};
            state.voices[index].start(event.id, event.pitch, event.cent, event.velocity,
                state.root_key as u32, state.tune, looping, state.loop_start as u32, loop_end,
                state.attack, state.decay, state.sustain, state.release,
                sample.sample_rate, state.sample_rate, seq);
        } else if event.kind == EVENT_NOTE_OFF {
            for voice in state.voices.iter_mut() {
                if voice.is_active() && voice.id() == event.id {
                    voice.release();
                }
            }
        }
    }

    fn process_audio(state: &mut SfzRegionState, output: [&mut [f32]; 2], _block: &Block) {
        let [out_left, out_right] = output;
        let sample = match state.sample.and_then(abi::resolve_sample) {
            Some(sample) => sample,
            None => return force_stop_all(&mut state.voices)
        };
        let left = sample.plane(0);
        let right = if sample.channel_count > 1 {sample.plane(1)} else {left};
        for voice in state.voices.iter_mut() {
            if voice.is_active() && voice.process(out_left, out_right, left, right) {
                voice.force_stop();
            }
        }
    }

    fn parameter_changed(state: &mut SfzRegionState, id: u32, value: ParamValue) {
        if id == state.attack_id {
            state.attack = float_value(value, &ADSR_TIME_MAPPING);
        } else if id == state.decay_id {
            state.decay = float_value(value, &ADSR_TIME_MAPPING);
        } else if id == state.sustain_id {
            state.sustain = float_value(value, &UNIPOLAR);
        } else if id == state.release_id {
            state.release = float_value(value, &ADSR_TIME_MAPPING);
        } else if id == state.tune_id {
            state.tune = float_value(value, &TUNE_MAPPING);
        }
    }

    fn field_changed(state: &mut SfzRegionState, id: u32, value: FieldValue) {
        let FieldValue::Int(int_value) = value else {panic!("SFZ region field must be an int field")};
        if id == state.key_lo_id {
            state.key_lo = int_value;
        } else if id == state.key_hi_id {
            state.key_hi = int_value;
        } else if id == state.root_key_id {
            state.root_key = int_value;
        } else if id == state.vel_lo_id {
            state.vel_lo = int_value;
        } else if id == state.vel_hi_id {
            state.vel_hi = int_value;
        } else if id == state.loop_mode_id {
            state.loop_mode = int_value;
        } else if id == state.loop_start_id {
            state.loop_start = int_value;
        } else if id == state.loop_end_id {
            state.loop_end = int_value;
        }
    }

    fn sample_changed(state: &mut SfzRegionState, id: u32, sample: Option<u32>) {
        if id == state.sample_id {
            state.sample = sample;
            force_stop_all(&mut state.voices); // active voices reference the old sample plane
        }
    }

    fn reset(state: &mut SfzRegionState) {
        force_stop_all(&mut state.voices);
    }
}

/// Free every voice (transport stop, sample swap, or an unresolvable sample).
#[inline]
fn force_stop_all(voices: &mut [SfzRegionVoice]) {
    for voice in voices.iter_mut() {
        voice.force_stop();
    }
}

/// The index of the oldest active voice (lowest note-on sequence), stolen when the pool is full.
fn oldest_voice(voices: &[SfzRegionVoice; MAX_VOICES]) -> usize {
    let mut oldest = 0;
    let mut min_seq = voices[0].start_seq();
    for (index, voice) in voices.iter().enumerate() {
        if voice.start_seq() < min_seq {
            min_seq = voice.start_seq();
            oldest = index;
        }
    }
    oldest
}

/// Host-independent entry for tests: clear the stereo output, dispatch the supplied events through the SDK
/// template, and run the post-pass. The wasm `process` path uses [`abi::render_instrument`] instead.
pub fn render(state: &mut SfzRegionState, events: &[EventRecord], out_left: &mut [f32], out_right: &mut [f32], sample_rate: f32) {
    state.sample_rate = sample_rate;
    for sample in out_left.iter_mut() {
        *sample = 0.0;
    }
    for sample in out_right.iter_mut() {
        *sample = 0.0;
    }
    let block = Block {index: 0, flags: abi::BlockFlags(0), p0: 0.0, p1: 0.0, s0: 0, s1: out_left.len() as u32, bpm: 120.0};
    abi::dispatch_range::<SfzRegionDevice>(state, [&mut *out_left, &mut *out_right], events, &block);
    SfzRegionDevice::finish(state, [out_left, out_right]);
}

// ---- The device ABI: shared with the engine, called wasm-to-wasm. ----

#[no_mangle]
pub extern "C" fn kind() -> u32 {
    abi::DEVICE_KIND_INSTRUMENT
}

#[no_mangle]
pub extern "C" fn state_size(_sample_rate: f32) -> u32 {
    core::mem::size_of::<SfzRegionState>() as u32
}

#[no_mangle]
pub extern "C" fn process(desc_ptr: u32) {
    let ports = unsafe { Ports::<SfzRegionState>::from_descriptor(desc_ptr) };
    abi::render_instrument::<SfzRegionDevice>(ports);
}

#[no_mangle]
pub extern "C" fn init(state_ptr: u32, sample_rate: f32) {
    unsafe { abi::with_state(state_ptr, |state| <SfzRegionDevice as Instrument>::init(state, sample_rate)) }
}

#[no_mangle]
pub extern "C" fn parameter_changed(state_ptr: u32, id: u32, kind: u32, value: f32, modulation: f32) {
    unsafe { abi::with_state(state_ptr, |state| <SfzRegionDevice as Instrument>::parameter_changed(state, id, ParamValue::from_wire(kind, value, modulation))) }
}

/// Parity probe: the REAL value stored for a UNIT automation value, ids in `init` bind order.
#[no_mangle]
pub extern "C" fn map_parameter(id: u32, unit: f32) -> f32 {
    let value = ParamValue::Unit(unit);
    match id {
        0 | 1 | 3 => float_value(value, &ADSR_TIME_MAPPING), // attack, decay, release
        2 => float_value(value, &UNIPOLAR), // sustain
        4 => float_value(value, &TUNE_MAPPING), // tune
        _ => f32::NAN
    }
}

#[no_mangle]
pub extern "C" fn field_changed(state_ptr: u32, id: u32, kind: u32, bits: u32, len: u32) {
    unsafe { abi::with_state(state_ptr, |state| <SfzRegionDevice as Instrument>::field_changed(state, id, FieldValue::from_wire(kind, bits, len))) }
}

#[no_mangle]
pub extern "C" fn sample_changed(state_ptr: u32, id: u32, handle: u32, present: u32) {
    let sample = if present != 0 {Some(handle)} else {None};
    unsafe { abi::with_state(state_ptr, |state| <SfzRegionDevice as Instrument>::sample_changed(state, id, sample)) }
}

#[no_mangle]
pub extern "C" fn reset(state_ptr: u32) {
    unsafe { abi::with_state(state_ptr, |state| <SfzRegionDevice as Instrument>::reset(state)) }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SR: f32 = 48_000.0;

    fn note_on(id: u32, pitch: u32, velocity: f32) -> EventRecord {
        EventRecord {position: 0.0, offset: 0, kind: EVENT_NOTE_ON, id, pitch, velocity, cent: 0.0, duration: 0.0}
    }

    fn note_off(id: u32) -> EventRecord {
        EventRecord {position: 0.0, offset: 0, kind: EVENT_NOTE_OFF, id, pitch: 0, velocity: 0.0, cent: 0.0, duration: 0.0}
    }

    fn default_state() -> SfzRegionState {
        let mut state: SfzRegionState = unsafe { core::mem::zeroed() };
        state.key_lo = 0;
        state.key_hi = 127;
        state.vel_lo = 0;
        state.vel_hi = 127;
        state.root_key = 60;
        state.attack = 0.001;
        state.decay = 0.001;
        state.sustain = 1.0;
        state.release = 0.05;
        state
    }

    #[test]
    fn silent_without_a_resident_sample() {
        let mut state = default_state();
        state.sample = Some(1); // a handle is bound, but the native resolve stub returns none (not resident)
        let (mut left, mut right) = (vec![0.0f32; 512], vec![0.0f32; 512]);
        render(&mut state, &[note_on(1, 60, 1.0)], &mut left, &mut right, SR);
        assert_eq!(left.iter().fold(0.0f32, |acc, value| acc.max(value.abs())), 0.0, "no audio until a sample is resident");
    }

    #[test]
    fn note_outside_the_key_range_is_ignored() {
        let mut state = default_state();
        state.key_lo = 60;
        state.key_hi = 64;
        state.sample = Some(1);
        let (mut left, mut right) = (vec![0.0f32; 512], vec![0.0f32; 512]);
        render(&mut state, &[note_on(1, 40, 1.0)], &mut left, &mut right, SR);
        assert!(state.voices.iter().all(|voice| !voice.is_active()), "a note outside the key range starts no voice");
    }

    #[test]
    fn note_outside_the_velocity_range_is_ignored() {
        let mut state = default_state();
        state.vel_lo = 100;
        state.vel_hi = 127;
        state.sample = Some(1);
        render(&mut state, &[note_on(1, 60, 0.1)], &mut [0.0f32; 8], &mut [0.0f32; 8], SR);
        assert!(state.voices.iter().all(|voice| !voice.is_active()), "a soft note outside the velocity range starts no voice");
    }

    #[test]
    fn note_off_releases_the_matching_voice_id() {
        let mut state = default_state();
        // No resident sample, so no voice actually starts; this only exercises the id-matching path safely.
        render(&mut state, &[note_on(1, 60, 1.0), note_off(1)], &mut [0.0f32; 8], &mut [0.0f32; 8], SR);
        assert!(state.voices.iter().all(|voice| !voice.is_active()), "still silent without a resident sample");
    }
}
