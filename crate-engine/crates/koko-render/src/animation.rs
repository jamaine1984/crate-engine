//! Skeletal animation — bone data from glTF, animation blending

use glam::{Vec3, Quat, Mat4};
use std::path::Path;

/// A single bone/joint in the skeleton
#[derive(Debug, Clone)]
pub struct Bone {
    pub name: String,
    pub parent: Option<usize>,
    pub inverse_bind: Mat4,
    pub local_transform: Mat4,
}

/// A skeleton (rig) with bones
#[derive(Debug, Clone)]
pub struct Skeleton {
    pub bones: Vec<Bone>,
    pub bone_matrices: Vec<Mat4>,  // final transform per bone
}

/// An animation clip
#[derive(Debug, Clone)]
pub struct AnimationClip {
    pub name: String,
    pub duration: f32,
    pub channels: Vec<AnimChannel>,
}

#[derive(Debug, Clone)]
pub struct AnimChannel {
    pub bone_index: usize,
    pub translations: Vec<(f32, Vec3)>,    // (time, value)
    pub rotations: Vec<(f32, Quat)>,
    pub scales: Vec<(f32, Vec3)>,
}

/// Animator — manages playback of animations on a skeleton
#[derive(Debug, Clone)]
pub struct Animator {
    pub skeleton: Skeleton,
    pub clips: Vec<AnimationClip>,
    pub current_clip: Option<usize>,
    pub time: f32,
    pub speed: f32,
    pub looping: bool,
}

impl Animator {
    pub fn new(skeleton: Skeleton, clips: Vec<AnimationClip>) -> Self {
        let has_clips = !clips.is_empty();
        Self {
            skeleton, clips, current_clip: if has_clips { Some(0) } else { None },
            time: 0.0, speed: 1.0, looping: true,
        }
    }

    pub fn update(&mut self, dt: f32) {
        if let Some(clip_idx) = self.current_clip {
            let clip = &self.clips[clip_idx];
            self.time += dt * self.speed;
            if self.looping && self.time > clip.duration {
                self.time %= clip.duration;
            }
            self.evaluate(clip_idx);
        }
    }

    fn evaluate(&mut self, clip_idx: usize) {
        let clip = &self.clips[clip_idx];
        let t = self.time;

        // Reset bone local transforms
        for bone in &mut self.skeleton.bones {
            bone.local_transform = Mat4::IDENTITY;
        }

        // Apply animation channels
        for channel in &clip.channels {
            let translation = interpolate_vec3(&channel.translations, t);
            let rotation = interpolate_quat(&channel.rotations, t);
            let scale = interpolate_vec3(&channel.scales, t);

            if channel.bone_index < self.skeleton.bones.len() {
                self.skeleton.bones[channel.bone_index].local_transform =
                    Mat4::from_scale_rotation_translation(
                        scale.unwrap_or(Vec3::ONE),
                        rotation.unwrap_or(Quat::IDENTITY),
                        translation.unwrap_or(Vec3::ZERO),
                    );
            }
        }

        // Compute world transforms
        let bone_count = self.skeleton.bones.len();
        self.skeleton.bone_matrices.resize(bone_count, Mat4::IDENTITY);

        for i in 0..bone_count {
            let parent_mat = if let Some(p) = self.skeleton.bones[i].parent {
                self.skeleton.bone_matrices[p]
            } else {
                Mat4::IDENTITY
            };
            let world = parent_mat * self.skeleton.bones[i].local_transform;
            self.skeleton.bone_matrices[i] = world * self.skeleton.bones[i].inverse_bind;
        }
    }

    /// Get bone matrices for GPU upload (max 128 bones)
    pub fn get_bone_matrices(&self) -> Vec<[f32; 16]> {
        self.skeleton.bone_matrices.iter()
            .take(128)
            .map(|m| m.to_cols_array())
            .collect()
    }

    pub fn play(&mut self, name: &str) {
        for (i, clip) in self.clips.iter().enumerate() {
            if clip.name == name {
                self.current_clip = Some(i);
                self.time = 0.0;
                return;
            }
        }
    }
}

fn interpolate_vec3(keyframes: &[(f32, Vec3)], t: f32) -> Option<Vec3> {
    if keyframes.is_empty() { return None; }
    if keyframes.len() == 1 { return Some(keyframes[0].1); }
    if t <= keyframes[0].0 { return Some(keyframes[0].1); }
    if t >= keyframes.last().unwrap().0 { return Some(keyframes.last().unwrap().1); }

    for i in 0..keyframes.len() - 1 {
        if t >= keyframes[i].0 && t < keyframes[i + 1].0 {
            let frac = (t - keyframes[i].0) / (keyframes[i + 1].0 - keyframes[i].0);
            return Some(keyframes[i].1.lerp(keyframes[i + 1].1, frac));
        }
    }
    Some(keyframes.last().unwrap().1)
}

