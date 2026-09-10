//! One SFZ region's per-note voice + its envelope, adapted from `device-soundfont`'s `SoundfontVoice` (its
//! `Adsr` / `Smooth`, ported from `packages/lib/dsp/src/adsr.ts` / `smooth.ts`). Pure, heap-free, zeroable DSP
//! so voices live in the device's fixed zeroed pool.
//!
//! Unlike Soundfont (one blob, many samples, per-sample loop points), a region has exactly ONE resolved
//! `AudioFileBox`, and its loop points are the REGION's own fields (SFZ loop points are per-region, not
//! per-sample). No pan / static gain here: the composite sum stage applies the region's `volume`/`pan`
//! generically (see `lib.rs`), so this voice only does pitch + ADSR + loop.

use libm::exp2f;

const SILENCE_THRESHOLD: f32 = 1.0e-4;
const SMOOTH_SECONDS: f32 = 0.003;

#[derive(Clone, Copy, PartialEq, Eq, Default)]
enum Stage {
    #[default]
    Idle,
    Attack,
    Decay,
    Sustain,
    Release
}

/// A LINEAR attack/decay/sustain/release envelope, ported from `packages/lib/dsp/src/adsr.ts` (same as
/// `device-soundfont::voice::Adsr`). Rates are re-solved from the current value on `set` / `gate_off` so a
/// ramp resumes correctly.
#[derive(Clone, Copy, Default)]
pub struct Adsr {
    stage: Stage,
    value: f32,
    inv_sample_rate: f32,
    attack: f32,
    decay: f32,
    sustain: f32,
    release: f32,
    attack_inc: f32,
    decay_dec: f32,
    release_dec: f32
}

impl Adsr {
    #[inline]
    pub fn new(sample_rate: f32) -> Self {
        Self {inv_sample_rate: 1.0 / sample_rate, ..Default::default()}
    }

    #[inline]
    pub fn set(&mut self, attack: f32, decay: f32, sustain: f32, release: f32) {
        self.attack = attack;
        self.decay = decay;
        self.sustain = sustain;
        self.release = release;
        self.update_rates();
    }

    #[inline]
    fn update_rates(&mut self) {
        let inv = self.inv_sample_rate;
        match self.stage {
            Stage::Attack => self.attack_inc = (1.0 - self.value) * inv / self.attack.max(1.0e-6),
            Stage::Decay => self.decay_dec = (self.value - self.sustain) * inv / self.decay.max(1.0e-6),
            Stage::Release => self.release_dec = self.value * inv / self.release.max(1.0e-6),
            _ => {
                self.attack_inc = inv / self.attack.max(1.0e-6);
                self.decay_dec = (1.0 - self.sustain) * inv / self.decay.max(1.0e-6);
                self.release_dec = self.sustain * inv / self.release.max(1.0e-6);
            }
        }
    }

    #[inline]
    pub fn gate_on(&mut self) {
        self.stage = Stage::Attack;
    }

    #[inline]
    pub fn gate_off(&mut self) {
        if self.stage != Stage::Idle {
            self.stage = Stage::Release;
            self.update_rates();
        }
    }

    #[inline]
    pub fn complete(&self) -> bool {
        self.stage == Stage::Idle
    }

    #[inline]
    pub fn next(&mut self) -> f32 {
        match self.stage {
            Stage::Attack => {
                self.value += self.attack_inc;
                if self.value >= 1.0 {
                    self.value = 1.0;
                    self.stage = Stage::Decay;
                }
                self.value
            }
            Stage::Decay => {
                self.value -= self.decay_dec;
                if self.value <= self.sustain {
                    self.value = self.sustain;
                    self.stage = Stage::Sustain;
                }
                self.value
            }
            Stage::Sustain => self.sustain,
            Stage::Release => {
                self.value -= self.release_dec;
                if self.value <= 0.0 {
                    self.value = 0.0;
                    self.stage = Stage::Idle;
                }
                self.value
            }
            Stage::Idle => 0.0
        }
    }
}

/// A one-pole smoother, ported from `packages/lib/dsp/src/smooth.ts`.
#[derive(Clone, Copy, Default)]
pub struct Smooth {
    coeff: f32,
    value: f32
}

impl Smooth {
    #[inline]
    pub fn new(time: f32, sample_rate: f32) -> Self {
        Self {coeff: 1.0 - libm::expf(-1.0 / (time * sample_rate)), value: 0.0}
    }

