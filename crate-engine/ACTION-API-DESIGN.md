# Crate Engine — Action API Design (Phase 2)

## Philosophy
One clean API layer between user intent and engine execution.
No regex. No bypass lists. No duplicate handlers.

## Core Actions (~20 functions)

### Scene Management
- `actions.clearScene()` — reset everything
- `actions.buildWorld(templateName)` — generate a world from template
- `actions.addObject(query, position?)` — fuzzy search catalog + add to scene
- `actions.removeObject(target)` — remove selected or named object
- `actions.listObjects()` — what's in the scene

### Asset System  
- `actions.openLibrary(category?)` — open asset browser
- `actions.searchAssets(query)` — fuzzy search across all 2000 models
- `actions.loadModel(file, position?)` — load specific GLB

### Character & Player
- `actions.setCharacter(id)` — pick from CHARACTER_LIBRARY
- `actions.enterPlayMode()` — start playing
- `actions.exitPlayMode()` — back to editor
- `actions.toggleCamera()` — FPS/TPS
- `actions.equipWeapon(weaponId, slot?)` — equip from WEAPON_DATABASE
- `actions.unequipWeapon()` — remove weapon

### NPCs
- `actions.spawnNPC(type?, count?, hostile?)` — spawn NPCs properly grounded
- `actions.spawnEnemies(count?)` — hostile NPCs

### Environment
- `actions.setWater(preset)` — apply Gerstner water preset
- `actions.setTerrain(type, options?)` — terrain generation
- `actions.setWeather(type)` — rain/snow/fog/clear
- `actions.setTime(time)` — morning/noon/sunset/night
- `actions.setSky(options)` — sky color/clouds

### Buildings
- `actions.addInterior(type, options?)` — house/shop/tavern with interiors
- `actions.addBuilding(type)` — exterior-only building from catalog

### UI
- `actions.showHelp()` — commands panel
- `actions.showGenerator()` — 3D generator modal

## Fuzzy Asset Search
Instead of hardcoded GLB_MODELS dict, search asset-catalog.json:
- "house" → finds all buildings with "house" in name, picks best
- "sword" → finds weapons with "sword"  
- "oak tree" → finds trees matching "oak"
- Levenshtein distance for typo tolerance
- Category hints from context

## NPC Fix Plan
- Store groundOffset at spawn (bounding box bottom)
- Idle animation by default (not T-pose)
- Wander: pick random point, walk to it, pause, repeat
- Face movement direction (not spin)
- Legs above terrain (groundOffset + terrainY)

## Character Fix Plan  
- Always play idle animation on load
- Blend to walk/run when moving
- Weapon socket: rotate to match hand bone orientation
- Hide editor UI in play mode

## Water Fix Plan
- Single createWater() with Gerstner shader
- Auto-size to terrain (not hardcoded)
- Visible from all angles (proper depth/color)
- Preset applies immediately, not via pending flag
