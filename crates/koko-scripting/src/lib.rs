//! KOKO Scripting — Lua scripting engine (native only, stub on WASM)

#[cfg(not(target_arch = "wasm32"))]
mod native {
    use mlua::prelude::*;
    use std::path::Path;

    pub struct ScriptEngine {
        lua: Lua,
    }

    impl ScriptEngine {
        pub fn new() -> LuaResult<Self> {
            let lua = Lua::new();
            {
                let globals = lua.globals();
                let log_fn = lua.create_function(|_, msg: String| {
                    tracing::info!("[Lua] {}", msg);
                    Ok(())
                })?;
                globals.set("log", log_fn)?;
                let print_fn = lua.create_function(|_, msg: String| {
                    println!("[KOKO] {}", msg);
                    Ok(())
                })?;
                globals.set("print", print_fn)?;
            }
            Ok(Self { lua })
        }

        pub fn run_file(&self, path: &Path) -> LuaResult<()> {
            let code = std::fs::read_to_string(path)
                .map_err(|e| mlua::Error::external(e))?;
            self.lua.load(&code).exec()
        }

        pub fn run(&self, code: &str) -> LuaResult<()> {
            self.lua.load(code).exec()
        }

        pub fn call_function(&self, name: &str) -> LuaResult<()> {
            let globals = self.lua.globals();
            let func: LuaFunction = globals.get(name)?;
            func.call(())
        }

        pub fn set_global(&self, name: &str, value: f64) -> LuaResult<()> {
            self.lua.globals().set(name, value)
        }

        pub fn lua(&self) -> &Lua {
            &self.lua
        }
    }

    impl Default for ScriptEngine {
        fn default() -> Self { Self::new().expect("Failed to create Lua VM") }
    }
}

#[cfg(not(target_arch = "wasm32"))]
pub use native::ScriptEngine;

#[cfg(target_arch = "wasm32")]
pub struct ScriptEngine;

#[cfg(target_arch = "wasm32")]
impl ScriptEngine {
    pub fn new() -> Result<Self, String> { Ok(Self) }
    pub fn run(&self, _code: &str) -> Result<(), String> { Ok(()) }
    pub fn run_file(&self, _path: &std::path::Path) -> Result<(), String> { Ok(()) }
    pub fn call_function(&self, _name: &str) -> Result<(), String> { Ok(()) }
    pub fn set_global(&self, _name: &str, _value: f64) -> Result<(), String> { Ok(()) }
}

#[cfg(target_arch = "wasm32")]
impl Default for ScriptEngine {
    fn default() -> Self { Self }
}
