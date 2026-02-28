//! KOKO Audio — kira-based audio engine (native), stub on WASM

use std::path::Path;
use std::collections::HashMap;

#[cfg(not(target_arch = "wasm32"))]
mod native {
    use kira::{AudioManager, AudioManagerSettings, DefaultBackend, Tween, Decibels};
    use kira::sound::static_sound::{StaticSoundData, StaticSoundHandle, StaticSoundSettings};
    use std::path::Path;
    use std::collections::HashMap;

    pub struct AudioEngine {
        manager: AudioManager,
        sounds: HashMap<String, StaticSoundData>,
        handles: Vec<(String, StaticSoundHandle)>,
    }

    impl AudioEngine {
        pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
            let manager = AudioManager::<DefaultBackend>::new(AudioManagerSettings::default())?;
            Ok(Self { manager, sounds: HashMap::new(), handles: Vec::new() })
        }
        pub fn load_sound(&mut self, name: &str, path: &Path) -> Result<(), Box<dyn std::error::Error>> {
            let data = StaticSoundData::from_file(path)?;
            self.sounds.insert(name.to_string(), data);
            Ok(())
        }
        pub fn play(&mut self, name: &str) -> Result<(), Box<dyn std::error::Error>> {
            if let Some(data) = self.sounds.get(name) {
                let handle = self.manager.play(data.clone())?;
                self.handles.push((name.to_string(), handle));
                Ok(())
            } else { Err(format!("Sound '{}' not loaded", name).into()) }
        }
        pub fn play_looped(&mut self, name: &str, volume: f64) -> Result<(), Box<dyn std::error::Error>> {
            if let Some(data) = self.sounds.get(name) {
                let settings = StaticSoundSettings::new().volume(Decibels((volume as f32).log10() * 20.0)).loop_region(..);
                let modified = data.with_settings(settings);
                let handle = self.manager.play(modified)?;
                self.handles.push((name.to_string(), handle));
                Ok(())
            } else { Err(format!("Sound '{}' not loaded", name).into()) }
        }
        pub fn stop(&mut self, name: &str) {
            self.handles.retain_mut(|(n, h)| {
                if n == name { let _ = h.stop(Tween::default()); false } else { true }
            });
        }
        pub fn list_sounds(&self) -> Vec<String> { self.sounds.keys().cloned().collect() }
        pub fn stop_all(&mut self) {
            for (_, h) in &mut self.handles { let _ = h.stop(Tween::default()); }
            self.handles.clear();
        }
        pub fn sound_names(&self) -> Vec<&str> { self.sounds.keys().map(|s| s.as_str()).collect() }
        pub fn load_directory(&mut self, dir: &Path) -> usize {
            let mut count = 0;
            if let Ok(entries) = std::fs::read_dir(dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                        if matches!(ext, "wav" | "mp3" | "ogg" | "flac") {
                            let name = path.file_stem().and_then(|s| s.to_str()).unwrap_or("unknown");
                            if self.load_sound(name, &path).is_ok() { count += 1; }
                        }
                    }
                }
            }
            count
        }
    }
}

#[cfg(not(target_arch = "wasm32"))]
pub use native::AudioEngine;

#[cfg(target_arch = "wasm32")]
pub struct AudioEngine;

#[cfg(target_arch = "wasm32")]
impl AudioEngine {
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> { Ok(Self) }
    pub fn load_sound(&mut self, _name: &str, _path: &Path) -> Result<(), Box<dyn std::error::Error>> { Ok(()) }
    pub fn play(&mut self, _name: &str) -> Result<(), Box<dyn std::error::Error>> { Ok(()) }
    pub fn play_looped(&mut self, _name: &str, _volume: f64) -> Result<(), Box<dyn std::error::Error>> { Ok(()) }
    pub fn stop(&mut self, _name: &str) {}
    pub fn list_sounds(&self) -> Vec<String> { Vec::new() }
    pub fn stop_all(&mut self) {}
    pub fn sound_names(&self) -> Vec<&str> { Vec::new() }
    pub fn load_directory(&mut self, _dir: &Path) -> usize { 0 }
}
