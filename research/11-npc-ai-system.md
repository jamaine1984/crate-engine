# 11 — NPC AI System: Behavior Trees, Patrol, Combat AI, Dialogue

> NPCs that feel alive, not like mannequins

---

## Why This Matters

A world without good AI feels dead. NPCs need to:
- Patrol areas naturally
- React to the player (spot them, chase, fight, flee)
- Have conversations
- Navigate around obstacles
- Work in groups (flanking, support)

---

## Behavior Trees (Industry Standard)

Every AAA game uses behavior trees for AI. They replaced finite state machines because they're modular and scalable.

### Structure
```
Root (Selector)
├── Combat (Sequence)
│   ├── [Condition] Can see enemy?
│   ├── [Condition] In attack range?
│   └── [Action] Attack
├── Chase (Sequence)
│   ├── [Condition] Can see enemy?
│   ├── [Condition] NOT in attack range?
│   └── [Action] Move to enemy
├── Investigate (Sequence)
│   ├── [Condition] Heard noise?
│   └── [Action] Move to noise location
└── Patrol (Sequence)
    ├── [Action] Move to next waypoint
    └── [Action] Wait 3 seconds
```

### Node Types
- **Selector** (OR): Try children left→right, succeed on first success
- **Sequence** (AND): Try children left→right, fail on first failure
- **Condition**: Check something (returns success/fail)
- **Action**: Do something (returns running/success/fail)
- **Decorator**: Modify child (invert, repeat, cooldown)

### Implementation

```javascript
// Node status
const BT = { SUCCESS: 'success', FAILURE: 'failure', RUNNING: 'running' };

class BTNode {
    tick(npc, dt) { return BT.FAILURE; }
}

class Selector extends BTNode {
    constructor(children) { super(); this.children = children; }
    tick(npc, dt) {
        for (const child of this.children) {
            const result = child.tick(npc, dt);
            if (result !== BT.FAILURE) return result;
        }
        return BT.FAILURE;
    }
}

class Sequence extends BTNode {
    constructor(children) { super(); this.children = children; }
    tick(npc, dt) {
        for (const child of this.children) {
            const result = child.tick(npc, dt);
            if (result !== BT.SUCCESS) return result;
        }
        return BT.SUCCESS;
    }
}

// Conditions
class CanSeePlayer extends BTNode {
    tick(npc) {
        const toPlayer = new THREE.Vector3().subVectors(player.position, npc.position);
        const dist = toPlayer.length();
        
        if (dist > npc.sightRange) return BT.FAILURE;
        
        // Check angle (field of view)
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(npc.quaternion);
        const angle = forward.angleTo(toPlayer.normalize());
        if (angle > npc.fovAngle / 2) return BT.FAILURE;
        
        // Raycast for line of sight (no walls between)
        const ray = new THREE.Raycaster(npc.position.clone().add(UP), toPlayer.normalize(), 0, dist);
        const hits = ray.intersectObject(worldCollider, true);
        if (hits.length > 0 && hits[0].distance < dist - 0.5) return BT.FAILURE;
        
        npc.lastKnownPlayerPos = player.position.clone();
        return BT.SUCCESS;
    }
}

class InAttackRange extends BTNode {
    tick(npc) {
        const dist = npc.position.distanceTo(player.position);
        return dist < npc.attackRange ? BT.SUCCESS : BT.FAILURE;
    }
}

// Actions
class MoveToTarget extends BTNode {
    tick(npc, dt) {
        const target = npc.moveTarget || npc.lastKnownPlayerPos;
        if (!target) return BT.FAILURE;
        
        const dir = new THREE.Vector3().subVectors(target, npc.position);
        dir.y = 0;
        const dist = dir.length();
        
        if (dist < 0.5) return BT.SUCCESS;
        
        dir.normalize();
        npc.position.add(dir.multiplyScalar(npc.moveSpeed * dt));
        npc.lookAt(target.x, npc.position.y, target.z);
        
        return BT.RUNNING;
    }
}

class AttackPlayer extends BTNode {
    constructor() { super(); this.cooldown = 0; }
    tick(npc, dt) {
        this.cooldown -= dt;
        if (this.cooldown > 0) return BT.RUNNING;
        
        // Face player
        npc.lookAt(player.position.x, npc.position.y, player.position.z);
        
        // Attack
        npc.playAnimation('attack');
        dealDamage(player, npc.attackDamage);
        this.cooldown = npc.attackCooldown;
        
        return BT.SUCCESS;
    }
}

class Patrol extends BTNode {
    tick(npc, dt) {
        if (!npc.patrolPoints || npc.patrolPoints.length === 0) return BT.FAILURE;
        
        const target = npc.patrolPoints[npc.patrolIndex];
        const dir = new THREE.Vector3().subVectors(target, npc.position);
        dir.y = 0;
        
        if (dir.length() < 0.5) {
            // Reached waypoint
            npc.patrolIndex = (npc.patrolIndex + 1) % npc.patrolPoints.length;
            return BT.SUCCESS;
        }
        
        dir.normalize();
        npc.position.add(dir.multiplyScalar(npc.walkSpeed * dt));
        npc.lookAt(target.x, npc.position.y, target.z);
        
        return BT.RUNNING;
    }
}

// Build a complete AI
function createEnemyAI(npc) {
    return new Selector([
        // Combat priority
        new Sequence([
            new CanSeePlayer(),
            new Selector([
                new Sequence([
                    new InAttackRange(),
                    new AttackPlayer(),
                ]),
                new MoveToTarget(), // chase
            ]),
        ]),
        // Patrol when no enemy
        new Patrol(),
    ]);
}

// In game loop:
function updateNPCs(dt) {
    for (const npc of npcs) {
        npc.ai.tick(npc, dt);
    }
}
```

