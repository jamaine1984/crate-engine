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

#[cfg(test)]
#[cfg(not(target_arch = "wasm32"))]
mod tests {
    use super::*;

    #[test]
    fn create_engine() {
        let engine = ScriptEngine::new().expect("Failed to create Lua VM");
        // Just verify it creates without error
        let _ = engine;
    }

    #[test]
    fn run_simple_code() {
        let engine = ScriptEngine::new().unwrap();
        engine.run("local x = 1 + 1").unwrap();
    }

    #[test]
    fn set_and_read_global() {
        let engine = ScriptEngine::new().unwrap();
        engine.set_global("my_val", 42.0).unwrap();
        engine.run("assert(my_val == 42)").unwrap();
    }

    #[test]
    fn call_defined_function() {
        let engine = ScriptEngine::new().unwrap();
        engine.run("function greet() return 'hello' end").unwrap();
        engine.call_function("greet").unwrap();
    }

    #[test]
    fn error_on_invalid_code() {
        let engine = ScriptEngine::new().unwrap();
        assert!(engine.run("this is not valid lua !!!").is_err());
    }
}
