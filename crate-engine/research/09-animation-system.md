# 09 — Animation System: State Machines, Blending, Mixamo

> Bringing characters to life

---

## Animation State Machine

### The States

```
MOVEMENT:
  idle → walk → run → sprint
  any → jump → fall → land → idle
  any → roll (dodge)
  idle ↔ crouch → crouch_walk

COMBAT:
  idle → attack_light_1 → attack_light_2 → attack_light_3
  idle → attack_heavy
  idle → block (hold) → parry (timed)
  hit_reaction → idle
  death

SPECIAL:
  idle → climb_ladder → climb_top
  idle → swim_idle → swim_forward
  idle → interact (pick up, open door)
  idle → enter_vehicle → driving
```

### Three.js Animation Mixer

```javascript
class AnimationController {
    constructor(model) {
        this.mixer = new THREE.AnimationMixer(model);
        this.actions = {};
        this.currentAction = null;
        this.previousAction = null;
        
        // Load all animations
        for (const clip of model.animations) {
            const action = this.mixer.clipAction(clip);
            this.actions[clip.name] = action;
        }
    }
    
    play(name, {
        fadeIn = 0.2,
        fadeOut = 0.2,
        loop = THREE.LoopRepeat,
        clampWhenFinished = false,
        timeScale = 1,
        onFinish = null,
    } = {}) {
        const action = this.actions[name];
        if (!action) return;
        
        if (this.currentAction === action) return;
        
        // Crossfade
        if (this.currentAction) {
            this.currentAction.fadeOut(fadeOut);
        }
        
        action.reset();
        action.setLoop(loop);
        action.clampWhenFinished = clampWhenFinished;
        action.timeScale = timeScale;
        action.fadeIn(fadeIn);
        action.play();
        
        this.previousAction = this.currentAction;
        this.currentAction = action;
        
        if (onFinish) {
            const listener = (e) => {
                if (e.action === action) {
                    onFinish();
                    this.mixer.removeEventListener('finished', listener);
                }
            };
            this.mixer.addEventListener('finished', listener);
        }
    }
    
    update(dt) {
        this.mixer.update(dt);
    }
}
```

### State Machine Integration

```javascript
class CharacterAnimStateMachine {
    constructor(animController) {
        this.anim = animController;
        this.state = 'idle';
    }
    
    transition(newState) {
        if (newState === this.state) return;
        
        const transitions = {
            idle: () => this.anim.play('Idle'),
            walk: () => this.anim.play('Walking', { fadeIn: 0.15 }),
            run: () => this.anim.play('Running', { fadeIn: 0.15 }),
            sprint: () => this.anim.play('Sprinting', { fadeIn: 0.2 }),
            jump: () => this.anim.play('Jump', { 
                loop: THREE.LoopOnce, clampWhenFinished: true,
                onFinish: () => this.transition('fall') 
            }),
            fall: () => this.anim.play('Falling', { fadeIn: 0.1 }),
            land: () => this.anim.play('Landing', {
                loop: THREE.LoopOnce, clampWhenFinished: true,
                onFinish: () => this.transition('idle')
            }),
            roll: () => this.anim.play('Roll', {
                loop: THREE.LoopOnce, clampWhenFinished: true, timeScale: 1.5,
                onFinish: () => this.transition('idle')
            }),
            attack_light: () => this.anim.play('Slash', {
                loop: THREE.LoopOnce, clampWhenFinished: true,
                onFinish: () => this.transition('idle')
            }),
            attack_heavy: () => this.anim.play('HeavySlash', {
                loop: THREE.LoopOnce, clampWhenFinished: true, timeScale: 0.8,
                onFinish: () => this.transition('idle')
            }),
            block: () => this.anim.play('Block_Idle'),
            hit: () => this.anim.play('Hit_Reaction', {
                loop: THREE.LoopOnce, clampWhenFinished: true,
                onFinish: () => this.transition('idle')
            }),
            death: () => this.anim.play('Death', {
                loop: THREE.LoopOnce, clampWhenFinished: true
            }),
            swim: () => this.anim.play('Swimming'),
            climb: () => this.anim.play('Climbing'),
        };
        
        const fn = transitions[newState];
        if (fn) {
            this.state = newState;
            fn();
        }
    }
    
    // Called every frame — determines state from character state
    evaluateState(character) {
        if (character.isDead) return this.transition('death');
        if (character.isHit) return this.transition('hit');
        if (character.isAttacking) return; // don't interrupt attacks
        if (character.isRolling) return this.transition('roll');
        if (character.isBlocking) return this.transition('block');
        if (character.isSwimming) return this.transition('swim');
        if (character.isClimbing) return this.transition('climb');
        
        if (!character.isGrounded) {
            if (character.velocity.y > 0) return this.transition('jump');
            return this.transition('fall');
        }
        
        const speed = character.horizontalSpeed;
        if (speed > 8) return this.transition('sprint');
        if (speed > 4) return this.transition('run');
        if (speed > 0.5) return this.transition('walk');
        return this.transition('idle');
    }
}
```

---

## Mixamo Integration

### Downloading Animations
1. Go to mixamo.com
2. Upload character or use default
3. Download animations as FBX (without skin for reuse)
4. Convert FBX → GLB: `npx fbx2gltf -i anim.fbx -o anim.glb`

