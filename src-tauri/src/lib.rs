mod pty;
mod process_cmds;
mod embedded_server;
mod watcher;
mod downloads;
mod launch;
mod path_search;
mod secrets;
mod file_association;
pub mod logger;

#[cfg(target_os = "macos")]
fn request_bluetooth_permission() {
    use objc::{class, msg_send, sel, sel_impl};
    use std::os::raw::c_void;

    unsafe {
        // Force link CoreBluetooth framework
        #[link(name = "CoreBluetooth", kind = "framework")]
        extern "C" {}

        let manager_class = class!(CBCentralManager);
        let alloc: *mut objc::runtime::Object = msg_send![manager_class, alloc];
        let nil: *mut c_void = std::ptr::null_mut();
        // Initialize to trigger the permission prompt
        let _: *mut objc::runtime::Object = msg_send![
            alloc,
            initWithDelegate: nil
            queue: nil
            options: nil
        ];
    }
}

#[cfg(not(target_os = "macos"))]
fn request_bluetooth_permission() {}

/// macOS asks "Sentinel Terminal would like to use Bluetooth" the first time CoreBluetooth is touched.
/// That used to happen at every launch, before anyone had asked for anything Bluetooth-related; now the
/// app calls this only when a Bluetooth request is made.
#[tauri::command]
fn request_bluetooth_access() {
    request_bluetooth_permission();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    logger::init();
    logger::log_info("BOOT", "Initializing Sentinel Terminal runtime");
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            use tauri::Emitter;
            logger::log_info("SINGLE_INSTANCE", &format!("Second instance launched with argv: {:?}", argv));
            let flow_files = launch::filter_flow_argv(&argv);
            if !flow_files.is_empty() {
                launch::remember_opened(app, &flow_files);
                let _ = app.emit("sentinel-url", &flow_files);
            } else {
                launch::show_main(app);
            }
        }))
        .setup(|app| {
            logger::log_info("SETUP", "Initializing core application services");
            process_cmds::ensure_private_data_dir();
            file_association::ensure_registered(app.handle());
            // A previous instance that crashed or was killed can leave its model server running
            std::thread::spawn(|| embedded_server::reap_orphaned_server(8847));
            // The window starts hidden: shown now, unless the app was opened to run a .flow file
            launch::show_unless_flow(app.handle());

            use tauri::Manager;
            // No separate title bar on any OS: macOS overlays its traffic lights on the tab bar
            // (tauri.conf.json titleBarStyle Overlay); Windows and Linux draw their own window
            // controls in the tab bar, so the native frame is removed here.
            #[cfg(not(target_os = "macos"))]
            if let Some(main_win) = app.get_webview_window("main") {
                let _ = main_win.set_decorations(false);
            }
            if let Some(main_win) = app.get_webview_window("main") {
                match main_win.url() {
                    Ok(url) => {
                        logger::log_info("WINDOW", &format!("Main webview URL: {}", url));
                        if url.as_str().contains("localhost:1420") {
                            logger::log_warn("WEBVIEW", "Running against external devUrl (http://localhost:1420). Frontend dev server required.");
                        } else if url.as_str().starts_with("tauri://") {
                            logger::log_info("WEBVIEW", "Embedded production assets active via custom-protocol (tauri://localhost)");
                        }
                    }
                    Err(e) => {
                        logger::log_error("WINDOW", &format!("Failed to determine main webview URL: {}", e));
                    }
                }
            }
            
            #[cfg(target_os = "macos")]
            {
                use tauri::menu::{Menu, Submenu, MenuItem, PredefinedMenuItem};
                use tauri::Emitter;

                let handle = app.handle();

                // 1. App Submenu
                let app_menu = Submenu::with_items(handle, "Sentinel Terminal", true, &[
                    &PredefinedMenuItem::about(handle, None, None)?,
                    &PredefinedMenuItem::separator(handle)?,
                    &PredefinedMenuItem::services(handle, None)?,
                    &PredefinedMenuItem::separator(handle)?,
                    &PredefinedMenuItem::hide(handle, None)?,
                    &PredefinedMenuItem::hide_others(handle, None)?,
                    &PredefinedMenuItem::show_all(handle, None)?,
                    &PredefinedMenuItem::separator(handle)?,
                    &PredefinedMenuItem::quit(handle, None)?,
                ])?;

                // 2. Personalization & Settings Submenu (in the native top menu bar)
                let theme_item = MenuItem::with_id(handle, "open-theme", "Appearance & Color Themes...", true, None::<&str>)?;
                let ai_item = MenuItem::with_id(handle, "open-ai-settings", "AI Engine & Model Settings...", true, None::<&str>)?;
                let personalize_menu = Submenu::with_items(handle, "Personalization", true, &[
                    &theme_item,
                    &ai_item,
                ])?;

                // 3. File Submenu
                let new_tab_item = MenuItem::with_id(handle, "new-tab", "New Terminal Tab", true, Some("CmdOrCtrl+T"))?;
                let close_tab_item = MenuItem::with_id(handle, "close-tab", "Close Tab", true, Some("CmdOrCtrl+W"))?;
                let file_menu = Submenu::with_items(handle, "File", true, &[
                    &new_tab_item,
                    &close_tab_item,
                ])?;

                // 4. Edit Submenu
                let edit_menu = Submenu::with_items(handle, "Edit", true, &[
                    &PredefinedMenuItem::undo(handle, None)?,
                    &PredefinedMenuItem::redo(handle, None)?,
                    &PredefinedMenuItem::separator(handle)?,
                    &PredefinedMenuItem::cut(handle, None)?,
                    &PredefinedMenuItem::copy(handle, None)?,
                    &PredefinedMenuItem::paste(handle, None)?,
                    &PredefinedMenuItem::select_all(handle, None)?,
                ])?;

                // 5. View / Window
                let window_menu = Submenu::with_items(handle, "Window", true, &[
                    &PredefinedMenuItem::minimize(handle, None)?,
                    &PredefinedMenuItem::fullscreen(handle, None)?,
                    &PredefinedMenuItem::separator(handle)?,
                    &PredefinedMenuItem::close_window(handle, None)?,
                ])?;

                let menu = Menu::with_items(handle, &[
                    &app_menu,
                    &personalize_menu,
                    &file_menu,
                    &edit_menu,
                    &window_menu,
                ])?;

                app.set_menu(menu)?;

                app.on_menu_event(|app_handle, event| {
                    match event.id().as_ref() {
                        "open-theme" => {
                            let _ = app_handle.emit("menu-event", "open-theme");
                        },
                        "open-ai-settings" => {
                            let _ = app_handle.emit("menu-event", "open-ai-settings");
                        },
                        "new-tab" => {
                            let _ = app_handle.emit("menu-event", "new-tab");
                        },
                        "close-tab" => {
                            let _ = app_handle.emit("menu-event", "close-tab");
                        },
                        _ => {}
                    }
                });
            }
            Ok(())
        })
        .manage(pty::PtyState::default())
        .manage(process_cmds::SystemState(std::sync::Mutex::new(sysinfo::System::new())))
        .manage(embedded_server::EmbeddedLlmState::default())
        .manage(watcher::WatchState::default())
        .manage(launch::OpenedFiles::default())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            pty::spawn_pty,
            pty::write_pty,
            pty::resize_pty,
            pty::kill_pty,
            pty::get_pty_cwd,
            pty::get_default_shell,
            process_cmds::list_processes,
            process_cmds::kill_process,
            process_cmds::get_system_stats,
            process_cmds::execute_command,
            process_cmds::cancel_command,
            request_bluetooth_access,
            process_cmds::get_launch_args,
            process_cmds::get_app_binary_path,
            process_cmds::write_system_file,
            process_cmds::create_system_dir,
            process_cmds::read_system_file,
            process_cmds::check_path_exists,
            path_search::find_paths,
            secrets::secret_backend,
            secrets::secret_set,
            secrets::secret_get,
            secrets::secret_delete,
            process_cmds::sentinel_store_snapshot,
            process_cmds::sentinel_store_append,
            process_cmds::sentinel_store_write,
            process_cmds::sentinel_store_remove,
            watcher::watch_file_start,
            watcher::watch_service_start,
            watcher::watch_stop,
            watcher::watch_list,
            embedded_server::start_embedded_llm,
            embedded_server::stop_embedded_llm,
            embedded_server::get_embedded_llm_status,
            embedded_server::get_embedded_llm_log_tail,
            embedded_server::acquire_inference_slot,
            embedded_server::release_inference_slot,
            embedded_server::cancel_session_requests,
            embedded_server::get_inference_queue_status,
            embedded_server::verify_file_checksum,
            downloads::download_sentinel_file,
            downloads::get_sentinel_download_status,
            downloads::cancel_sentinel_download,
            downloads::install_sentinel_engine,
            launch::take_opened_files,
            launch::show_main_window,
            launch::is_main_window_visible,
            file_association::get_association_status,
            file_association::set_association_status,
            logger::log_diagnostic,
            logger::is_debug_active
        ])
        .on_window_event(|window, event| {
            match event {
                tauri::WindowEvent::Destroyed => {
                    logger::log_info("WINDOW", &format!("Webview window destroyed: {}", window.label()));
                    use tauri::Manager;
                    if let Some(state) = window.try_state::<embedded_server::EmbeddedLlmState>() {
                        embedded_server::terminate_embedded_llm_child(&state);
                    }
                }
                tauri::WindowEvent::CloseRequested { .. } => {
                    logger::log_info("WINDOW", &format!("Webview window close requested: {}", window.label()));
                }
                _ => {}
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            match event {
                tauri::RunEvent::Ready => {
                    logger::log_info("APP", "Sentinel Terminal application runtime READY");
                }
                tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit => {
                    logger::log_info("APP", "Sentinel Terminal application runtime EXIT");
                    use tauri::Manager;
                    if let Some(state) = app_handle.try_state::<embedded_server::EmbeddedLlmState>() {
                        embedded_server::terminate_embedded_llm_child(&state);
                    }
                }
                #[cfg(any(target_os = "macos", target_os = "ios"))]
                tauri::RunEvent::Opened { urls } => {
                    use tauri::Emitter;
                    let url_strings: Vec<String> = urls.into_iter().map(|u| u.to_string()).collect();
                    logger::log_info("URL", &format!("Opened via protocol handler: {:?}", url_strings));
                    launch::remember_opened(app_handle, &url_strings);
                    let _ = app_handle.emit("sentinel-url", url_strings);
                }
                _ => {}
            }
        });
}