---

## Perception System

### Sight + Sound + Memory

```javascript
class NPCPerception {
    constructor(npc) {
        this.npc = npc;
        this.sightRange = 20;
        this.hearingRange = 15;
        this.fov = Math.PI * 0.6; // 108 degrees
        this.alertLevel = 0; // 0=unaware, 0.5=suspicious, 1=alert
        this.alertDecay = 0.1; // per second
        this.lastKnownPos = null;
        this.lastSeenTime = 0;
        this.memoryDuration = 10; // forget after 10s
    }
    
    update(player, dt) {
        const canSee = this.checkSight(player);
        const canHear = this.checkHearing(player);
        
        if (canSee) {
            this.alertLevel = 1;
            this.lastKnownPos = player.position.clone();
            this.lastSeenTime = performance.now() / 1000;
        } else if (canHear) {
            this.alertLevel = Math.min(1, this.alertLevel + 0.3 * dt);
            this.lastKnownPos = player.position.clone(); // approximate
        } else {
            this.alertLevel = Math.max(0, this.alertLevel - this.alertDecay * dt);
        }
        
        // Forget after memory duration
        const now = performance.now() / 1000;
        if (now - this.lastSeenTime > this.memoryDuration) {
            this.lastKnownPos = null;
        }
    }
    
    checkHearing(player) {
        const dist = this.npc.position.distanceTo(player.position);
        // Player makes more noise when sprinting/shooting
        const noiseRadius = player.isSprinting ? 20 : player.isShooting ? 30 : 8;
        return dist < noiseRadius;
    }
}
```

### Alert States (Stealth Games)
```
Unaware (0.0 - 0.3):  Normal patrol, idle animations
Suspicious (0.3 - 0.7): Slow down, look around, "?" indicator
Alert (0.7 - 1.0):      Full combat, chase, call allies
```

---

## Group AI / Squad Tactics