### Essential Animation Pack for Soulslike

```
Movement:
  - Idle
  - Walking
  - Running  
  - Sprinting
  - Jump
  - Falling
  - Landing (hard/soft)
  - Crouch_Idle
  - Crouch_Walk
  - Roll_Forward
  - Roll_Left / Roll_Right / Roll_Back
  - Strafe_Left / Strafe_Right

Combat:
  - Sword_Slash_1, _2, _3 (combo chain)
  - Sword_Heavy
  - Sword_Block
  - Sword_Parry
  - Bow_Draw, Bow_Release
  - Hit_Reaction_Front, _Back
  - Death_Forward, Death_Backward
  - Get_Up (after knockdown)

Special:
  - Climb_Ladder
  - Climb_Ledge
  - Swimming
  - Pick_Up
  - Open_Door
  - Sitting
  - Enter_Vehicle
  - Driving
```

### Retargeting Animations Across Characters

All Mixamo characters share the same skeleton naming. To use animations across different character models:

```javascript
// Load animation from one GLB, apply to another character
async function loadAnimation(url, targetModel) {
    const gltf = await loader.loadAsync(url);
    
    for (const clip of gltf.animations) {
        // Retarget: rename bones if needed
        // Mixamo uses: mixamorig:Hips, mixamorig:Spine, etc.
        // Some models drop the prefix
        
        for (const track of clip.tracks) {
            // Normalize bone names
            track.name = track.name.replace('mixamorig:', '');
        }
        
        // Add to target's animation list
        targetModel.animations.push(clip);
    }
}
```

---

## Animation Blending (Advanced)

### Blend Trees (for movement)

Instead of hard transitions, blend between animations based on speed:

```javascript
class BlendTree {
    constructor(mixer, model) {
        this.idle = mixer.clipAction(THREE.AnimationClip.findByName(model.animations, 'Idle'));
        this.walk = mixer.clipAction(THREE.AnimationClip.findByName(model.animations, 'Walk'));
        this.run = mixer.clipAction(THREE.AnimationClip.findByName(model.animations, 'Run'));
        
        // Play all simultaneously
        this.idle.play();
        this.walk.play();
        this.run.play();
    }
    
    update(speed) {
        // Blend weights based on speed
        if (speed < 0.1) {
            this.idle.setEffectiveWeight(1);
            this.walk.setEffectiveWeight(0);
            this.run.setEffectiveWeight(0);
        } else if (speed < 4) {
            const t = speed / 4;
            this.idle.setEffectiveWeight(1 - t);
            this.walk.setEffectiveWeight(t);
            this.run.setEffectiveWeight(0);
        } else {
            const t = Math.min(1, (speed - 4) / 4);
            this.idle.setEffectiveWeight(0);
            this.walk.setEffectiveWeight(1 - t);
            this.run.setEffectiveWeight(t);
        }
    }
}
```

### Upper/Lower Body Split

Play different animations on upper and lower body:

```javascript
// Run on legs while swinging sword on upper body
function setupSplitAnimation(mixer, model) {
    const runAction = mixer.clipAction(findClip('Running'));
    const slashAction = mixer.clipAction(findClip('Slash'));
    
    // Only affect upper body bones for slash
    const upperBodyBones = ['Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
        'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
        'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand'];
    
    // Filter slash tracks to only upper body
    const filteredTracks = slashAction.getClip().tracks.filter(track => {
        const boneName = track.name.split('.')[0];
        return upperBodyBones.some(b => boneName.includes(b));
    });
    
    const upperClip = new THREE.AnimationClip('Slash_Upper', 
        slashAction.getClip().duration, filteredTracks);
    const upperAction = mixer.clipAction(upperClip);
    
    // Play both
    runAction.play();
    upperAction.play();
}
```

---

## Root Motion

Some animations (rolls, dashes) should move the character via the animation, not code:

```javascript
function extractRootMotion(clip, boneName = 'Hips') {
    const posTrack = clip.tracks.find(t => 
        t.name.includes(boneName) && t.name.endsWith('.position')
    );
    
    if (!posTrack) return null;
    
    // Get total displacement
    const startPos = new THREE.Vector3(
        posTrack.values[0], posTrack.values[1], posTrack.values[2]
    );
    const endIdx = (posTrack.values.length / 3 - 1) * 3;
    const endPos = new THREE.Vector3(
        posTrack.values[endIdx], posTrack.values[endIdx+1], posTrack.values[endIdx+2]
    );
    
    return {
        displacement: endPos.sub(startPos),
        duration: clip.duration,
    };
}
```

---

## Implementation Plan for Crate Engine

### Phase 1: Basic State Machine
- AnimationController class wrapping Three.js mixer
- States: idle, walk, run, jump, fall
- Crossfade transitions

### Phase 2: Combat Animations
- Attack combos (3-hit chain)
- Hit reactions
- Death
- Block/parry

### Phase 3: Mixamo Pack
- Download 20-30 essential animations
- Store in `web/assets/animations/`
- Auto-load on character spawn

### Phase 4: Advanced
- Blend trees for smooth movement
- Upper/lower body split
- Root motion for rolls
- IK for foot placement on uneven terrain

---

*Next: 10-polish-and-feel.md — What makes a game feel "real"*
