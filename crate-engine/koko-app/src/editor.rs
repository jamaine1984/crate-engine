#![allow(unused_variables, unused_imports, dead_code, deprecated)]
//! KOKO Editor UI — full-featured egui editor

use egui;

pub struct EditorState {
    pub prompt_input: String,
    pub chat_history: Vec<ChatMessage>,
    pub show_scene_panel: bool,
    pub show_properties: bool,
    pub show_console: bool,
    pub show_assets: bool,
    pub selected_entity: Option<String>,
    pub ai_processing: bool,
    pub ai_status: String,
    pub scene_objects: Vec<SceneObjectInfo>,
    // API config
    pub api_provider: String,
    pub api_key: String,
    pub api_model: String,
    pub show_settings: bool,
    // Stats
    pub fps: f32,
    pub entity_count: usize,
    pub draw_calls: usize,
    // Scene actions (consumed by main loop)
    pub action_delete: Option<String>,
    pub action_duplicate: Option<String>,
    pub action_modify: Option<(String, SceneObjectInfo)>,
    pub action_save: bool,
    pub action_load: bool,
    pub action_undo: bool,
    pub action_redo: bool,
    pub action_clear: bool,
    pub action_focus: Option<String>,  // focus camera on object
    // Gizmo
    pub gizmo_mode: GizmoMode,
    pub show_grid: bool,
    pub camera_mode: CameraMode,
    // Timeline
    pub show_timeline: bool,
    pub timeline_tracks: Vec<TimelineTrackInfo>,
    pub timeline_playhead: f32,
    pub timeline_duration: f32,
    pub timeline_playing: bool,
    // Asset browser
    pub show_asset_browser: bool,
    pub asset_list: Vec<AssetInfo>,
    // Visual scripting
    pub show_node_graph: bool,
    pub script_nodes: Vec<ScriptNode>,
    pub script_connections: Vec<(usize, usize)>,  // (from_node, to_node)
    pub action_spawn_asset: Option<String>,  // asset name to spawn
    // AI Copilot
    pub show_ai_copilot: bool,
    pub ai_suggestions: Vec<AiSuggestion>,
    pub ai_copilot_thinking: bool,
    pub ai_copilot_message: String,
    pub ai_copilot_history: Vec<CopilotMessage>,
    pub copilot_auto_suggest: bool,
    pub action_execute_suggestion: Option<String>,  // command to execute from suggestion
    pub prompt_completions: Vec<String>,
    pub show_completions: bool,
}

#[derive(Clone, Copy, PartialEq)]
pub enum GizmoMode { Translate, Rotate, Scale }

#[derive(Clone, Copy, PartialEq)]
pub enum CameraMode { Fly, Orbit }

#[derive(Clone)]
pub struct AiSuggestion {
    pub icon: String,
    pub title: String,
    pub description: String,
    pub command: String,  // auto-execute this if clicked
    pub priority: u8,     // 0=low, 1=med, 2=high
    pub category: SuggestionCategory,
}

#[derive(Clone, Copy, PartialEq)]
pub enum SuggestionCategory {
    Build, Optimize, Style, Gameplay, Fix, Idea,
}

impl SuggestionCategory {
    pub fn color(&self) -> egui::Color32 {
        match self {
            Self::Build => egui::Color32::from_rgb(76, 175, 80),
            Self::Optimize => egui::Color32::from_rgb(255, 152, 0),
            Self::Style => egui::Color32::from_rgb(156, 39, 176),
            Self::Gameplay => egui::Color32::from_rgb(33, 150, 243),
            Self::Fix => egui::Color32::from_rgb(244, 67, 54),
            Self::Idea => egui::Color32::from_rgb(255, 235, 59),
        }
    }
    pub fn label(&self) -> &str {
        match self { Self::Build => "BUILD", Self::Optimize => "PERF", Self::Style => "STYLE", Self::Gameplay => "GAME", Self::Fix => "FIX", Self::Idea => "IDEA" }
    }
}

#[derive(Clone)]
pub struct CopilotMessage {
    pub role: CopilotRole,
    pub text: String,
}

#[derive(Clone, Copy, PartialEq)]
pub enum CopilotRole { User, Assistant, System }

#[derive(Clone)]
pub struct TimelineTrackInfo {
    pub name: String,
    pub keyframe_times: Vec<f32>,
}

#[derive(Clone)]
pub struct AssetInfo {
    pub name: String,
    pub kind: AssetKind,
    pub path: String,
}

#[derive(Clone, Copy, PartialEq)]
pub enum AssetKind { Model, Texture, Sound, Scene, Prefab }

impl AssetKind {
    pub fn icon(&self) -> &str {
        match self { Self::Model => "🧊", Self::Texture => "🖼", Self::Sound => "🔊", Self::Scene => "🌍", Self::Prefab => "📦" }
    }
}

#[derive(Clone)]
pub struct ScriptNode {
    pub id: usize,
    pub kind: NodeKind,
    pub pos: [f32; 2],
    pub label: String,
}

