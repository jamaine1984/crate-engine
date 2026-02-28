# 03 — Vehicle Physics: Cars, Planes, Helicopters, Boats

> Making things you can drive, fly, and sail

---

## The Enter/Exit Flow

Every vehicle needs a clean enter/exit system:

```
1. Player walks near vehicle → "Press E to enter" prompt
2. Press E → disable character controller, parent camera to vehicle
3. Vehicle controls active (WASD/mouse)
4. Press E → exit: find safe exit point, re-enable character controller
```

```javascript
class VehicleManager {
    constructor(scene) {
        this.vehicles = [];
        this.activeVehicle = null;
    }
    
    enterVehicle(vehicle, character) {
        this.activeVehicle = vehicle;
        character.visible = false;
        character.controlsEnabled = false;
        vehicle.occupied = true;
        vehicle.driver = character;
        // Attach camera to vehicle
        camera.parent = vehicle.cameraMount;
    }
    
    exitVehicle(character) {
        const vehicle = this.activeVehicle;
        // Find safe exit position (left side of vehicle, not inside walls)
        const exitPos = findSafeExitPoint(vehicle);
        character.position.copy(exitPos);
        character.visible = true;
        character.controlsEnabled = true;
        vehicle.occupied = false;
        vehicle.driver = null;
        camera.parent = character.cameraMount;
        this.activeVehicle = null;
    }
    
    update(input, dt) {
        if (this.activeVehicle) {
            this.activeVehicle.update(input, dt);
        }
    }
}
```

---

## Cars

### Arcade vs Simulation
- **Arcade** (recommended for Crate Engine): simplified, fun, responsive
- **Simulation**: real tire physics, suspension, weight transfer — complex

### Arcade Car Physics

```javascript
class ArcadeCar {
    constructor(mesh) {
        this.mesh = mesh;
        this.speed = 0;
        this.maxSpeed = 30; // m/s (~108 km/h)
        this.acceleration = 15;
        this.braking = 25;
        this.friction = 5;
        this.turnSpeed = 2.5;
        this.steerAngle = 0;
        this.maxSteer = Math.PI / 6; // 30 degrees
        
        // Wheel references (child meshes)
        this.wheels = {
            fl: mesh.getObjectByName('wheel_fl'),
            fr: mesh.getObjectByName('wheel_fr'),
            rl: mesh.getObjectByName('wheel_rl'),
            rr: mesh.getObjectByName('wheel_rr'),
        };
        
        this.wheelBase = 2.5; // distance between front and rear axle
    }
    
    update(input, dt) {
        // Acceleration / Braking
        if (input.forward) {
            this.speed += this.acceleration * dt;
        } else if (input.backward) {
            if (this.speed > 0) {
                this.speed -= this.braking * dt; // braking
            } else {
                this.speed -= this.acceleration * 0.5 * dt; // reverse
            }
        } else {
            // Friction deceleration
            this.speed -= Math.sign(this.speed) * this.friction * dt;
            if (Math.abs(this.speed) < 0.1) this.speed = 0;
        }
        
        // Clamp speed
        this.speed = THREE.MathUtils.clamp(this.speed, -this.maxSpeed * 0.3, this.maxSpeed);
        
        // Steering
        const targetSteer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
        this.steerAngle = THREE.MathUtils.lerp(this.steerAngle, targetSteer * this.maxSteer, 5 * dt);
        
        // Bicycle model turning (simplified Ackermann)
        if (Math.abs(this.speed) > 0.1) {
            const turnRadius = this.wheelBase / Math.tan(Math.abs(this.steerAngle) + 0.001);
            const angularVelocity = this.speed / turnRadius * Math.sign(this.steerAngle);
            this.mesh.rotation.y += angularVelocity * dt;
        }
        
        // Move forward in facing direction
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.mesh.quaternion);
        this.mesh.position.add(forward.multiplyScalar(this.speed * dt));
        
        // Ground follow (raycast down)
        this.snapToGround();
        
        // Animate wheels
        this.animateWheels(dt);
    }
    
    snapToGround() {
        // Four raycasts from wheel positions
        const wheelPositions = [
            new THREE.Vector3(-0.8, 1, -1.2), // FL
            new THREE.Vector3(0.8, 1, -1.2),  // FR
            new THREE.Vector3(-0.8, 1, 1.2),  // RL
            new THREE.Vector3(0.8, 1, 1.2),   // RR
        ];
        
        let avgY = 0;
        let hits = 0;
        const worldPoints = [];
        
        for (const local of wheelPositions) {
            const world = local.clone().applyMatrix4(this.mesh.matrixWorld);
            world.y += 2; // start raycast above
            
            raycaster.set(world, DOWN);
            const hit = raycaster.intersectObject(terrain);
            if (hit.length > 0) {
                worldPoints.push(hit[0].point);
                avgY += hit[0].point.y;
                hits++;
            }
        }
        
        if (hits >= 3) {
            // Average height
            this.mesh.position.y = avgY / hits + 0.5; // + chassis offset
            
            // Tilt car to match terrain (using 3 or 4 points)
            if (worldPoints.length >= 3) {
                const normal = computePlaneNormal(worldPoints);
                alignToNormal(this.mesh, normal);
            }
        }
    }
    
    animateWheels(dt) {
        const spinRate = this.speed * 3; // visual spin
        for (const key of ['fl', 'fr', 'rl', 'rr']) {
            if (this.wheels[key]) {
                this.wheels[key].rotation.x += spinRate * dt;
            }
        }
        // Front wheels steer
        if (this.wheels.fl) this.wheels.fl.rotation.y = this.steerAngle;
        if (this.wheels.fr) this.wheels.fr.rotation.y = this.steerAngle;
    }
}
```

