//! Time management — delta time, fixed timestep, timers

use std::time::{Duration, Instant};

/// Global time state updated each frame
#[derive(Debug, Clone)]
pub struct Time {
    /// Time since last frame
    pub delta: Duration,
    /// Delta as f32 seconds (most common usage)
    pub dt: f32,
    /// Total elapsed time since engine start
    pub elapsed: Duration,
    /// Total elapsed as f32 seconds
    pub elapsed_secs: f32,
    /// Current frame number
    pub frame: u64,
    /// Frames per second (smoothed)
    pub fps: f32,
    /// Time scale (1.0 = normal, 0.5 = half speed, 0.0 = paused)
    pub scale: f32,
    /// Fixed timestep for physics (default 1/60)
    pub fixed_dt: f32,
    /// Accumulator for fixed timestep
    pub(crate) fixed_accumulator: f32,

    start: Instant,
    last_frame: Instant,
    fps_samples: Vec<f32>,
}

impl Time {
    pub fn new() -> Self {
        let now = Instant::now();
        Self {
            delta: Duration::ZERO,
            dt: 0.0,
            elapsed: Duration::ZERO,
            elapsed_secs: 0.0,
            frame: 0,
            fps: 0.0,
            scale: 1.0,
            fixed_dt: 1.0 / 60.0,
            fixed_accumulator: 0.0,
            start: now,
            last_frame: now,
            fps_samples: Vec::with_capacity(120),
        }
    }

    /// Call once per frame to update time state
    pub fn update(&mut self) {
        let now = Instant::now();
        self.delta = now - self.last_frame;
        self.dt = self.delta.as_secs_f32() * self.scale;
        self.elapsed = now - self.start;
        self.elapsed_secs = self.elapsed.as_secs_f32();
        self.frame += 1;
        self.last_frame = now;

        // FPS calculation (rolling average)
        let raw_fps = 1.0 / self.delta.as_secs_f32().max(0.0001);
        self.fps_samples.push(raw_fps);
        if self.fps_samples.len() > 60 {
            self.fps_samples.remove(0);
        }
        self.fps = self.fps_samples.iter().sum::<f32>() / self.fps_samples.len() as f32;

        // Fixed timestep accumulator
        self.fixed_accumulator += self.dt;
    }

    /// Returns true each time a fixed step should be consumed
    pub fn consume_fixed_step(&mut self) -> bool {
        if self.fixed_accumulator >= self.fixed_dt {
            self.fixed_accumulator -= self.fixed_dt;
            true
        } else {
            false
        }
    }

    /// Interpolation factor for rendering between physics steps
    pub fn fixed_alpha(&self) -> f32 {
        self.fixed_accumulator / self.fixed_dt
    }

    /// Scaled delta — use for gameplay (respects time scale / pause)
    pub fn scaled_dt(&self) -> f32 {
        self.dt
    }

    /// Unscaled delta — use for UI, editor (ignores time scale)
    pub fn unscaled_dt(&self) -> f32 {
        self.delta.as_secs_f32()
    }
}

impl Default for Time {
    fn default() -> Self {
        Self::new()
    }
}

/// Simple timer utility
#[derive(Debug, Clone)]
pub struct Timer {
    pub duration: f32,
    pub elapsed: f32,
    pub repeating: bool,
    pub finished: bool,
}

impl Timer {
    pub fn new(duration: f32, repeating: bool) -> Self {
        Self { duration, elapsed: 0.0, repeating, finished: false }
    }

    pub fn once(duration: f32) -> Self { Self::new(duration, false) }
    pub fn repeating(duration: f32) -> Self { Self::new(duration, true) }

    pub fn tick(&mut self, dt: f32) -> bool {
        self.elapsed += dt;
        if self.elapsed >= self.duration {
            self.finished = true;
            if self.repeating {
                self.elapsed -= self.duration;
            }
            true
        } else {
            false
        }
    }

    pub fn progress(&self) -> f32 {
        (self.elapsed / self.duration).min(1.0)
    }

    pub fn reset(&mut self) {
        self.elapsed = 0.0;
        self.finished = false;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn time_initial_state() {
        let t = Time::new();
        assert_eq!(t.frame, 0);
        assert_eq!(t.dt, 0.0);
        assert_eq!(t.scale, 1.0);
        assert!((t.fixed_dt - 1.0 / 60.0).abs() < 0.001);
    }

    #[test]
    fn time_update_increments_frame() {
        let mut t = Time::new();
        t.update();
        assert_eq!(t.frame, 1);
        t.update();
        assert_eq!(t.frame, 2);
    }

    #[test]
    fn timer_once_fires() {
        let mut timer = Timer::once(1.0);
        assert!(!timer.tick(0.5));
        assert!(!timer.finished);
        assert!(timer.tick(0.6));
        assert!(timer.finished);
    }

    #[test]
    fn timer_repeating_resets() {
        let mut timer = Timer::repeating(1.0);
        assert!(timer.tick(1.1));
        assert!(timer.finished);
        // elapsed should wrap around
        assert!(timer.elapsed < 1.0);
    }

    #[test]
    fn timer_progress() {
        let mut timer = Timer::once(2.0);
        timer.tick(1.0);
        assert!((timer.progress() - 0.5).abs() < 0.01);
    }

    #[test]
    fn timer_reset() {
        let mut timer = Timer::once(1.0);
        timer.tick(1.5);
        assert!(timer.finished);
        timer.reset();
        assert!(!timer.finished);
        assert_eq!(timer.elapsed, 0.0);
    }

    #[test]
    fn fixed_step_accumulator() {
        let mut t = Time::new();
        t.fixed_accumulator = 0.02; // > 1/60
        assert!(t.consume_fixed_step());
        assert!(!t.consume_fixed_step()); // accumulator drained
    }
}