#[derive(Clone, PartialEq)]
pub enum NodeKind {
    Event(String),      // "on_start", "on_key", "on_collision", "on_timer"
    Action(String),     // "move", "rotate", "spawn", "destroy", "play_sound"
    Condition(String),  // "if_key", "if_distance", "if_timer"
    Variable(String),   // "set_var", "get_var"
}

impl NodeKind {
    pub fn color(&self) -> egui::Color32 {
        match self {
            Self::Event(_) => egui::Color32::from_rgb(76, 175, 80),
            Self::Action(_) => egui::Color32::from_rgb(33, 150, 243),
            Self::Condition(_) => egui::Color32::from_rgb(255, 193, 7),
            Self::Variable(_) => egui::Color32::from_rgb(156, 39, 176),
        }
    }
}

pub struct ChatMessage {
    pub sender: ChatSender,
    pub text: String,
}

pub enum ChatSender { User, Ai, System }

#[derive(Clone)]
pub struct SceneObjectInfo {
    pub name: String,
    pub mesh_type: String,
    pub position: [f32; 3],
    pub color: [f32; 4],
    pub scale: f32,
}

impl EditorState {
    pub fn new() -> Self {
        Self {
            prompt_input: String::new(),
            chat_history: vec![ChatMessage {
                sender: ChatSender::System,
                text: "⚡ KOKO Engine ready! Type a prompt or use the toolbar.".into(),
            }],
            show_scene_panel: true,
            show_properties: true,
            show_console: true,
            show_assets: false,
            selected_entity: None,
            ai_processing: false,
            ai_status: "Ready".into(),
            scene_objects: Vec::new(),
            api_provider: "local".into(),
            api_key: String::new(),
            api_model: "local-parser".into(),
            show_settings: false,
            fps: 0.0,
            entity_count: 0,
            draw_calls: 0,
            action_delete: None,
            action_duplicate: None,
            action_modify: None,
            action_save: false,
            action_load: false,
            action_undo: false,
            action_redo: false,
            action_clear: false,
            action_focus: None,
            gizmo_mode: GizmoMode::Translate,
            show_grid: true,
            camera_mode: CameraMode::Fly,
            show_timeline: false,
            timeline_tracks: Vec::new(),
            timeline_playhead: 0.0,
            timeline_duration: 10.0,
            timeline_playing: false,
            show_asset_browser: false,
            show_ai_copilot: true,  // on by default!
            ai_suggestions: Vec::new(),
            ai_copilot_thinking: false,
            ai_copilot_message: String::new(),
            ai_copilot_history: vec![CopilotMessage {
                role: CopilotRole::Assistant,
                text: "Hey! I'm your KOKO AI copilot. I'll watch what you build and suggest improvements. Try adding some objects and I'll start helping! 🚀".into(),
            }],
            copilot_auto_suggest: true,
            action_execute_suggestion: None,
            prompt_completions: Vec::new(),
            show_completions: false,
            asset_list: Vec::new(),
            show_node_graph: false,
            script_nodes: Vec::new(),
            script_connections: Vec::new(),
            action_spawn_asset: None,
        }
    }