    #[inline]
    pub fn process(&mut self, target: f32) -> f32 {
        self.value += self.coeff * (target - self.value);
        self.value
    }

    #[inline]
    pub fn value(&self) -> f32 {
        self.value
    }
}

#[derive(Clone, Copy, Default)]
pub struct SfzRegionVoice {
    active: bool,
    id: u32,
    loop_start: u32,
    loop_end: u32,
    looping: bool,
    position: f64,
    playback_rate: f64,
    gain: f32,
    adsr: Adsr,
    smooth: Smooth,
    start_seq: u64
}

impl SfzRegionVoice {
    #[inline]
    pub fn is_active(&self) -> bool {
        self.active
    }

    #[inline]
    pub fn id(&self) -> u32 {
        self.id
    }

    #[inline]
    pub fn start_seq(&self) -> u64 {
        self.start_seq
    }

    /// Begin a note. `sample_source_rate` is the resolved `AudioFileBox`'s native sample rate (read once, like
    /// Soundfont snapshots its region/sample at note-on); `sample_rate` is the engine's render rate.
    #[allow(clippy::too_many_arguments)]
    pub fn start(&mut self, id: u32, pitch: u32, cent: f32, velocity: f32, root_key: u32, tune_cents: f32,
                 looping: bool, loop_start: u32, loop_end: u32,
                 attack: f32, decay: f32, sustain: f32, release: f32,
                 sample_source_rate: f32, sample_rate: f32, start_seq: u64) {
        self.active = true;
        self.id = id;
        self.loop_start = loop_start;
        self.loop_end = loop_end;
        self.looping = looping;
        self.position = 0.0;
        self.start_seq = start_seq;
        let semis = pitch as f32 + cent / 100.0 + tune_cents / 100.0 - root_key as f32;
        let pitch_ratio = exp2f(semis / 12.0) as f64;
        self.playback_rate = pitch_ratio * sample_source_rate as f64 / sample_rate as f64;
        self.gain = if velocity > 0.0 {velocity} else {0.0};
        self.adsr = Adsr::new(sample_rate);
        self.adsr.set(attack, decay, sustain, release);
        self.adsr.gate_on();
        self.smooth = Smooth::new(SMOOTH_SECONDS, sample_rate);
    }

    #[inline]
    pub fn release(&mut self) {
        self.adsr.gate_off();
    }

    #[inline]
    pub fn force_stop(&mut self) {
        self.active = false;
    }

    /// Render additively into the stereo chunk from the resolved sample's plane(s) (mono feeds both channels).
    /// Returns `true` once finished, so the device frees the slot. Mirrors `SoundfontVoice::process`.
    pub fn process(&mut self, out_left: &mut [f32], out_right: &mut [f32], left: &[f32], right: &[f32]) -> bool {
        let frame_count = left.len();
        if frame_count == 0 {
            return true;
        }
        let last = frame_count - 1;
        let loop_start = self.loop_start as f64;
        let loop_end = self.loop_end as f64;
        for index in 0..out_left.len() {
            let int_position = self.position as usize;
            let (sample_left, sample_right) = if int_position >= last {
                (left[last], right[last])
            } else {
                let frac = (self.position - int_position as f64) as f32;
                (left[int_position] * (1.0 - frac) + left[int_position + 1] * frac,
                 right[int_position] * (1.0 - frac) + right[int_position + 1] * frac)
            };
            let env = self.adsr.next();
            let amp = self.gain * self.smooth.process(env);
            out_left[index] += sample_left * amp;
            out_right[index] += sample_right * amp;
            self.position += self.playback_rate;
            if self.looping && loop_end > loop_start {
                if self.position >= loop_end {
                    self.position = loop_start + (self.position - loop_end);
                }
            } else if self.position >= last as f64 {
                return true;
            }
        }
        self.adsr.complete() && self.smooth.value() < SILENCE_THRESHOLD
    }
}

#[cfg(test)]
mod tests {
    use super::SfzRegionVoice;

    const SR: f32 = 48_000.0;

    fn peak(buffer: &[f32]) -> f32 {
        buffer.iter().fold(0.0f32, |acc, value| acc.max(value.abs()))
    }

