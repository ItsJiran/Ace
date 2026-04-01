    use tauri::Manager;

    // Helper untuk macOS agar tidak memicu "Exclusive Fullscreen"
    #[cfg(target_os = "macos")]
    pub fn setup_mac_overlay(window: &tauri::WebviewWindow) {
        use cocoa::appkit::{NSWindow, NSWindowCollectionBehavior};
        use cocoa::base::id;
        use objc::{msg_send, sel, sel_impl};

        unsafe {
            let ns_window = window.ns_window().unwrap() as id;

            // 1. Biarkan window muncul di semua Spaces dan jangan sembunyikan Dock
            let mut collection_behavior =
                NSWindowCollectionBehavior::NSWindowCollectionBehaviorCanJoinAllSpaces;
            collection_behavior |=
                NSWindowCollectionBehavior::NSWindowCollectionBehaviorFullScreenAuxiliary;
            let _: () = msg_send![ns_window, setCollectionBehavior: collection_behavior];

            // 2. Set level ke Status Window (di atas aplikasi normal, di bawah/sejajar Dock)
            let _: () = msg_send![ns_window, setLevel: 25]; // NSStatusWindowLevel
        }
    }

    #[tauri::command]
    fn set_ignore_cursor_events(window: tauri::Window, ignore: bool) -> Result<(), String> {
        window
            .set_ignore_cursor_events(ignore)
            .map_err(|e| e.to_string())
    }

    /// Returns physical process memory (RSS) and virtual memory in bytes.
    /// On Linux reads /proc/self/status. On other platforms returns 0.
    #[tauri::command]
    fn get_process_memory() -> (u64, u64) {
        #[cfg(target_os = "linux")]
        {
            let Ok(status) = std::fs::read_to_string("/proc/self/status") else {
                return (0, 0);
            };
            let mut rss_kb: u64 = 0;
            let mut vm_size_kb: u64 = 0;
            for line in status.lines() {
                if line.starts_with("VmRSS:") {
                    rss_kb = line.split_whitespace().nth(1).and_then(|v| v.parse().ok()).unwrap_or(0);
                } else if line.starts_with("VmSize:") {
                    vm_size_kb = line.split_whitespace().nth(1).and_then(|v| v.parse().ok()).unwrap_or(0);
                }
            }
            return (rss_kb * 1024, vm_size_kb * 1024);
        }
        #[cfg(not(target_os = "linux"))]
        (0, 0)
    }

    #[tauri::command]
    fn open_devtools(window: tauri::WebviewWindow) {
        if cfg!(debug_assertions) {
            window.open_devtools();
        }
    }

    #[tauri::command]
    fn log_to_file(app: tauri::AppHandle, line: String) -> Result<(), String> {
        use std::fs::{create_dir_all, OpenOptions};
        use std::io::Write;

        let log_dir = app
            .path()
            .app_log_dir()
            .map_err(|e| format!("log_to_file: failed to resolve app log dir: {}", e))?;

        create_dir_all(&log_dir)
            .map_err(|e| format!("log_to_file: failed to create log dir '{}': {}", log_dir.display(), e))?;

        let log_path = log_dir.join("debug.log");
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_path)
            .map_err(|e| format!("log_to_file: failed to open '{}': {}", log_path.display(), e))?;

        writeln!(file, "{}", line)
            .map_err(|e| format!("log_to_file: failed to write '{}': {}", log_path.display(), e))?;

        Ok(())
    }

    /// Execute a shell command and return stdout / stderr / exit_code.
    /// `command` is the program name (e.g. "git", "ls", "sudo").
    /// `args` are the arguments passed to the program.
    /// `cwd` optionally sets the working directory.
    #[tauri::command]
    fn execute_shell(
        command: String,
        args: Vec<String>,
        cwd: Option<String>,
    ) -> Result<serde_json::Value, String> {
        let mut cmd = std::process::Command::new(&command);
        cmd.args(&args);

        if let Some(dir) = &cwd {
            cmd.current_dir(dir);
        }

        match cmd.output() {
            Ok(output) => Ok(serde_json::json!({
                "stdout": String::from_utf8_lossy(&output.stdout),
                "stderr": String::from_utf8_lossy(&output.stderr),
                "exit_code": output.status.code().unwrap_or(-1),
                "success": output.status.success()
            })),
            Err(e) => Err(format!("execute_shell: failed to spawn '{}': {}", command, e)),
        }
    }

    #[cfg_attr(mobile, tauri::mobile_entry_point)]
    pub fn run() {
        tauri::Builder::default()
            .plugin(tauri_plugin_sql::Builder::new().build())
            .plugin(tauri_plugin_fs::init())
            .plugin(tauri_plugin_global_shortcut::Builder::new().build())


            .invoke_handler(tauri::generate_handler![
                set_ignore_cursor_events,
                get_process_memory,
                open_devtools,
                log_to_file,
                execute_shell
            ])
            .setup(|app| {
                let window = app.get_webview_window("main").unwrap();

                // 🚀 EKSEKUSI FIX DOCK (macOS Only)
                #[cfg(target_os = "macos")]
                setup_mac_overlay(&window);

                // Open devtools automatically in debug builds
                if cfg!(debug_assertions) {
                    window.open_devtools();
                }
                Ok(())
            })
            .run(tauri::generate_context!())
            .expect("error while running tauri application");
    }