    pub fn draw(&mut self, ctx: &egui::Context) -> Option<String> {
        let mut submitted_prompt = None;

        // Keyboard shortcuts (only when no text field focused)
        if !ctx.wants_keyboard_input() {
            ctx.input(|i| {
                if i.key_pressed(egui::Key::Delete) || i.key_pressed(egui::Key::Backspace) {
                    if let Some(name) = &self.selected_entity {
                        self.action_delete = Some(name.clone());
                    }
                }
                if i.modifiers.command && i.key_pressed(egui::Key::Z) {
                    if i.modifiers.shift {
                        self.action_redo = true;
                    } else {
                        self.action_undo = true;
                    }
                }
                if i.modifiers.command && i.key_pressed(egui::Key::D) {
                    if let Some(name) = &self.selected_entity {
                        self.action_duplicate = Some(name.clone());
                    }
                }
                if i.modifiers.command && i.key_pressed(egui::Key::S) {
                    self.action_save = true;
                }
                // Gizmo mode shortcuts
                if i.key_pressed(egui::Key::W) { self.gizmo_mode = GizmoMode::Translate; }
                if i.key_pressed(egui::Key::E) { self.gizmo_mode = GizmoMode::Rotate; }
                if i.key_pressed(egui::Key::R) { self.gizmo_mode = GizmoMode::Scale; }
                if i.key_pressed(egui::Key::F) {
                    if let Some(name) = &self.selected_entity {
                        self.action_focus = Some(name.clone());
                    }
                }
                if i.key_pressed(egui::Key::G) { self.show_grid = !self.show_grid; }
            });
        }

        // === TOP MENU BAR ===
        egui::TopBottomPanel::top("menu_bar").show(ctx, |ui| {
            egui::menu::bar(ui, |ui| {
                ui.label(egui::RichText::new("⚡ KOKO").strong().color(egui::Color32::from_rgb(168, 85, 247)));
                ui.separator();
            if ui.selectable_label(self.show_timeline, "🎬 Timeline").clicked() { self.show_timeline = !self.show_timeline; }
            if ui.selectable_label(self.show_asset_browser, "📂 Assets").clicked() { self.show_asset_browser = !self.show_asset_browser; }
            if ui.selectable_label(self.show_node_graph, "🔗 Nodes").clicked() { self.show_node_graph = !self.show_node_graph; }
            if ui.selectable_label(self.show_ai_copilot, "🧠 AI Copilot").clicked() { self.show_ai_copilot = !self.show_ai_copilot; }


                // File menu
                ui.menu_button("File", |ui| {
                    if ui.button("💾 Save Scene (⌘S)").clicked() { self.action_save = true; ui.close_menu(); }
                    if ui.button("📂 Load Scene").clicked() { self.action_load = true; ui.close_menu(); }
                    ui.separator();
                    if ui.button("🗑️ Clear Scene").clicked() { self.action_clear = true; ui.close_menu(); }
                });

                // Edit menu
                ui.menu_button("Edit", |ui| {
                    if ui.button("↩️ Undo (⌘Z)").clicked() { self.action_undo = true; ui.close_menu(); }
                    if ui.button("↪️ Redo (⌘⇧Z)").clicked() { self.action_redo = true; ui.close_menu(); }
                    ui.separator();
                    let has_sel = self.selected_entity.is_some();
                    if ui.add_enabled(has_sel, egui::Button::new("📋 Duplicate (⌘D)")).clicked() {
                        if let Some(name) = &self.selected_entity { self.action_duplicate = Some(name.clone()); }
                        ui.close_menu();
                    }
                    if ui.add_enabled(has_sel, egui::Button::new("🗑️ Delete (Del)")).clicked() {
                        if let Some(name) = &self.selected_entity { self.action_delete = Some(name.clone()); }
                        ui.close_menu();
                    }
                });

                // View menu
                ui.menu_button("View", |ui| {
                    ui.checkbox(&mut self.show_scene_panel, "📋 Scene Panel");
                    ui.checkbox(&mut self.show_properties, "🔧 Properties");
                    ui.checkbox(&mut self.show_console, "💬 Prompt Console");
                    ui.checkbox(&mut self.show_assets, "📦 Assets");
                    ui.checkbox(&mut self.show_grid, "🔲 Grid (G)");
                });

                ui.separator();

                // Toolbar: gizmo mode
                let tm = self.gizmo_mode == GizmoMode::Translate;
                let rm = self.gizmo_mode == GizmoMode::Rotate;
                let sm = self.gizmo_mode == GizmoMode::Scale;
                if ui.selectable_label(tm, "↕️ Move (W)").clicked() { self.gizmo_mode = GizmoMode::Translate; }
                if ui.selectable_label(rm, "🔄 Rotate (E)").clicked() { self.gizmo_mode = GizmoMode::Rotate; }
                if ui.selectable_label(sm, "📐 Scale (R)").clicked() { self.gizmo_mode = GizmoMode::Scale; }

                ui.separator();

                // Camera mode
                let fly = self.camera_mode == CameraMode::Fly;
                if ui.selectable_label(fly, "🎮 Fly").clicked() { self.camera_mode = CameraMode::Fly; }
                if ui.selectable_label(!fly, "🔄 Orbit").clicked() { self.camera_mode = CameraMode::Orbit; }

                // Right-aligned stats
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    ui.label(egui::RichText::new(format!("FPS: {:.0}", self.fps)).color(
                        if self.fps > 55.0 { egui::Color32::from_rgb(16, 185, 129) }
                        else if self.fps > 30.0 { egui::Color32::from_rgb(245, 158, 11) }
                        else { egui::Color32::from_rgb(239, 68, 68) }
                    ));
                    ui.separator();
                    ui.label(format!("Objects: {}", self.entity_count));
                    ui.separator();
                    let status_color = if self.ai_processing {
                        egui::Color32::from_rgb(245, 158, 11)
                    } else { egui::Color32::from_rgb(16, 185, 129) };
                    ui.label(egui::RichText::new(format!("AI: {}", self.ai_status)).color(status_color));
                });
            });
        });

        // === SCENE HIERARCHY (left) ===
        if self.show_scene_panel {
            egui::SidePanel::left("scene_panel").default_width(200.0).show(ctx, |ui| {
                ui.horizontal(|ui| {
                    ui.heading("Scene");
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        if ui.small_button("🗑️").on_hover_text("Clear All").clicked() {
                            self.action_clear = true;
                        }
                    });
                });
                ui.separator();

                // Search/filter
                // (future: add search box here)

                egui::ScrollArea::vertical().show(ui, |ui| {
                    let mut clicked_name = None;
                    for obj in &self.scene_objects {
                        let selected = self.selected_entity.as_ref() == Some(&obj.name);
                        let icon = match obj.mesh_type.as_str() {
                            "cube" => "🟦", "sphere" => "🔵", "plane" => "⬜",
                            "cylinder" => "🔷", "cone" => "🔺", "torus" => "⭕",
                            "model" => "📦", _ => "📦",
                        };
                        let label = ui.selectable_label(selected, format!("{} {}", icon, obj.name));
                        if label.clicked() {
                            clicked_name = Some(obj.name.clone());
                        }
                        // Right-click context menu
                        label.context_menu(|ui| {
                            if ui.button("📋 Duplicate").clicked() {
                                self.action_duplicate = Some(obj.name.clone());
                                ui.close_menu();
                            }
                            if ui.button("🎯 Focus Camera (F)").clicked() {
                                self.action_focus = Some(obj.name.clone());
                                ui.close_menu();
                            }
                            if ui.button("🗑️ Delete").clicked() {
                                self.action_delete = Some(obj.name.clone());
                                ui.close_menu();
                            }
                        });
                    }
                    if let Some(name) = clicked_name {
                        self.selected_entity = Some(name);
                    }
                });

                ui.separator();
                ui.label(egui::RichText::new(format!("{} objects", self.scene_objects.len())).small().weak());
            });
        }

        // === PROPERTIES PANEL (right) ===
        if self.show_properties {
            egui::SidePanel::right("properties_panel").default_width(260.0).show(ctx, |ui| {
                ui.heading("Properties");
                ui.separator();

                if let Some(sel_name) = self.selected_entity.clone() {
                    if let Some(obj) = self.scene_objects.iter().find(|o| o.name == sel_name).cloned() {
                        let mut modified = obj.clone();
                        let mut changed = false;

                        ui.label(egui::RichText::new(&obj.name).strong().size(16.0));
                        ui.label(egui::RichText::new(format!("Type: {}", obj.mesh_type)).weak());
                        ui.separator();

                        // Position
                        ui.label(egui::RichText::new("Position").strong());
                        ui.horizontal(|ui| {
                            ui.label("X:");
                            if ui.add(egui::DragValue::new(&mut modified.position[0]).speed(0.1).range(-100.0..=100.0)).changed() { changed = true; }
                        });
                        ui.horizontal(|ui| {
                            ui.label("Y:");
                            if ui.add(egui::DragValue::new(&mut modified.position[1]).speed(0.1).range(-100.0..=100.0)).changed() { changed = true; }
                        });
                        ui.horizontal(|ui| {
                            ui.label("Z:");
                            if ui.add(egui::DragValue::new(&mut modified.position[2]).speed(0.1).range(-100.0..=100.0)).changed() { changed = true; }
                        });

                        ui.separator();

                        // Scale
                        ui.label(egui::RichText::new("Scale").strong());
                        ui.horizontal(|ui| {
                            if ui.add(egui::DragValue::new(&mut modified.scale).speed(0.05).range(0.01..=100.0)).changed() { changed = true; }
                            if ui.small_button("1x").clicked() { modified.scale = 1.0; changed = true; }
                            if ui.small_button("2x").clicked() { modified.scale = 2.0; changed = true; }
                            if ui.small_button("0.5x").clicked() { modified.scale = 0.5; changed = true; }
                        });

                        ui.separator();

                        // Color
                        ui.label(egui::RichText::new("Color").strong());
                        let mut color_arr = [modified.color[0], modified.color[1], modified.color[2]];
                        if ui.color_edit_button_rgb(&mut color_arr).changed() {
                            modified.color = [color_arr[0], color_arr[1], color_arr[2], modified.color[3]];
                            changed = true;
                        }

                        ui.separator();

                        // Action buttons
                        ui.horizontal(|ui| {
                            if ui.button("📋 Duplicate").clicked() {
                                self.action_duplicate = Some(sel_name.clone());
                            }
                            if ui.button("🎯 Focus").clicked() {
                                self.action_focus = Some(sel_name.clone());
                            }
                            if ui.button("🗑️ Delete").clicked() {
                                self.action_delete = Some(sel_name.clone());
                            }
                        });

                        // Quick position buttons
                        ui.separator();
                        ui.label(egui::RichText::new("Quick Place").small().weak());
                        ui.horizontal(|ui| {
                            if ui.small_button("Center").clicked() { modified.position = [0.0, 0.0, 0.0]; changed = true; }
                            if ui.small_button("Ground").clicked() { modified.position[1] = 0.0; changed = true; }
                            if ui.small_button("Up +2").clicked() { modified.position[1] += 2.0; changed = true; }
                        });

                        if changed {
                            self.action_modify = Some((sel_name, modified));
                        }
                    }
                } else {
                    ui.vertical_centered(|ui| {
                        ui.add_space(20.0);
                        ui.label(egui::RichText::new("No object selected").weak().size(14.0));
                        ui.add_space(10.0);
                        ui.label("Click an object in the Scene panel");
                        ui.label("or type a prompt below.");
                        ui.add_space(20.0);
                        ui.label(egui::RichText::new("Shortcuts").strong());
                        ui.label("W — Move tool");
                        ui.label("E — Rotate tool");
                        ui.label("R — Scale tool");
                        ui.label("F — Focus on selected");
                        ui.label("G — Toggle grid");
                        ui.label("Del — Delete selected");
                        ui.label("⌘D — Duplicate");
                        ui.label("⌘Z — Undo");
                        ui.label("⌘⇧Z — Redo");
                        ui.label("⌘S — Save scene");
                    });
                }
            });
        }

        // === SETTINGS WINDOW ===
        if self.show_settings {
            egui::Window::new("⚙️ AI Settings").collapsible(true).resizable(true).show(ctx, |ui| {
                ui.label(egui::RichText::new("AI Provider").strong());
                egui::ComboBox::from_id_salt("provider").selected_text(&self.api_provider).show_ui(ui, |ui| {
                    ui.selectable_value(&mut self.api_provider, "local".into(), "Local (No API key)");
                    ui.selectable_value(&mut self.api_provider, "claude".into(), "Claude (Anthropic)");
                    ui.selectable_value(&mut self.api_provider, "gemini".into(), "Gemini (Google)");
                    ui.selectable_value(&mut self.api_provider, "openai".into(), "GPT (OpenAI)");
                    ui.selectable_value(&mut self.api_provider, "ollama".into(), "Ollama (Local LLM)");
                });
                ui.separator();
                if self.api_provider != "ollama" && self.api_provider != "local" {
                    ui.label("API Key:");
                    ui.add(egui::TextEdit::singleline(&mut self.api_key).password(true).hint_text("sk-..."));
                }
                ui.label("Model:");
                ui.text_edit_singleline(&mut self.api_model);
                ui.separator();
                if ui.button("Save").clicked() {
                    self.show_settings = false;
                    self.chat_history.push(ChatMessage {
                        sender: ChatSender::System,
                        text: format!("✅ AI: {} / {}", self.api_provider, self.api_model),
                    });
                }
            });
        }

        // === PROMPT CONSOLE (bottom) ===
        if self.show_console {
            egui::TopBottomPanel::bottom("prompt_panel").default_height(180.0).resizable(true).show(ctx, |ui| {
                ui.horizontal(|ui| {
                    ui.heading("💬 Prompt Console");
                    if self.ai_processing {
                        ui.spinner();
                        ui.label(egui::RichText::new("Processing...").color(egui::Color32::from_rgb(245, 158, 11)));
                    }
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        if ui.small_button("🗑️ Clear Chat").clicked() {
                            self.chat_history.clear();
                            self.chat_history.push(ChatMessage {
                                sender: ChatSender::System,
                                text: "Chat cleared. Type a prompt to continue.".into(),
                            });
                        }
                    });
                });
                ui.separator();

                // Chat history
                egui::ScrollArea::vertical().max_height(100.0).stick_to_bottom(true).show(ui, |ui| {
                    for msg in &self.chat_history {
                        match msg.sender {
                            ChatSender::User => {
                                ui.horizontal(|ui| {
                                    ui.label(egui::RichText::new("You:").strong().color(egui::Color32::from_rgb(59, 130, 246)));
                                    ui.label(&msg.text);
                                });
                            }
                            ChatSender::Ai => {
                                ui.horizontal_wrapped(|ui| {
                                    ui.label(egui::RichText::new("⚡ KOKO:").strong().color(egui::Color32::from_rgb(168, 85, 247)));
                                    ui.label(&msg.text);
                                });
                            }
                            ChatSender::System => {
                                ui.label(egui::RichText::new(&msg.text).weak().italics());
                            }
                        }
                    }
                });
                ui.separator();

                // Input
                ui.horizontal(|ui| {
                    ui.label("⚡");
                    let response = ui.add_sized(
                        [ui.available_width() - 70.0, 30.0],
                        egui::TextEdit::singleline(&mut self.prompt_input)
                            .hint_text("Describe what you want to build...")
                            .font(egui::TextStyle::Body),
                    );
                    let enter = response.lost_focus() && ui.input(|i| i.key_pressed(egui::Key::Enter));
                    let btn = ui.button("Send").clicked();
                    if (enter || btn) && !self.prompt_input.trim().is_empty() && !self.ai_processing {
                        let prompt = self.prompt_input.trim().to_string();
                        self.chat_history.push(ChatMessage { sender: ChatSender::User, text: prompt.clone() });
                        self.prompt_input.clear();
                        submitted_prompt = Some(prompt);
                        response.request_focus();
                    }
                });
            });
        }


        // Timeline panel
        if self.show_timeline {
            egui::TopBottomPanel::bottom("timeline_editor").resizable(true).min_height(100.0).default_height(140.0).show(ctx, |ui| {
                ui.horizontal(|ui| {
                    ui.heading("🎬 Timeline");
                    if ui.button(if self.timeline_playing { "⏸" } else { "▶" }).clicked() {
                        self.timeline_playing = !self.timeline_playing;
                    }
                    if ui.button("⏮").clicked() { self.timeline_playhead = 0.0; }
                    ui.add(egui::Slider::new(&mut self.timeline_playhead, 0.0..=self.timeline_duration).text("t"));
                    ui.label(format!("{:.1}s / {:.1}s", self.timeline_playhead, self.timeline_duration));
                    ui.add(egui::DragValue::new(&mut self.timeline_duration).range(1.0..=300.0).prefix("dur: ").suffix("s").speed(0.5));
                });
                ui.separator();
                egui::ScrollArea::vertical().max_height(80.0).show(ui, |ui| {
                    if self.timeline_tracks.is_empty() {
                        ui.label("No tracks. Select an object and type 'keyframe' to add one.");
                    }
                    for track in &self.timeline_tracks {
                        ui.horizontal(|ui| {
                            ui.label(egui::RichText::new(&track.name).strong());
                            // Draw keyframe diamonds
                            let (rect, _) = ui.allocate_exact_size(egui::vec2(ui.available_width(), 16.0), egui::Sense::hover());
                            let painter = ui.painter_at(rect);
                            painter.rect_filled(rect, 2.0, egui::Color32::from_gray(40));
                            for &t in &track.keyframe_times {
                                let frac = t / self.timeline_duration;
                                let x = rect.left() + frac * rect.width();
                                let center = egui::pos2(x, rect.center().y);
                                let color = if (t - self.timeline_playhead).abs() < 0.15 {
                                    egui::Color32::YELLOW
                                } else {
                                    egui::Color32::from_rgb(100, 150, 255)
                                };
                                painter.circle_filled(center, 4.0, color);
                            }
                            // Playhead
                            let ph_x = rect.left() + (self.timeline_playhead / self.timeline_duration) * rect.width();
                            painter.line_segment(
                                [egui::pos2(ph_x, rect.top()), egui::pos2(ph_x, rect.bottom())],
                                egui::Stroke::new(2.0, egui::Color32::RED),
                            );
                        });
                    }
                });
            });
        }

        // Asset browser
        if self.show_asset_browser {
            egui::Window::new("📂 Asset Browser").default_width(300.0).default_height(400.0).resizable(true).collapsible(true).show(ctx, |ui| {
                ui.horizontal(|ui| {
                    for kind in &[AssetKind::Model, AssetKind::Texture, AssetKind::Sound, AssetKind::Scene, AssetKind::Prefab] {
                        let count = self.asset_list.iter().filter(|a| a.kind == *kind).count();
                        ui.label(format!("{} {}", kind.icon(), count));
                    }
                });
                ui.separator();
                egui::ScrollArea::vertical().show(ui, |ui| {
                    let mut spawn_name = None;
                    for asset in &self.asset_list {
                        ui.horizontal(|ui| {
                            ui.label(asset.kind.icon());
                            ui.label(&asset.name);
                            if matches!(asset.kind, AssetKind::Model | AssetKind::Prefab) {
                                if ui.small_button("➕ Spawn").clicked() {
                                    spawn_name = Some(asset.name.clone());
                                }
                            }
                        });
                    }
                    if self.asset_list.is_empty() {
                        ui.label("No assets found. Place models in assets/ folder.");
                    }
                    if let Some(name) = spawn_name {
                        self.action_spawn_asset = Some(name);
                    }
                });
            });
        }

        // Visual scripting node graph
        if self.show_node_graph {
            egui::Window::new("🔗 Visual Script").default_width(500.0).default_height(400.0).resizable(true).show(ctx, |ui| {
                ui.horizontal(|ui| {
                    if ui.button("+ Event").clicked() {
                        let id = self.script_nodes.len();
                        self.script_nodes.push(ScriptNode { id, kind: NodeKind::Event("on_start".into()), pos: [50.0, 50.0 + id as f32 * 80.0], label: "On Start".into() });
                    }
                    if ui.button("+ Action").clicked() {
                        let id = self.script_nodes.len();
                        self.script_nodes.push(ScriptNode { id, kind: NodeKind::Action("move".into()), pos: [250.0, 50.0 + id as f32 * 80.0], label: "Move".into() });
                    }
                    if ui.button("+ Condition").clicked() {
                        let id = self.script_nodes.len();
                        self.script_nodes.push(ScriptNode { id, kind: NodeKind::Condition("if_key".into()), pos: [150.0, 50.0 + id as f32 * 80.0], label: "If Key".into() });
                    }
                    if ui.button("🗑 Clear All").clicked() {
                        self.script_nodes.clear();
                        self.script_connections.clear();
                    }
                });
                ui.separator();

                // Draw node canvas
                let (response, painter) = ui.allocate_painter(ui.available_size(), egui::Sense::click_and_drag());
                let origin = response.rect.min;
                painter.rect_filled(response.rect, 0.0, egui::Color32::from_gray(25));

                // Draw grid
                let grid_spacing = 30.0;
                let grid_color = egui::Color32::from_gray(35);
                let mut x = origin.x;
                while x < response.rect.right() {
                    painter.line_segment([egui::pos2(x, origin.y), egui::pos2(x, response.rect.bottom())], egui::Stroke::new(0.5, grid_color));
                    x += grid_spacing;
                }
                let mut y = origin.y;
                while y < response.rect.bottom() {
                    painter.line_segment([egui::pos2(origin.x, y), egui::pos2(response.rect.right(), y)], egui::Stroke::new(0.5, grid_color));
                    y += grid_spacing;
                }

                // Draw connections
                for (from, to) in &self.script_connections {
                    if let (Some(n1), Some(n2)) = (self.script_nodes.get(*from), self.script_nodes.get(*to)) {
                        let p1 = egui::pos2(origin.x + n1.pos[0] + 100.0, origin.y + n1.pos[1] + 20.0);
                        let p2 = egui::pos2(origin.x + n2.pos[0], origin.y + n2.pos[1] + 20.0);
                        let mid_x = (p1.x + p2.x) / 2.0;
                        let ctrl1 = egui::pos2(mid_x, p1.y);
                        let ctrl2 = egui::pos2(mid_x, p2.y);
                        // Bezier curve
                        let steps = 20;
                        let mut points = Vec::new();
                        for i in 0..=steps {
                            let t = i as f32 / steps as f32;
                            let it = 1.0 - t;
                            let px = it*it*it*p1.x + 3.0*it*it*t*ctrl1.x + 3.0*it*t*t*ctrl2.x + t*t*t*p2.x;
                            let py = it*it*it*p1.y + 3.0*it*it*t*ctrl1.y + 3.0*it*t*t*ctrl2.y + t*t*t*p2.y;
                            points.push(egui::pos2(px, py));
                        }
                        for w in points.windows(2) {
                            painter.line_segment([w[0], w[1]], egui::Stroke::new(2.0, egui::Color32::from_rgb(200, 200, 200)));
                        }
                    }
                }

                // Draw nodes
                for node in &self.script_nodes {
                    let npos = egui::pos2(origin.x + node.pos[0], origin.y + node.pos[1]);
                    let nrect = egui::Rect::from_min_size(npos, egui::vec2(120.0, 40.0));
                    painter.rect_filled(nrect, 6.0, node.kind.color());
                    painter.rect_stroke(nrect, 6.0, egui::Stroke::new(1.0, egui::Color32::WHITE), egui::StrokeKind::Outside);
                    painter.text(nrect.center(), egui::Align2::CENTER_CENTER, &node.label, egui::FontId::proportional(13.0), egui::Color32::WHITE);
                    // Connection ports
                    painter.circle_filled(egui::pos2(nrect.left(), nrect.center().y), 5.0, egui::Color32::WHITE);
                    painter.circle_filled(egui::pos2(nrect.right(), nrect.center().y), 5.0, egui::Color32::WHITE);
                }

                if self.script_nodes.is_empty() {
                    painter.text(
                        response.rect.center(), egui::Align2::CENTER_CENTER,
                        "Add nodes above to start visual scripting", egui::FontId::proportional(14.0), egui::Color32::GRAY,
                    );
                }
            });
        }


        // AI Copilot Panel
        if self.show_ai_copilot {
            egui::Window::new("🧠 KOKO AI Copilot")
                .default_width(320.0).default_height(500.0)
                .default_pos(egui::pos2(10.0, 60.0))
                .resizable(true).collapsible(true)
                .show(ctx, |ui| {
                    // Header with status
                    ui.horizontal(|ui| {
                        if self.ai_copilot_thinking {
                            ui.spinner();
                            ui.label(egui::RichText::new("Thinking...").color(egui::Color32::from_rgb(245, 158, 11)));
                        } else {
                            ui.label(egui::RichText::new("⚡ Ready").color(egui::Color32::from_rgb(34, 197, 94)));
                        }
                        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                            if ui.small_button(if self.copilot_auto_suggest { "🔔 Auto" } else { "🔕 Manual" }).clicked() {
                                self.copilot_auto_suggest = !self.copilot_auto_suggest;
                            }
                        });
                    });
                    ui.separator();

                    // Suggestions panel
                    if !self.ai_suggestions.is_empty() {
                        ui.label(egui::RichText::new("💡 Suggestions").strong());
                        egui::ScrollArea::vertical().id_salt("suggestions_scroll").max_height(150.0).show(ui, |ui| {
                            let mut exec_cmd = None;
                            for suggestion in &self.ai_suggestions {
                                ui.horizontal(|ui| {
                                    // Category badge
                                    let badge = egui::RichText::new(suggestion.category.label())
                                        .small()
                                        .color(egui::Color32::BLACK)
                                        .background_color(suggestion.category.color());
                                    ui.label(badge);
                                    ui.vertical(|ui| {
                                        ui.horizontal(|ui| {
                                            ui.label(&suggestion.icon);
                                            ui.label(egui::RichText::new(&suggestion.title).strong());
                                        });
                                        ui.label(egui::RichText::new(&suggestion.description).weak().small());
                                        if !suggestion.command.is_empty() {
                                            if ui.small_button(format!("⚡ {}", suggestion.command)).clicked() {
                                                exec_cmd = Some(suggestion.command.clone());
                                            }
                                        }
                                    });
                                });
                                ui.add_space(4.0);
                            }
                            if let Some(cmd) = exec_cmd {
                                self.action_execute_suggestion = Some(cmd);
                            }
                        });
                        ui.separator();
                    }

                    // Chat history
                    ui.label(egui::RichText::new("💬 Chat").strong());
                    egui::ScrollArea::vertical().id_salt("copilot_chat").max_height(200.0).stick_to_bottom(true).show(ui, |ui| {
                        for msg in &self.ai_copilot_history {
                            match msg.role {
                                CopilotRole::User => {
                                    ui.horizontal_wrapped(|ui| {
                                        ui.label(egui::RichText::new("You:").strong().color(egui::Color32::from_rgb(59, 130, 246)));
                                        ui.label(&msg.text);
                                    });
                                }
                                CopilotRole::Assistant => {
                                    ui.horizontal_wrapped(|ui| {
                                        ui.label(egui::RichText::new("🧠 KOKO:").strong().color(egui::Color32::from_rgb(168, 85, 247)));
                                        ui.label(&msg.text);
                                    });
                                }
                                CopilotRole::System => {
                                    ui.label(egui::RichText::new(&msg.text).weak().italics());
                                }
                            }
                        }
                    });
                    ui.separator();

                    // Copilot input
                    ui.horizontal(|ui| {
                        ui.label("🧠");
                        let response = ui.add_sized(
                            [ui.available_width() - 50.0, 28.0],
                            egui::TextEdit::singleline(&mut self.ai_copilot_message)
                                .hint_text("Ask the AI copilot anything...")
                                .font(egui::TextStyle::Body),
                        );
                        if (response.lost_focus() && ui.input(|i| i.key_pressed(egui::Key::Enter))) || ui.button("Ask").clicked() {
                            if !self.ai_copilot_message.trim().is_empty() {
                                let msg = self.ai_copilot_message.trim().to_string();
                                self.ai_copilot_history.push(CopilotMessage { role: CopilotRole::User, text: msg.clone() });
                                self.ai_copilot_message.clear();
                                // The main loop will handle generating a response
                            }
                        }
                    });

                    // Quick actions
                    ui.separator();
                    ui.label(egui::RichText::new("⚡ Quick Actions").strong());
                    ui.horizontal_wrapped(|ui| {
                        if ui.small_button("📊 Analyze Scene").clicked() {
                            self.ai_copilot_history.push(CopilotMessage { role: CopilotRole::User, text: "Analyze my scene".into() });
                        }
                        if ui.small_button("🎨 Style Tips").clicked() {
                            self.ai_copilot_history.push(CopilotMessage { role: CopilotRole::User, text: "Give me style tips".into() });
                        }
                        if ui.small_button("⚡ Optimize").clicked() {
                            self.ai_copilot_history.push(CopilotMessage { role: CopilotRole::User, text: "How can I optimize?".into() });
                        }
                        if ui.small_button("🎮 What's Next?").clicked() {
                            self.ai_copilot_history.push(CopilotMessage { role: CopilotRole::User, text: "What should I add next?".into() });
                        }
                        if ui.small_button("💡 Surprise Me").clicked() {
                            self.ai_copilot_history.push(CopilotMessage { role: CopilotRole::User, text: "Surprise me with something cool".into() });
                        }
                    });
                });
        }

        // Prompt auto-complete popup
        if self.show_completions && !self.prompt_completions.is_empty() {
            egui::Window::new("completions")
                .title_bar(false)
                .fixed_pos(egui::pos2(100.0, 600.0))
                .default_width(300.0)
                .show(ctx, |ui| {
                    for comp in &self.prompt_completions {
                        if ui.selectable_label(false, comp).clicked() {
                            self.prompt_input = comp.clone();
                            self.show_completions = false;
                        }
                    }
                });
        }

        submitted_prompt
    }

    pub fn add_ai_response(&mut self, text: &str) {
        self.chat_history.push(ChatMessage { sender: ChatSender::Ai, text: text.to_string() });
        self.ai_processing = false;
        self.ai_status = "Ready".into();
    }

    pub fn add_system_message(&mut self, text: &str) {
        self.chat_history.push(ChatMessage { sender: ChatSender::System, text: text.to_string() });
    }
}