### Suspension (Visual Only for Arcade)

```javascript
// Simple visual suspension — wheels move up/down based on ground
function updateWheelSuspension(wheel, groundY, restY, maxTravel = 0.3) {
    const compression = Math.max(0, restY - groundY);
    const clampedTravel = Math.min(compression, maxTravel);
    wheel.position.y = -clampedTravel; // wheel moves down relative to body
}
```

---

## Helicopters

### Flight Model (Simplified)

```javascript
class Helicopter {
    constructor(mesh) {
        this.mesh = mesh;
        this.velocity = new THREE.Vector3();
        this.angularVel = new THREE.Vector3();
        
        this.throttle = 0; // 0 to 1
        this.liftForce = 15; // must exceed gravity (9.81) to fly
        this.maxSpeed = 25;
        this.tiltSpeed = 2;
        this.yawSpeed = 1.5;
        this.drag = 0.98;
        this.gravity = 9.81;
        
        this.rotor = mesh.getObjectByName('rotor');
    }
    
    update(input, dt) {
        // Throttle (Space = up, Shift = down)
        if (input.jump) this.throttle = Math.min(1, this.throttle + dt * 0.8);
        else if (input.crouch) this.throttle = Math.max(0, this.throttle - dt * 0.8);
        
        // Lift
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.mesh.quaternion);
        const lift = up.multiplyScalar(this.throttle * this.liftForce);
        
        // Gravity
        const grav = new THREE.Vector3(0, -this.gravity, 0);
        
        // Tilt for movement (WASD tilts helicopter)
        const euler = new THREE.Euler().setFromQuaternion(this.mesh.quaternion);
        
        if (input.forward) euler.x -= this.tiltSpeed * dt;
        if (input.backward) euler.x += this.tiltSpeed * dt;
        if (input.left) euler.z += this.tiltSpeed * dt;
        if (input.right) euler.z -= this.tiltSpeed * dt;
        
        // Clamp tilt
        euler.x = THREE.MathUtils.clamp(euler.x, -0.4, 0.4);
        euler.z = THREE.MathUtils.clamp(euler.z, -0.4, 0.4);
        
        // Yaw (Q/E or mouse)
        if (input.yawLeft) euler.y += this.yawSpeed * dt;
        if (input.yawRight) euler.y -= this.yawSpeed * dt;
        
        this.mesh.quaternion.setFromEuler(euler);
        
        // Auto-level when no input
        if (!input.forward && !input.backward) euler.x *= 0.95;
        if (!input.left && !input.right) euler.z *= 0.95;
        
        // Apply forces
        this.velocity.add(lift.multiplyScalar(dt));
        this.velocity.add(grav.multiplyScalar(dt));
        this.velocity.multiplyScalar(this.drag);
        
        // Clamp speed
        if (this.velocity.length() > this.maxSpeed) {
            this.velocity.setLength(this.maxSpeed);
        }
        
        // Move
        this.mesh.position.add(this.velocity.clone().multiplyScalar(dt));
        
        // Ground collision
        if (this.mesh.position.y < groundY + 1.0) {
            this.mesh.position.y = groundY + 1.0;
            this.velocity.y = Math.max(0, this.velocity.y);
        }
        
        // Rotor spin
        if (this.rotor) {
            this.rotor.rotation.y += this.throttle * 30 * dt;
        }
    }
}
```

---

## Planes (Fixed Wing)

