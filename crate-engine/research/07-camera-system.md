# 07 — Camera System: 3rd Person, 1st Person, Transitions

> The player sees the world through the camera — get it right

---

## Third Person Camera (Soulslike Default)

### Orbit Camera with Collision

```javascript
class ThirdPersonCamera {
    constructor(camera, target) {
        this.camera = camera;
        this.target = target; // character mesh
        
        this.distance = 5;
        this.minDistance = 1.5;
        this.maxDistance = 10;
        this.height = 1.8; // look-at height on character
        
        this.yaw = 0;   // horizontal rotation
        this.pitch = 0.3; // vertical angle (radians)
        this.minPitch = -0.8;
        this.maxPitch = 1.2;
        
        this.sensitivity = 0.003;
        this.smoothSpeed = 10;
        
        // Current interpolated values
        this.currentPos = new THREE.Vector3();
        this.currentTarget = new THREE.Vector3();
        this.currentDistance = this.distance;
    }
    
    handleMouseMove(dx, dy) {
        this.yaw -= dx * this.sensitivity;
        this.pitch -= dy * this.sensitivity;
        this.pitch = THREE.MathUtils.clamp(this.pitch, this.minPitch, this.maxPitch);
    }
    
    handleScroll(delta) {
        this.distance += delta * 0.5;
        this.distance = THREE.MathUtils.clamp(this.distance, this.minDistance, this.maxDistance);
    }
    
    update(dt) {
        // Look-at point (character's head area)
        const lookAt = this.target.position.clone();
        lookAt.y += this.height;
        
        // Desired camera position (orbit)
        const desiredPos = new THREE.Vector3(
            Math.sin(this.yaw) * Math.cos(this.pitch) * this.distance,
            Math.sin(this.pitch) * this.distance,
            Math.cos(this.yaw) * Math.cos(this.pitch) * this.distance
        ).add(lookAt);
        
        // COLLISION: Prevent camera going through walls
        const actualDistance = this.checkCameraCollision(lookAt, desiredPos);
        
        if (actualDistance < this.distance) {
            // Pull camera closer
            const dir = new THREE.Vector3().subVectors(desiredPos, lookAt).normalize();
            desiredPos.copy(lookAt).add(dir.multiplyScalar(actualDistance));
        }
        
        // Smooth interpolation
        this.currentPos.lerp(desiredPos, this.smoothSpeed * dt);
        this.currentTarget.lerp(lookAt, this.smoothSpeed * dt);
        
        this.camera.position.copy(this.currentPos);
        this.camera.lookAt(this.currentTarget);
    }
    
    checkCameraCollision(from, to) {
        const dir = new THREE.Vector3().subVectors(to, from);
        const distance = dir.length();
        dir.normalize();
        
        const raycaster = new THREE.Raycaster(from, dir, 0, distance);
        const hits = raycaster.intersectObject(worldCollider, true);
        
        if (hits.length > 0) {
            return hits[0].distance - 0.3; // offset to not clip into wall
        }
        return distance;
    }
}
```

---

## First Person Camera

```javascript
class FirstPersonCamera {
    constructor(camera, character) {
        this.camera = camera;
        this.character = character;
        this.yaw = 0;
        this.pitch = 0;
        this.sensitivity = 0.002;
        this.eyeHeight = 1.7;
        this.headBobAmount = 0.03;
        this.headBobSpeed = 10;
        this.headBobTimer = 0;
    }
    
    handleMouseMove(dx, dy) {
        this.yaw -= dx * this.sensitivity;
        this.pitch -= dy * this.sensitivity;
        this.pitch = THREE.MathUtils.clamp(this.pitch, -Math.PI / 2 + 0.1, Math.PI / 2 - 0.1);
    }
    
    update(dt, isMoving, speed) {
        // Position at character's eyes
        const eyePos = this.character.position.clone();
        eyePos.y += this.eyeHeight;
        
        // Head bob when moving
        if (isMoving && speed > 0.1) {
            this.headBobTimer += dt * this.headBobSpeed * (speed / 5);
            eyePos.y += Math.sin(this.headBobTimer) * this.headBobAmount;
            eyePos.x += Math.cos(this.headBobTimer * 0.5) * this.headBobAmount * 0.5;
        }
        
        this.camera.position.copy(eyePos);
        
        // Rotation
        const euler = new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ');
        this.camera.quaternion.setFromEuler(euler);
        
        // Also rotate character (yaw only)
        this.character.rotation.y = this.yaw;
    }
}
```

