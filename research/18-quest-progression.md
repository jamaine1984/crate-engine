# 18 — Quest & Progression System

> Giving players goals and rewards

---

## Quest Data Structure

```javascript
const QUEST_STATES = { INACTIVE: 0, ACTIVE: 1, COMPLETE: 2, FAILED: 3 };

class Quest {
    constructor(config) {
        this.id = config.id;
        this.title = config.title;
        this.description = config.description;
        this.state = QUEST_STATES.INACTIVE;
        this.objectives = config.objectives.map(o => ({
            ...o,
            current: 0,
            complete: false,
        }));
        this.rewards = config.rewards;
        this.prerequisites = config.prerequisites || [];
    }
    
    updateObjective(type, target, amount = 1) {
        for (const obj of this.objectives) {
            if (obj.type === type && obj.target === target && !obj.complete) {
                obj.current = Math.min(obj.current + amount, obj.required);
                if (obj.current >= obj.required) {
                    obj.complete = true;
                }
            }
        }
        
        if (this.objectives.every(o => o.complete)) {
            this.state = QUEST_STATES.COMPLETE;
            this.giveRewards();
        }
    }
    
    giveRewards() {
        for (const reward of this.rewards) {
            switch (reward.type) {
                case 'xp': player.addXP(reward.amount); break;
                case 'gold': player.addGold(reward.amount); break;
                case 'item': player.inventory.add(reward.itemId); break;
                case 'unlock': gameFlags.set(reward.flag, true); break;
            }
        }
        showNotification(`Quest Complete: ${this.title}`);
    }
}

// Example quest
const sampleQuest = new Quest({
    id: 'first_hunt',
    title: 'The First Hunt',
    description: 'Prove yourself by slaying creatures in the wild.',
    objectives: [
        { type: 'kill', target: 'wolf', required: 3, label: 'Slay wolves (0/3)' },
        { type: 'collect', target: 'wolf_pelt', required: 1, label: 'Collect a wolf pelt' },
    ],
    rewards: [
        { type: 'xp', amount: 100 },
        { type: 'item', itemId: 'iron_sword' },
    ],
});
```

## Quest Manager

```javascript
class QuestManager {
    constructor() {
        this.quests = new Map();
        this.active = [];
        this.completed = [];
    }
    
    register(quest) { this.quests.set(quest.id, quest); }
    
    activate(questId) {
        const quest = this.quests.get(questId);
        if (!quest) return;
        quest.state = QUEST_STATES.ACTIVE;
        this.active.push(quest);
        showNotification(`New Quest: ${quest.title}`);
    }
    
    // Called by game events
    onEvent(type, target, amount = 1) {
        for (const quest of this.active) {
            quest.updateObjective(type, target, amount);
            if (quest.state === QUEST_STATES.COMPLETE) {
                this.active = this.active.filter(q => q !== quest);
                this.completed.push(quest);
            }
        }
    }
}

// Hook into game events:
// When enemy dies: questManager.onEvent('kill', enemy.type);
// When item picked up: questManager.onEvent('collect', item.id);
// When location reached: questManager.onEvent('reach', 'mountain_peak');
```

## XP & Leveling

```javascript
class ProgressionSystem {
    constructor() {
        this.level = 1;
        this.xp = 0;
        this.stats = { strength: 10, agility: 10, vitality: 10, mind: 10 };
        this.skillPoints = 0;
    }
    
    xpForLevel(level) { return Math.floor(100 * Math.pow(1.5, level - 1)); }
    
    addXP(amount) {
        this.xp += amount;
        while (this.xp >= this.xpForLevel(this.level)) {
            this.xp -= this.xpForLevel(this.level);
            this.level++;
            this.skillPoints += 3;
            this.onLevelUp();
        }
    }
    
    onLevelUp() {
        showNotification(`Level Up! You are now level ${this.level}`);
        // Restore health/stamina
        player.health = player.maxHealth;
        player.stamina = player.maxStamina;
        // Play level up VFX
        FX.levelUp(player.position);
    }
}
```

---

*Next: 19-networking-multiplayer.md*
