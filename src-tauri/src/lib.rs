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

    #[cfg_attr(mobile, tauri::mobile_entry_point)]
    pub fn run() {
        tauri::Builder::default()
            .plugin(tauri_plugin_sql::Builder::new().build())
            .plugin(tauri_plugin_fs::init())
            .plugin(tauri_plugin_global_shortcut::Builder::new().build())


            .invoke_handler(tauri::generate_handler![set_ignore_cursor_events, get_process_memory])
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
