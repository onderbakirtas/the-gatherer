use std::sync::Mutex;
use tauri::async_runtime::spawn;
use tauri::{AppHandle, Manager, State};
use tokio::time::{sleep, Duration};

struct SetupState {
    frontend_task: bool,
    backend_task: bool,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Mutex::new(SetupState {
            frontend_task: false,
            backend_task: false,
        }))
        .invoke_handler(tauri::generate_handler![greet, set_complete])
        .setup(|app| {
            spawn(setup(app.handle().clone()));
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn set_complete(
    app: AppHandle,
    state: State<'_, Mutex<SetupState>>,
    task: String,
) -> Result<(), String> {
    let mut state_lock = state.lock().unwrap();
    match task.as_str() {
        "frontend" => state_lock.frontend_task = true,
        "backend" => state_lock.backend_task = true,
        _ => return Err("Invalid task completed!".to_string()),
    }
    if state_lock.backend_task && state_lock.frontend_task {
        let splash_window = app.get_webview_window("splashscreen");
        let main_window = app.get_webview_window("main");
        if let Some(splash) = splash_window {
            splash.close().map_err(|e| format!("Failed to close splashscreen: {}", e))?;
        } else {
            return Err("Splashscreen window not found".to_string());
        }
        if let Some(main) = main_window {
            main.show().map_err(|e| format!("Failed to show main window: {}", e))?;
        } else {
            return Err("Main window not found".to_string());
        }
    }
    Ok(())
}

async fn setup(app: AppHandle) -> Result<(), ()> {
    println!("Performing really heavy backend setup task...");
    sleep(Duration::from_secs(3)).await;
    println!("Backend setup task completed!");
    set_complete(app.clone(), app.state::<Mutex<SetupState>>(), "backend".to_string())
        .await
        .map_err(|e| {
            println!("Setup failed: {}", e);
            ()
        })?;
    Ok(())
}