    #[test]
    fn attack_ramps_in_from_silence() {
        let mut voice = SfzRegionVoice::default();
        voice.start(1, 60, 0.0, 1.0, 60, 0.0, false, 0, 0, 0.02, 0.005, 1.0, 0.05, SR, SR, 0);
        let frames = vec![0.5f32; 48_000];
        let (mut left, mut right) = (vec![0.0f32; 64], vec![0.0f32; 64]);
        assert!(!voice.process(&mut left, &mut right, &frames, &frames), "still sounding");
        assert!(left[0].abs() < 0.02, "starts near silent: {}", left[0]);
        assert!(left[63] > left[0], "ramps up across the attack");
        assert_eq!(left, right, "a mono sample feeds both channels equally");
    }

    #[test]
    fn sustain_holds_at_the_sustain_level() {
        let mut voice = SfzRegionVoice::default();
        voice.start(1, 60, 0.0, 1.0, 60, 0.0, false, 0, 0, 0.001, 0.001, 0.5, 0.05, SR, SR, 0);
        let frames = vec![1.0f32; 48_000];
        let (mut left, mut right) = (vec![0.0f32; 4_096], vec![0.0f32; 4_096]);
        assert!(!voice.process(&mut left, &mut right, &frames, &frames), "still sounding");
        assert!((peak(&left[2_048..]) - 0.5).abs() < 0.01, "settles to the sustain level: {}", peak(&left[2_048..]));
    }

    #[test]
    fn release_decays_to_silence_then_finishes() {
        let mut voice = SfzRegionVoice::default();
        voice.start(1, 60, 0.0, 1.0, 60, 0.0, false, 0, 0, 0.001, 0.001, 1.0, 0.02, SR, SR, 0);
        let frames = vec![1.0f32; 48_000];
        let (mut left, mut right) = (vec![0.0f32; 512], vec![0.0f32; 512]);
        voice.process(&mut left, &mut right, &frames, &frames);
        voice.release();
        let (mut tail_left, mut tail_right) = (vec![0.0f32; 4_096], vec![0.0f32; 4_096]);
        let finished = voice.process(&mut tail_left, &mut tail_right, &frames, &frames);
        assert!(finished, "the release elapses within the chunk");
        assert!(peak(&tail_left[2_048..]) < 1.0e-3, "silent once released");
    }

    #[test]
    fn looping_region_wraps_and_keeps_sounding() {
        let mut voice = SfzRegionVoice::default();
        voice.start(1, 60, 0.0, 1.0, 60, 0.0, true, 0, 3_999, 0.001, 0.001, 1.0, 0.02, SR, SR, 0);
        let frames = vec![1.0f32; 4_000];
        let (mut left, mut right) = (vec![0.0f32; 16_000], vec![0.0f32; 16_000]);
        assert!(!voice.process(&mut left, &mut right, &frames, &frames), "looping never runs out within the chunk");
    }

    #[test]
    fn non_looping_region_finishes_at_the_last_frame() {
        let mut voice = SfzRegionVoice::default();
        voice.start(1, 60, 0.0, 1.0, 60, 0.0, false, 0, 0, 0.0001, 0.0001, 1.0, 0.0001, SR, SR, 0);
        let frames = vec![1.0f32; 64];
        let (mut left, mut right) = (vec![0.0f32; 256], vec![0.0f32; 256]);
        assert!(voice.process(&mut left, &mut right, &frames, &frames), "ends past the last frame");
    }

    #[test]
    fn pitch_an_octave_up_doubles_the_read_rate() {
        let frames: Vec<f32> = (0..4_000).map(|index| index as f32).collect();
        let mut native = SfzRegionVoice::default();
        native.start(1, 60, 0.0, 1.0, 60, 0.0, false, 0, 0, 0.0001, 0.0001, 1.0, 0.05, SR, SR, 0);
        let mut octave = SfzRegionVoice::default();
        octave.start(1, 72, 0.0, 1.0, 60, 0.0, false, 0, 0, 0.0001, 0.0001, 1.0, 0.05, SR, SR, 0);
        let (mut l0, mut r0) = (vec![0.0f32; 1_000], vec![0.0f32; 1_000]);
        let (mut l1, mut r1) = (vec![0.0f32; 1_000], vec![0.0f32; 1_000]);
        native.process(&mut l0, &mut r0, &frames, &frames);
        octave.process(&mut l1, &mut r1, &frames, &frames);
        assert!(l1[900] > l0[900] * 1.8, "an octave up (12 semitones) roughly doubles the read rate");
    }
}
