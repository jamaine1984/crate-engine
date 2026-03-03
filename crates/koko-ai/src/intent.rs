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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_add_entity() {
        let json = r#"[{"type":"add_entity","name":"tree","mesh":"tree","position":[1,2,3],"scale":2.0}]"#;
        let intents = parse_ai_response(json);
        assert_eq!(intents.len(), 1);
        match &intents[0] {
            GameIntent::AddEntity { name, mesh, position, scale, .. } => {
                assert_eq!(name, "tree");
                assert_eq!(mesh, "tree");
                assert_eq!(position, &[1.0, 2.0, 3.0]);
                assert!((scale - 2.0).abs() < 0.01);
            }
            _ => panic!("expected AddEntity"),
        }
    }

    #[test]
    fn parse_remove_entity() {
        let json = r#"[{"type":"remove_entity","name":"rock"}]"#;
        let intents = parse_ai_response(json);
        assert_eq!(intents.len(), 1);
        assert!(matches!(&intents[0], GameIntent::RemoveEntity { name } if name == "rock"));
    }

    #[test]
    fn parse_chat_response() {
        let json = r#"[{"type":"chat","message":"Hello!"}]"#;
        let intents = parse_ai_response(json);
        assert_eq!(intents.len(), 1);
        assert!(matches!(&intents[0], GameIntent::ChatResponse { message } if message == "Hello!"));
    }

    #[test]
    fn invalid_json_becomes_chat() {
        let intents = parse_ai_response("not json at all");
        assert_eq!(intents.len(), 1);
        assert!(matches!(&intents[0], GameIntent::ChatResponse { .. }));
    }

    #[test]
    fn extract_from_markdown_code_block() {
        let input = "```json\n[{\"type\":\"chat\",\"message\":\"hi\"}]\n```";
        let intents = parse_ai_response(input);
        assert_eq!(intents.len(), 1);
        assert!(matches!(&intents[0], GameIntent::ChatResponse { message } if message == "hi"));
    }

    #[test]
    fn parse_set_camera() {
        let json = r#"[{"type":"set_camera","position":[0,10,0],"look_at":[0,0,0]}]"#;
        let intents = parse_ai_response(json);
        assert_eq!(intents.len(), 1);
        match &intents[0] {
            GameIntent::SetCamera { position, look_at } => {
                assert_eq!(position, &[0.0, 10.0, 0.0]);
                assert_eq!(look_at, &[0.0, 0.0, 0.0]);
            }
            _ => panic!("expected SetCamera"),
        }
    }

    #[test]
    fn multiple_actions() {
        let json = r#"[{"type":"add_entity","name":"a","mesh":"cube"},{"type":"add_entity","name":"b","mesh":"sphere"}]"#;
        let intents = parse_ai_response(json);
        assert_eq!(intents.len(), 2);
    }

    #[test]
    fn unknown_type_filtered_out() {
        let json = r#"[{"type":"teleport","target":"moon"}]"#;
        let intents = parse_ai_response(json);
        assert_eq!(intents.len(), 0);
    }
}
