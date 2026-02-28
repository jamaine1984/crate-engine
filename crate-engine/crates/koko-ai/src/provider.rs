//! AI provider implementations — Claude, Gemini, OpenAI, Ollama
//! Native only (requires reqwest + tokio)

#[cfg(not(target_arch = "wasm32"))]
mod inner {
//! AI provider implementations — Claude, Gemini, OpenAI, Ollama

#[cfg(not(target_arch = "wasm32"))]

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiResponse {
    pub content: String,
    pub model: String,
    pub usage: Option<AiUsage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiUsage {
    pub input_tokens: u32,
    pub output_tokens: u32,
}

/// Call Claude API (Anthropic)
pub async fn call_claude(
    api_key: &str,
    model: &str,
    system_prompt: &str,
    messages: &[AiMessage],
    max_tokens: u32,
) -> Result<AiResponse, Box<dyn std::error::Error + Send + Sync>> {
    let client = reqwest::Client::new();

    let api_messages: Vec<serde_json::Value> = messages.iter().map(|m| {
        serde_json::json!({ "role": m.role, "content": m.content })
    }).collect();

    let body = serde_json::json!({
        "model": model,
        "max_tokens": max_tokens,
        "system": system_prompt,
        "messages": api_messages,
    });

    let resp = client.post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await?;

    let status = resp.status();
    let text = resp.text().await?;

    if !status.is_success() {
        return Err(format!("Claude API error {}: {}", status, text).into());
    }

    let json: serde_json::Value = serde_json::from_str(&text)?;
    let content = json["content"][0]["text"].as_str().unwrap_or("").to_string();
    let model_used = json["model"].as_str().unwrap_or(model).to_string();
    let usage = if let (Some(i), Some(o)) = (json["usage"]["input_tokens"].as_u64(), json["usage"]["output_tokens"].as_u64()) {
        Some(AiUsage { input_tokens: i as u32, output_tokens: o as u32 })
    } else { None };

    Ok(AiResponse { content, model: model_used, usage })
}

/// Call Ollama (local)
pub async fn call_ollama(
    endpoint: &str,
    model: &str,
    prompt: &str,
) -> Result<AiResponse, Box<dyn std::error::Error + Send + Sync>> {
    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "model": model,
        "prompt": prompt,
        "stream": false,
    });

    let resp = client.post(format!("{}/api/generate", endpoint))
        .json(&body)
        .send()
        .await?;

    let json: serde_json::Value = resp.json().await?;
    let content = json["response"].as_str().unwrap_or("").to_string();

    Ok(AiResponse { content, model: model.to_string(), usage: None })
}

/// Call OpenAI-compatible API (GPT, Gemini via OpenAI compat, etc.)
pub async fn call_openai_compat(
    endpoint: &str,
    api_key: &str,
    model: &str,
    system_prompt: &str,
    messages: &[AiMessage],
    max_tokens: u32,
) -> Result<AiResponse, Box<dyn std::error::Error + Send + Sync>> {
    let client = reqwest::Client::new();

    let mut api_messages = vec![serde_json::json!({"role": "system", "content": system_prompt})];
    for m in messages {
        api_messages.push(serde_json::json!({"role": m.role, "content": m.content}));
    }

    let body = serde_json::json!({
        "model": model,
        "max_tokens": max_tokens,
        "messages": api_messages,
    });

    let resp = client.post(endpoint)
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&body)
        .send()
        .await?;

    let json: serde_json::Value = resp.json().await?;
    let content = json["choices"][0]["message"]["content"].as_str().unwrap_or("").to_string();

    Ok(AiResponse { content, model: model.to_string(), usage: None })
}

}

#[cfg(not(target_arch = "wasm32"))]
pub use inner::*;

#[cfg(target_arch = "wasm32")]
#[derive(Debug, Clone)]
pub struct AiMessage {
    pub role: String,
    pub content: String,
}

#[cfg(target_arch = "wasm32")]
#[derive(Debug, Clone)]
pub struct AiResponse {
    pub content: String,
    pub model: String,
    pub usage: Option<()>,
}

#[cfg(target_arch = "wasm32")]
pub async fn call_claude(
    _api_key: &str,
    _model: &str,
    _system_prompt: &str,
    _messages: &[AiMessage],
    _max_tokens: u32,
) -> Result<AiResponse, Box<dyn std::error::Error + Send + Sync>> {
    Ok(AiResponse {
        content: "AI not available in browser yet".to_string(),
        model: "wasm-stub".to_string(),
        usage: None,
    })
}
