# 17 — Weather System: Rain, Snow, Wind, Storms

---

## Rain

```javascript
class RainSystem {
    constructor(scene, count = 5000) {
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const velocities = new Float32Array(count * 3);
        
        for (let i = 0; i < count; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 80;
            positions[i * 3 + 1] = Math.random() * 40;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 80;
            velocities[i * 3] = 0;
            velocities[i * 3 + 1] = -15 - Math.random() * 10; // fall speed
            velocities[i * 3 + 2] = 0;
        }
        
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        // Rain as lines (stretched points)
        const mat = new THREE.PointsMaterial({
            color: 0xaaaacc,
            size: 0.1,
            transparent: true,
            opacity: 0.6,
        });
        
        this.mesh = new THREE.Points(geo, mat);
        this.velocities = velocities;
        this.count = count;
        this.active = false;
        scene.add(this.mesh);
    }
    
    update(dt, playerPos, wind = { x: 0, z: 0 }) {
        if (!this.active) { this.mesh.visible = false; return; }
        this.mesh.visible = true;
        
        const positions = this.mesh.geometry.attributes.position.array;
        
        for (let i = 0; i < this.count; i++) {
            const idx = i * 3;
            positions[idx] += (this.velocities[idx] + wind.x) * dt;
            positions[idx + 1] += this.velocities[idx + 1] * dt;
            positions[idx + 2] += (this.velocities[idx + 2] + wind.z) * dt;
            
            // Respawn at top when below ground
            if (positions[idx + 1] < -1) {
                positions[idx] = playerPos.x + (Math.random() - 0.5) * 80;
                positions[idx + 1] = 30 + Math.random() * 10;
                positions[idx + 2] = playerPos.z + (Math.random() - 0.5) * 80;
            }
        }
        
        this.mesh.geometry.attributes.position.needsUpdate = true;
        // Center rain around player
        this.mesh.position.set(0, 0, 0);
    }
}
```

## Snow

```javascript
class SnowSystem {
    constructor(scene, count = 3000) {
        // Similar to rain but:
        // - Slower fall speed (2-4 instead of 15-25)
        // - Horizontal drift (sine wave)
        // - Larger particle size
        // - White color
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        this.driftPhase = new Float32Array(count); // unique per flake
        
        for (let i = 0; i < count; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 60;
            positions[i * 3 + 1] = Math.random() * 30;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 60;
            this.driftPhase[i] = Math.random() * Math.PI * 2;
        }
        
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        // Snowflake texture
        const mat = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.15,
            transparent: true,
            opacity: 0.8,
            // map: snowflakeTexture, // optional texture
        });
        
        this.mesh = new THREE.Points(geo, mat);
        this.count = count;
        this.time = 0;
        scene.add(this.mesh);
    }
    
    update(dt, playerPos) {
        this.time += dt;
        const positions = this.mesh.geometry.attributes.position.array;
        
        for (let i = 0; i < this.count; i++) {
            const idx = i * 3;
            // Gentle drift
            positions[idx] += Math.sin(this.time + this.driftPhase[i]) * 0.5 * dt;
            positions[idx + 1] -= (2 + Math.random()) * dt; // slow fall
            positions[idx + 2] += Math.cos(this.time * 0.7 + this.driftPhase[i]) * 0.3 * dt;
            
            if (positions[idx + 1] < -1) {
                positions[idx] = playerPos.x + (Math.random() - 0.5) * 60;
                positions[idx + 1] = 25 + Math.random() * 5;
                positions[idx + 2] = playerPos.z + (Math.random() - 0.5) * 60;
            }
        }
        
        this.mesh.geometry.attributes.position.needsUpdate = true;
    }
}
```

## Weather Controller

```javascript
class WeatherSystem {
    constructor(scene) {
        this.rain = new RainSystem(scene);
        this.snow = new SnowSystem(scene);
        this.current = 'clear';
        this.wind = { x: 0, z: 0 };
        this.transitionTimer = 0;
    }
    
    setWeather(type) {
        this.current = type;
        this.rain.active = (type === 'rain' || type === 'storm');
        this.snow.mesh.visible = (type === 'snow');
        
        // Adjust lighting
        switch (type) {
            case 'clear':
                scene.fog.density = 0.002;
                sun.intensity = 1.2;
                break;
            case 'cloudy':
                scene.fog.density = 0.005;
                sun.intensity = 0.5;
                break;
            case 'rain':
                scene.fog.density = 0.01;
                scene.fog.color.setHex(0x666677);
                sun.intensity = 0.3;
                this.wind = { x: 2, z: 1 };
                break;
            case 'storm':
                scene.fog.density = 0.015;
                scene.fog.color.setHex(0x444455);
                sun.intensity = 0.1;
                this.wind = { x: 5, z: 3 };
                // Lightning flashes
                break;
            case 'snow':
                scene.fog.density = 0.008;
                scene.fog.color.setHex(0xccccdd);
                sun.intensity = 0.6;
                break;
        }
    }
    
    update(dt, playerPos) {
        this.rain.update(dt, playerPos, this.wind);
        this.snow.update(dt, playerPos);
        
        // Lightning during storms
        if (this.current === 'storm' && Math.random() < 0.002) {
            this.flashLightning();
        }
    }
    
    flashLightning() {
        const flash = new THREE.AmbientLight(0xffffff, 3);
        scene.add(flash);
        setTimeout(() => { flash.intensity = 0; }, 50);
        setTimeout(() => { flash.intensity = 2; }, 100);
        setTimeout(() => { scene.remove(flash); }, 200);
        // Thunder sound delayed by "distance"
        setTimeout(() => soundManager.play('thunder'), 500 + Math.random() * 2000);
    }
}

// NL commands
// "set weather rain" → weather.setWeather('rain')
// "make it snow" → weather.setWeather('snow')
// "clear skies" → weather.setWeather('clear')
```

---

*Next: 18-quest-system.md*
