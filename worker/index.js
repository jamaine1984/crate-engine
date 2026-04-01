// Cloudflare Worker — Claude AI Proxy for Crate Engine
// Keeps API key server-side, exposes a simple POST endpoint

const SYSTEM_PROMPT = `You are the AI brain of Crate Engine, a browser-based 3D game engine.
Convert ANY user input into engine commands. Return ONLY a JSON object with this structure:
{"commands": ["cmd1", "cmd2"], "message": "brief friendly response"}

AVAILABLE COMMANDS:
- play as [character] — characters: knight, adventurer, swat, king, punk, soldier, casual, farmer, suit, worker, witch, medieval, scifi, formal, beach, spacesuit
- equip [weapon] — weapons: sword, axe, rifle, pistol, shotgun, bow, spear, hammer, dagger, katana, shield, staff
- spawn [N] enemies / spawn [N] npcs
- add [object] — 2000+ models: cottage, castle, tree, rock, car, boat, tower, bridge, fence, torch, table, chair, chest, barrel, etc
- build a [world] — worlds: medieval village, tropical paradise, haunted graveyard, space station, pirate island, dungeon, zombie wasteland, frozen tundra, cyberpunk city, war zone, dark forest, dragon lair, ocean voyage
- terrain [type] — flat, hills, mountains, desert, island, canyon, volcano, dunes, beach
- water [preset] — calm, tropical, stormy, arctic, blood, lava, crystal
- time [period] — dawn, sunrise, noon, sunset, dusk, night, midnight
- make it rain / make it snow / fog heavy / clear weather
- clear — clear scene
- save / load / heal / stats
- show [category] — opens gallery: weapons, buildings, characters, trees, animals, vehicles, rocks, furniture

RULES:
1. ALWAYS return valid JSON: {"commands": [...], "message": "..."}
2. Break complex requests into multiple commands
3. For "add a player" → "play as knight"
4. For weapons that shoot → "equip rifle"
5. If user asks to see/browse something → "show [category]"
6. If totally unclear → {"commands": [], "message": "I can help you build worlds, add objects, equip weapons, spawn NPCs, and more. What would you like?"}`;

export default {
  async fetch(request, env) {
    // CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      });
    }

    if (request.method !== 'POST') {
      return new Response('POST only', { status: 405 });
    }

    try {
      const { input, apiKey: userKey } = await request.json();
      if (!input || typeof input !== 'string') {
        return new Response(JSON.stringify({ commands: [], message: 'No input provided' }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      // Call Claude via OpenRouter
      // Use user's key if provided, otherwise use default
      const apiKey = userKey || env.OPENROUTER_API_KEY;
      if (!apiKey) {
        return new Response(JSON.stringify({ commands: [input], message: 'Running command...' }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey,
        },
        body: JSON.stringify({
          model: 'google/gemini-2.0-flash-exp:free',
          max_tokens: 300,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: input }
          ]
        })
      });

      if (!response.ok) {
        const err = await response.text();
        console.error('Claude API error:', err);
        return new Response(JSON.stringify({ commands: [input], message: 'Running...' }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || data.content?.[0]?.text || '{}';
      
      // Parse the JSON response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return new Response(JSON.stringify(parsed), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      return new Response(JSON.stringify({ commands: [input], message: 'Running...' }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    } catch (err) {
      return new Response(JSON.stringify({ commands: [], message: 'Error: ' + err.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
  }
};