---

## Camera Switching (3rd ↔ 1st Person)

```javascript
class CameraManager {
    constructor(camera, character) {
        this.camera = camera;
        this.character = character;
        this.thirdPerson = new ThirdPersonCamera(camera, character);
        this.firstPerson = new FirstPersonCamera(camera, character);
        this.active = this.thirdPerson;
        this.mode = 'third';
        this.transitioning = false;
        this.transitionDuration = 0.3;
        this.transitionTimer = 0;
        this.startPos = new THREE.Vector3();
        this.startQuat = new THREE.Quaternion();
    }
    
    toggle() {
        if (this.transitioning) return;
        
        this.transitioning = true;
        this.transitionTimer = 0;
        this.startPos.copy(this.camera.position);
        this.startQuat.copy(this.camera.quaternion);
        
        if (this.mode === 'third') {
            this.mode = 'first';
            this.firstPerson.yaw = this.thirdPerson.yaw;
            this.firstPerson.pitch = this.thirdPerson.pitch;
            // Hide character mesh in first person
            this.character.visible = false;
        } else {
            this.mode = 'third';
            this.thirdPerson.yaw = this.firstPerson.yaw;
            this.thirdPerson.pitch = this.firstPerson.pitch;
            this.character.visible = true;
        }
        
        this.active = this.mode === 'third' ? this.thirdPerson : this.firstPerson;
    }
    
    handleMouseMove(dx, dy) {
        this.active.handleMouseMove(dx, dy);
    }
    
    update(dt, isMoving, speed) {
        if (this.transitioning) {
            this.transitionTimer += dt;
            const t = Math.min(1, this.transitionTimer / this.transitionDuration);
            const eased = t * t * (3 - 2 * t); // smoothstep
            
            // Get target position from active camera
            this.active.update(dt, isMoving, speed);
            const targetPos = this.camera.position.clone();
            const targetQuat = this.camera.quaternion.clone();
            
            // Interpolate from start
            this.camera.position.lerpVectors(this.startPos, targetPos, eased);
            this.camera.quaternion.slerpQuaternions(this.startQuat, targetQuat, eased);
            
            if (t >= 1) this.transitioning = false;
        } else {
            this.active.update(dt, isMoving, speed);
        }
    }
}

// V key to toggle
document.addEventListener('keydown', (e) => {
    if (e.key === 'v' || e.key === 'V') {
        cameraManager.toggle();
    }
});
```

---

## Cinematic Camera (Cutscenes)

```javascript
class CinematicCamera {
    constructor(camera) {
        this.camera = camera;
        this.path = []; // { position, lookAt, time }
        this.playing = false;
        this.timer = 0;
    }
    
    play(keyframes) {
        this.path = keyframes;
        this.playing = true;
        this.timer = 0;
    }
    
    update(dt) {
        if (!this.playing) return;
        this.timer += dt;
        
        // Find current segment
        let i = 0;
        while (i < this.path.length - 1 && this.path[i + 1].time < this.timer) i++;
        
        if (i >= this.path.length - 1) {
            this.playing = false;
            return;
        }
        
        const a = this.path[i];
        const b = this.path[i + 1];
        const t = (this.timer - a.time) / (b.time - a.time);
        const eased = t * t * (3 - 2 * t);
        
        this.camera.position.lerpVectors(a.position, b.position, eased);
        const lookAt = new THREE.Vector3().lerpVectors(a.lookAt, b.lookAt, eased);
        this.camera.lookAt(lookAt);
    }
}
```

---

## Implementation Plan for Crate Engine

1. **Refactor current camera** → ThirdPersonCamera class with collision
2. **Add FirstPersonCamera** class
3. **CameraManager** with V key toggle + smooth transition
4. **Vehicle camera** (auto-follows behind vehicle)
5. **Lock-on camera** override (for combat)

---

*Next: 08-collision-physics.md — Solid world, no clipping, navmesh*
