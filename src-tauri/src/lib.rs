mod assoc;
mod encoding;
mod engine_support;
mod file_uri;
mod home;
mod job;
mod log_rotation;
mod osc;
mod shell;
mod shell_list;
mod pty;
mod process_cmds;
mod embedded_server;
mod watcher;
mod downloads;
mod launch;
mod path_search;
mod secret_chunks;
mod search_rules;
mod secrets;
mod service_watch;
mod legacy_migration;
mod file_association;
pub mod logger;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // first of all, before anything creates ~/.cero or opens the web view: bring settings and data from the old
    // name (Sentinel Terminal) across
    legacy_migration::migrate_legacy_data();
    logger::init();
    logger::log_info("BOOT", "Initializing Cero runtime");
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            use tauri::Emitter;
            logger::log_info("SINGLE_INSTANCE", &format!("Second instance launched with argv: {:?}", argv));
            let flow_files = launch::filter_flow_argv(&argv);
            if !flow_files.is_empty() {
                launch::remember_opened(app, &flow_files);
                let _ = app.emit("cero-url", &flow_files);
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
            shell_list::list_available_shells,
            process_cmds::list_processes,
            process_cmds::kill_process,
            process_cmds::get_system_stats,
            process_cmds::execute_command,
            process_cmds::cancel_command,
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
            process_cmds::cero_store_snapshot,
            process_cmds::cero_store_append,
            process_cmds::cero_store_write,
            process_cmds::cero_store_remove,
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
            downloads::download_cero_file,
            downloads::get_cero_download_status,
            downloads::cancel_cero_download,
            downloads::install_cero_engine,
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
                    logger::log_info("APP", "Cero application runtime READY");
                }
                tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit => {
                    logger::log_info("APP", "Cero application runtime EXIT");
                    use tauri::Manager;
                    if let Some(state) = app_handle.try_state::<embedded_server::EmbeddedLlmState>() {
                        embedded_server::terminate_embedded_llm_child(&state);
                    }
                }
                _ => {}
            }
        });
}