```javascript
class SquadAI {
    constructor(members) {
        this.members = members;
        this.leader = members[0];
        this.state = 'patrol'; // patrol, engage, search
    }
    
    update(player, dt) {
        // Any member spots player → whole squad engages
        const anyAlert = this.members.some(m => m.perception.alertLevel > 0.7);
        
        if (anyAlert) {
            this.state = 'engage';
            this.assignRoles(player);
        }
        
        if (this.state === 'engage') {
            this.updateCombatPositions(player, dt);
        }
    }
    
    assignRoles(player) {
        // Closest → attacker (melee)
        // 2nd closest → flanker (go around)
        // Farthest → ranged/support
        const sorted = [...this.members].sort((a, b) => 
            a.position.distanceTo(player.position) - b.position.distanceTo(player.position)
        );
        
        sorted[0].role = 'attacker';
        if (sorted[1]) sorted[1].role = 'flanker';
        if (sorted[2]) sorted[2].role = 'ranged';
    }
    
    updateCombatPositions(player, dt) {
        for (const member of this.members) {
            if (member.role === 'flanker') {
                // Move to player's side/back
                const side = new THREE.Vector3(-1, 0, 0)
                    .applyQuaternion(player.quaternion)
                    .multiplyScalar(5);
                member.moveTarget = player.position.clone().add(side);
            } else if (member.role === 'ranged') {
                // Keep distance
                const away = new THREE.Vector3()
                    .subVectors(member.position, player.position)
                    .normalize().multiplyScalar(12);
                member.moveTarget = player.position.clone().add(away);
            }
            // attacker just charges directly
        }
    }
}
```

---

## Dialogue System

```javascript
class DialogueSystem {
    constructor() {
        this.active = false;
        this.currentNode = null;
        this.dialogueUI = null;
    }
    
    start(dialogueTree, npc) {
        this.active = true;
        this.tree = dialogueTree;
        this.npc = npc;
        this.currentNode = dialogueTree.start;
        this.showNode(this.currentNode);
        
        // Pause game / disable player controls
        gameState.paused = true;
    }
    
    showNode(nodeId) {
        const node = this.tree.nodes[nodeId];
        if (!node) { this.end(); return; }
        
        this.dialogueUI.showText(node.speaker, node.text);
        
        if (node.choices) {
            this.dialogueUI.showChoices(node.choices.map(c => ({
                text: c.text,
                onClick: () => {
                    if (c.action) c.action(); // trigger quest, give item, etc.
                    this.showNode(c.next);
                }
            })));
        } else if (node.next) {
            // Auto-advance on click
            this.dialogueUI.onContinue = () => this.showNode(node.next);
        } else {
            this.dialogueUI.onContinue = () => this.end();
        }
    }
    
    end() {
        this.active = false;
        this.dialogueUI.hide();
        gameState.paused = false;
    }
}

// Example dialogue tree
const blacksmithDialogue = {
    start: 'greeting',
    nodes: {
        greeting: {
            speaker: 'Blacksmith',
            text: "Ah, another warrior. What brings you to my forge?",
            choices: [
                { text: "I need a weapon.", next: 'weapons' },
                { text: "Can you repair my gear?", next: 'repair' },
                { text: "Nevermind.", next: null },
            ]
        },
        weapons: {
            speaker: 'Blacksmith',
            text: "Take a look at what I've got.",
            action: () => openShop('blacksmith_weapons'),
        },
        repair: {
            speaker: 'Blacksmith',
            text: "Let me see... That'll cost 50 gold.",
            choices: [
                { text: "Do it.", next: 'repaired', action: () => spendGold(50) },
                { text: "Too rich for my blood.", next: 'greeting' },
            ]
        },
    }
};
```

---

## NPC Spawning & Management

```javascript
class NPCManager {
    constructor(scene) {
        this.npcs = [];
        this.maxActive = 50; // performance limit
        this.spawnRadius = 80; // spawn around player
        this.despawnRadius = 120; // remove when far
    }
    
    update(playerPos, dt) {
        // Despawn far NPCs
        for (let i = this.npcs.length - 1; i >= 0; i--) {
            if (this.npcs[i].position.distanceTo(playerPos) > this.despawnRadius) {
                this.npcs[i].mesh.removeFromParent();
                this.npcs.splice(i, 1);
            }
        }
        
        // Update active NPCs
        for (const npc of this.npcs) {
            npc.perception.update(player, dt);
            npc.ai.tick(npc, dt);
            npc.animController.evaluateState(npc);
            npc.animController.update(dt);
        }
    }
}
```

---

## Implementation Plan

1. **Phase 1:** Basic patrol + chase AI (behavior tree)
2. **Phase 2:** Perception system (sight/sound/memory)
3. **Phase 3:** Combat AI (attack, dodge, block)
4. **Phase 4:** Dialogue system
5. **Phase 5:** Group tactics

---

*Next: 12-save-load-system.md*