```javascript
class Airplane {
    constructor(mesh) {
        this.mesh = mesh;
        this.speed = 0;
        this.minFlySpeed = 15; // stall speed
        this.maxSpeed = 60;
        this.thrust = 20;
        this.liftCoefficient = 0.5;
        this.drag = 0.02;
        this.gravity = 9.81;
        this.velocity = new THREE.Vector3();
        
        this.pitch = 0;
        this.roll = 0;
        this.yaw = 0;
    }
    
    update(input, dt) {
        // Thrust
        if (input.forward) this.speed += this.thrust * dt;
        if (input.backward) this.speed -= this.thrust * 0.5 * dt;
        this.speed = THREE.MathUtils.clamp(this.speed, 0, this.maxSpeed);
        
        // Controls
        if (input.pitchUp) this.pitch -= 1.5 * dt;
        if (input.pitchDown) this.pitch += 1.5 * dt;
        if (input.rollLeft) this.roll += 2.0 * dt;
        if (input.rollRight) this.roll -= 2.0 * dt;
        
        // Auto-yaw from roll (coordinated turn)
        this.yaw -= Math.sin(this.roll) * 0.8 * dt;
        
        // Apply rotation
        const q = new THREE.Quaternion();
        q.setFromEuler(new THREE.Euler(this.pitch, this.yaw, this.roll, 'YXZ'));
        this.mesh.quaternion.copy(q);
        
        // Forward direction
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
        
        // Lift (proportional to speed squared, only if above stall speed)
        const liftMag = this.speed > this.minFlySpeed 
            ? this.liftCoefficient * this.speed * this.speed * 0.001 
            : 0;
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
        
        // Physics
        this.velocity.copy(forward.multiplyScalar(this.speed));
        this.velocity.y += (liftMag - this.gravity) * dt;
        
        this.mesh.position.add(this.velocity.clone().multiplyScalar(dt));
    }
}
```

---

## Boats

```javascript
class Boat {
    constructor(mesh) {
        this.mesh = mesh;
        this.speed = 0;
        this.maxSpeed = 15;
        this.acceleration = 8;
        this.turnSpeed = 1.5;
        this.drag = 0.95;
        this.bobAmplitude = 0.15;
        this.bobSpeed = 1.2;
        this.time = 0;
    }
    
    update(input, dt) {
        this.time += dt;
        
        // Throttle
        if (input.forward) this.speed += this.acceleration * dt;
        else this.speed *= this.drag;
        this.speed = THREE.MathUtils.clamp(this.speed, -this.maxSpeed * 0.3, this.maxSpeed);
        
        // Steering (more responsive at speed)
        const steerFactor = Math.min(1, this.speed / 5);
        if (input.left) this.mesh.rotation.y += this.turnSpeed * steerFactor * dt;
        if (input.right) this.mesh.rotation.y -= this.turnSpeed * steerFactor * dt;
        
        // Move
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.mesh.quaternion);
        this.mesh.position.add(forward.multiplyScalar(this.speed * dt));
        
        // Stick to water surface with bob
        const waterY = getWaterHeight(this.mesh.position.x, this.mesh.position.z, this.time);
        this.mesh.position.y = waterY + this.bobAmplitude * Math.sin(this.time * this.bobSpeed);
        
        // Tilt with waves
        const sampleDist = 2.0;
        const fwd = this.mesh.position.clone().add(forward.clone().multiplyScalar(sampleDist));
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.mesh.quaternion);
        const side = this.mesh.position.clone().add(right.clone().multiplyScalar(sampleDist));
        
        const fwdY = getWaterHeight(fwd.x, fwd.z, this.time);
        const sideY = getWaterHeight(side.x, side.z, this.time);
        
        this.mesh.rotation.x = Math.atan2(waterY - fwdY, sampleDist) * 0.5;
        this.mesh.rotation.z = Math.atan2(sideY - waterY, sampleDist) * 0.5;
    }
}
```

---

## Vehicle Camera

```javascript
class VehicleCamera {
    constructor(camera) {
        this.camera = camera;
        this.distance = 8;
        this.height = 3;
        this.lookAhead = 5;
        this.smoothSpeed = 5;
        this.currentPos = new THREE.Vector3();
    }
    
    update(vehicle, dt) {
        // Target position: behind and above vehicle
        const back = new THREE.Vector3(0, 0, 1).applyQuaternion(vehicle.mesh.quaternion);
        const targetPos = vehicle.mesh.position.clone()
            .add(back.multiplyScalar(this.distance))
            .add(new THREE.Vector3(0, this.height, 0));
        
        // Smooth follow
        this.currentPos.lerp(targetPos, this.smoothSpeed * dt);
        this.camera.position.copy(this.currentPos);
        
        // Look ahead of vehicle
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(vehicle.mesh.quaternion);
        const lookTarget = vehicle.mesh.position.clone()
            .add(forward.multiplyScalar(this.lookAhead));
        this.camera.lookAt(lookTarget);
    }
}
```

---

## Implementation Plan for Crate Engine

### Phase 1: Car (most requested)
- Arcade car physics (code above)
- WASD driving, ground-follow raycasts
- Enter/exit system
- 1-2 car GLB models

### Phase 2: Boat
- Water surface following + bob
- Simple throttle + steering

### Phase 3: Helicopter
- Throttle lift model
- Tilt-to-move
- Rotor animation

### Phase 4: Airplane
- Thrust + lift model
- Take off from runway
- Landing gear

### Key Decision: Physics Engine
For proper vehicle collision (car hitting wall, rolling over), **Rapier.js** again. Arcade works fine without it, but collision response needs physics.

---

*Next: 04-water-system.md — Realistic water, Gerstner waves, swimming, buoyancy*
