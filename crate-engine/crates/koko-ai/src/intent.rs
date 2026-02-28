//! Parse AI JSON response into GameIntents

use crate::GameIntent;

/// Parse the AI response JSON into game intents
pub fn parse_ai_response(json_str: &str) -> Vec<GameIntent> {
    // Try to extract JSON from the response (might be wrapped in markdown code blocks)
    let cleaned = extract_json(json_str);

    let parsed: Result<Vec<serde_json::Value>, _> = serde_json::from_str(&cleaned);
    match parsed {
        Ok(actions) => actions.iter().filter_map(parse_action).collect(),
        Err(_) => {
            // If it's not valid JSON, treat it as a chat response
            vec![GameIntent::ChatResponse { message: json_str.to_string() }]
        }
    }
}

fn extract_json(s: &str) -> String {
    // Remove markdown code blocks if present
    let s = s.trim();
    if let Some(start) = s.find("```json") {
        let after = &s[start + 7..];
        if let Some(end) = after.find("```") {
            return after[..end].trim().to_string();
        }
    }
    if let Some(start) = s.find("```") {
        let after = &s[start + 3..];
        if let Some(end) = after.find("```") {
            return after[..end].trim().to_string();
        }
    }
    // Try to find JSON array
    if let Some(start) = s.find('[') {
        if let Some(end) = s.rfind(']') {
            return s[start..=end].to_string();
        }
    }
    s.to_string()
}

fn parse_action(val: &serde_json::Value) -> Option<GameIntent> {
    let action_type = val["type"].as_str()?;
    match action_type {
        "add_entity" => Some(GameIntent::AddEntity {
            name: val["name"].as_str().unwrap_or("unnamed").to_string(),
            mesh: val["mesh"].as_str().unwrap_or("cube").to_string(),
            position: parse_vec3(val.get("position")),
            color: parse_color(val.get("color")),
            scale: val["scale"].as_f64().unwrap_or(1.0) as f32,
        }),
        "remove_entity" => Some(GameIntent::RemoveEntity {
            name: val["name"].as_str().unwrap_or("").to_string(),
        }),
        "modify_entity" => Some(GameIntent::ModifyEntity {
            name: val["name"].as_str().unwrap_or("").to_string(),
            changes: val.to_string(),
        }),
        "set_camera" => Some(GameIntent::SetCamera {
            position: parse_vec3(val.get("position")),
            look_at: parse_vec3(val.get("look_at")),
        }),
        "chat" => Some(GameIntent::ChatResponse {
            message: val["message"].as_str().unwrap_or("").to_string(),
        }),
        _ => None,
    }
}

fn parse_vec3(val: Option<&serde_json::Value>) -> [f32; 3] {
    val.and_then(|v| v.as_array()).map(|a| {
        [a.first().and_then(|x| x.as_f64()).unwrap_or(0.0) as f32,
         a.get(1).and_then(|x| x.as_f64()).unwrap_or(0.0) as f32,
         a.get(2).and_then(|x| x.as_f64()).unwrap_or(0.0) as f32]
    }).unwrap_or([0.0; 3])
}

fn parse_color(val: Option<&serde_json::Value>) -> [f32; 4] {
    val.and_then(|v| v.as_array()).map(|a| {
        [a.first().and_then(|x| x.as_f64()).unwrap_or(1.0) as f32,
         a.get(1).and_then(|x| x.as_f64()).unwrap_or(1.0) as f32,
         a.get(2).and_then(|x| x.as_f64()).unwrap_or(1.0) as f32,
         a.get(3).and_then(|x| x.as_f64()).unwrap_or(1.0) as f32]
    }).unwrap_or([1.0; 4])
}