fn interpolate_quat(keyframes: &[(f32, Quat)], t: f32) -> Option<Quat> {
    if keyframes.is_empty() { return None; }
    if keyframes.len() == 1 { return Some(keyframes[0].1); }
    if t <= keyframes[0].0 { return Some(keyframes[0].1); }
    if t >= keyframes.last().unwrap().0 { return Some(keyframes.last().unwrap().1); }

    for i in 0..keyframes.len() - 1 {
        if t >= keyframes[i].0 && t < keyframes[i + 1].0 {
            let frac = (t - keyframes[i].0) / (keyframes[i + 1].0 - keyframes[i].0);
            return Some(keyframes[i].1.slerp(keyframes[i + 1].1, frac));
        }
    }
    Some(keyframes.last().unwrap().1)
}

/// Load skeleton + animations from glTF
pub fn load_skeleton_from_gltf(path: &Path) -> Option<(Skeleton, Vec<AnimationClip>)> {
    let (document, buffers, _) = gltf::import(path).ok()?;
    
    // Find skin
    let skin = document.skins().next()?;
    let reader = skin.reader(|buf| Some(&buffers[buf.index()]));
    
    let joints: Vec<_> = skin.joints().collect();
    let inverse_binds: Vec<Mat4> = reader.read_inverse_bind_matrices()
        .map(|ibm| ibm.map(|m| Mat4::from_cols_array_2d(&m)).collect())
        .unwrap_or_else(|| vec![Mat4::IDENTITY; joints.len()]);
    
    let mut bones = Vec::new();
    let joint_indices: Vec<usize> = joints.iter().map(|j| j.index()).collect();
    
    for (i, joint) in joints.iter().enumerate() {
        let parent = {
                let mut found = None;
                for (pi, pj) in joints.iter().enumerate() {
                    for child in pj.children() {
                        if child.index() == joint.index() {
                            found = Some(pi);
                            break;
                        }
                    }
                    if found.is_some() { break; }
                }
                found
            };
        
        let (t, r, s) = joint.transform().decomposed();
        let local = Mat4::from_scale_rotation_translation(
            Vec3::from_array(s),
            Quat::from_array(r),
            Vec3::from_array(t),
        );
        
        bones.push(Bone {
            name: joint.name().unwrap_or("bone").to_string(),
            parent,
            inverse_bind: inverse_binds.get(i).copied().unwrap_or(Mat4::IDENTITY),
            local_transform: local,
        });
    }
    
    // Load animations
    let mut clips = Vec::new();
    for anim in document.animations() {
        let mut channels = Vec::new();
        let mut duration = 0.0f32;
        
        for channel in anim.channels() {
            let target = channel.target();
            let bone_idx = joint_indices.iter().position(|&j| j == target.node().index());
            let bone_idx = match bone_idx { Some(i) => i, None => continue };
            
            let reader = channel.reader(|buf| Some(&buffers[buf.index()]));
            let times: Vec<f32> = reader.read_inputs().unwrap().collect();
            duration = duration.max(*times.last().unwrap_or(&0.0));
            
            let mut anim_channel = AnimChannel {
                bone_index: bone_idx,
                translations: Vec::new(),
                rotations: Vec::new(),
                scales: Vec::new(),
            };
            
            match reader.read_outputs().unwrap() {
                gltf::animation::util::ReadOutputs::Translations(vals) => {
                    anim_channel.translations = times.iter().zip(vals).map(|(&t, v)| (t, Vec3::from_array(v))).collect();
                }
                gltf::animation::util::ReadOutputs::Rotations(vals) => {
                    anim_channel.rotations = times.iter().zip(vals.into_f32()).map(|(&t, v)| (t, Quat::from_array(v))).collect();
                }
                gltf::animation::util::ReadOutputs::Scales(vals) => {
                    anim_channel.scales = times.iter().zip(vals).map(|(&t, v)| (t, Vec3::from_array(v))).collect();
                }
                _ => {}
            }
            
            channels.push(anim_channel);
        }
        
        clips.push(AnimationClip {
            name: anim.name().unwrap_or("default").to_string(),
            duration,
            channels,
        });
    }
    
    if bones.is_empty() { return None; }
    
    tracing::info!("🦴 Loaded skeleton: {} bones, {} animations", bones.len(), clips.len());
    
    Some((Skeleton { bones, bone_matrices: Vec::new() }, clips))
}
