//! Shared rate-grid scheduling for sequencer devices.
#![cfg_attr(target_family = "wasm", no_std)]

use abi::{EventRecord, EVENT_NOTE_OFF};

const BAR: i64 = 3840;

pub const RATE_FRACTIONS: [(i64, i64); 17] = [
    (1, 1),
    (1, 2),
    (1, 3),
    (1, 4),
    (3, 16),
    (1, 6),
    (1, 8),
    (3, 32),
    (1, 12),
    (1, 16),
    (3, 64),
    (1, 24),
    (1, 32),
    (1, 48),
    (1, 64),
    (1, 96),
    (1, 128),
];

pub fn rate_ppqn(index: i32) -> f64 {
    let clamped = if index < 0 {
        0
    } else if index as usize >= RATE_FRACTIONS.len() {
        RATE_FRACTIONS.len() - 1
    } else {
        index as usize
    };
    let (numerator, denominator) = RATE_FRACTIONS[clamped];
    ((BAR / denominator) * numerator) as f64
}

pub const MAX_RETAINED: usize = 64;
pub const EMIT_MAX: usize = 128;

#[derive(Clone, Copy)]
pub struct Retained {
    pub id: u32,
    pub pitch: u32,
    pub complete: f64,
}

pub fn first_index(from: f64, rate: f64) -> i64 {
    let index = (from / rate) as i64;
    if (index as f64) * rate < from {
        index + 1
    } else {
        index
    }
}

pub fn emit(events: &mut [EventRecord], count: &mut usize, record: EventRecord) {
    if *count < events.len() {
        events[*count] = record;
        *count += 1;
    }
}

pub fn note_off(id: u32, pitch: u32, position: f64) -> EventRecord {
    EventRecord {
        position,
        offset: 0,
        kind: EVENT_NOTE_OFF,
        id,
        pitch,
        velocity: 0.0,
        cent: 0.0,
        duration: 0.0,
    }
}

pub fn release_completed(
    retained: &mut [Retained],
    retained_count: &mut u32,
    to: f64,
    events: &mut [EventRecord],
    count: &mut usize,
) {
    let mut index = 0;
    while index < *retained_count as usize {
        let r = retained[index];
        if r.complete < to {
            emit(events, count, note_off(r.id, r.pitch, r.complete));
            retained[index] = retained[*retained_count as usize - 1];
            *retained_count -= 1;
        } else {
            index += 1;
        }
    }
}

pub fn lifecycle_rank(record: &EventRecord) -> u8 {
    if record.kind == EVENT_NOTE_OFF {
        1
    } else {
        0
    }
}
