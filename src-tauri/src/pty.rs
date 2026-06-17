//! Real PTY terminal backend using portable-pty.
//! Exposes four Tauri commands (pty_spawn/pty_write/pty_resize/pty_kill)
//! and two events (pty-data / pty-exit).
//!
//! Output stream is transported as base64-encoded strings on the `pty-data`
//! event (PTY output contains arbitrary bytes incl. partial UTF-8 / escape
//! sequences; base64 keeps it JSON-safe). Input (`pty_write`) is plain UTF-8
//! text (keystrokes are text), encoded to bytes on the backend.

use base64::Engine;
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

/// One live PTY session, keyed by an id (one per workspace tab).
pub struct PtySession {
    /// Master handle, kept alive for resize. portable_pty Master is Send.
    pub master: Arc<Mutex<Box<dyn portable_pty::MasterPty + Send>>>,
    /// Writer taken from the master, used by pty_write.
    pub writer: Arc<Mutex<Box<dyn Write + Send>>>,
    /// Child process handle, used by pty_kill / cleanup.
    pub child: Arc<Mutex<Option<Box<dyn portable_pty::Child + Send>>>>,
    /// Monotonic generation; stale reader threads check this against the map
    /// before emitting/removing so a superseded session isn't disturbed.
    pub generation: u64,
}

#[derive(Default)]
pub struct PtyState {
    pub sessions: Arc<Mutex<HashMap<String, PtySession>>>,
}

#[derive(serde::Serialize, Clone)]
struct PtyDataPayload {
    id: String,
    data: String,
}

#[derive(serde::Serialize, Clone)]
struct PtyExitPayload {
    id: String,
    generation: u64,
    exit_code: Option<i32>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PtySpawnOptions {
    cwd: String,
    /// Optional explicit shell program name or absolute path.
    /// When omitted, a platform default is probed.
    shell: Option<String>,
    cols: u16,
    rows: u16,
}

/// Pick a default shell for the platform. On Unix we pass `-l` so the shell
/// is a login shell (reads ~/.zshrc / ~/.bash_profile), which restores the
/// full PATH (nvm/volta/.local/bin) — this replaces the old PATH-injection
/// hack that the frontend used to do.
fn pick_default_shell() -> Result<(String, Vec<String>), String> {
    if cfg!(target_os = "windows") {
        if which::which("pwsh").is_ok() {
            return Ok(("pwsh".to_string(), vec![]));
        }
        if which::which("powershell").is_ok() {
            return Ok(("powershell".to_string(), vec![]));
        }
        return Ok(("cmd.exe".to_string(), vec![]));
    }

    let shell = std::env::var("SHELL")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| {
            if which::which("zsh").is_ok() {
                "/bin/zsh".to_string()
            } else if which::which("bash").is_ok() {
                "/bin/bash".to_string()
            } else {
                "/bin/sh".to_string()
            }
        });
    Ok((shell, vec!["-l".to_string()]))
}

fn normalize_id(id: String) -> String {
    let trimmed = id.trim();
    if trimmed.is_empty() {
        "default".to_string()
    } else {
        trimmed.to_string()
    }
}

/// Spawn a shell inside a new PTY. If a session with the same id already
/// exists, it is killed and superseded (generation incremented).
#[tauri::command]
pub async fn pty_spawn(
    app: AppHandle,
    state: tauri::State<'_, PtyState>,
    options: PtySpawnOptions,
    id: String,
) -> Result<(), String> {
    let id = normalize_id(id);

    // Resolve the shell program + extra args.
    let (program, extra_args) = match options.shell.as_ref() {
        Some(s) if !s.trim().is_empty() => {
            let trimmed = s.trim();
            let prog = if std::path::Path::new(trimmed).is_file() {
                trimmed.to_string()
            } else {
                which::which(trimmed)
                    .map_err(|_| format!("Shell not found: {}", trimmed))?
                    .to_string_lossy()
                    .to_string()
            };
            if cfg!(target_os = "windows") {
                (prog, vec![])
            } else {
                (prog, vec!["-l".to_string()])
            }
        }
        _ => pick_default_shell()?,
    };

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: options.rows.max(1),
            cols: options.cols.max(1),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to open PTY: {}", e))?;

    let master = pair.master;
    let slave = pair.slave;

    let mut cmd = CommandBuilder::new(&program);
    for a in &extra_args {
        cmd.arg(a);
    }
    let cwd = std::path::Path::new(&options.cwd);
    if cwd.is_dir() {
        cmd.cwd(cwd);
    }
    // Give the child a sane TERM so TUI apps (pi, vim, less) render correctly.
    cmd.env("TERM", "xterm-256color");

    let child = slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn shell in PTY: {}", e))?;
    // Per portable-pty docs the slave may be dropped after spawn.
    drop(slave);

    let reader = master
        .try_clone_reader()
        .map_err(|e| format!("Failed to clone PTY reader: {}", e))?;
    let writer = master
        .take_writer()
        .map_err(|e| format!("Failed to take PTY writer: {}", e))?;

    // Supersede any existing session under this id.
    let generation = {
        let mut sessions = state
            .sessions
            .lock()
            .map_err(|_| "Failed to acquire PTY sessions lock".to_string())?;
        let next = if let Some(existing) = sessions.get_mut(&id) {
            let g = existing.generation.saturating_add(1).max(1);
            if let Ok(mut c) = existing.child.lock() {
                if let Some(mut child) = c.take() {
                    let _ = child.kill();
                    let _ = child.wait();
                }
            }
            g
        } else {
            1
        };
        next
    };

    let session = PtySession {
        master: Arc::new(Mutex::new(master)),
        writer: Arc::new(Mutex::new(writer)),
        child: Arc::new(Mutex::new(Some(child))),
        generation,
    };

    {
        let mut sessions = state
            .sessions
            .lock()
            .map_err(|_| "Failed to acquire PTY sessions lock".to_string())?;
        sessions.insert(id.clone(), session);
    }

    // Reader thread: pump PTY output -> base64 -> pty-data events.
    // On EOF (child exited) emit pty-exit and clean up the session.
    let app_handle = app.clone();
    let reader_id = id.clone();
    let reader_gen = generation;
    let sessions_for_exit = state.sessions.clone();
    std::thread::spawn(move || {
        let mut reader = reader;
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let encoded =
                        base64::engine::general_purpose::STANDARD.encode(&buf[..n]);
                    let _ = app_handle.emit(
                        "pty-data",
                        PtyDataPayload {
                            id: reader_id.clone(),
                            data: encoded,
                        },
                    );
                }
                Err(_) => break,
            }
        }

        // Reap the child and emit exit. Only act if this generation is still
        // current (a newer spawn may have replaced us).
        let mut exit_code = None;
        {
            if let Ok(mut sessions) = sessions_for_exit.lock() {
                let superseded = sessions
                    .get(&reader_id)
                    .map(|s| s.generation != reader_gen)
                    .unwrap_or(true);
                if !superseded {
                    if let Some(sess) = sessions.get_mut(&reader_id) {
                        if let Ok(mut c) = sess.child.lock() {
                            if let Some(mut child) = c.take() {
                                match child.wait() {
                                    Ok(status) => {
                                        exit_code = Some(status.exit_code() as i32)
                                    }
                                    Err(_) => {}
                                }
                            }
                        }
                    }
                    sessions.remove(&reader_id);
                }
            }
        }

        let _ = app_handle.emit(
            "pty-exit",
            PtyExitPayload {
                id: reader_id,
                generation: reader_gen,
                exit_code,
            },
        );
    });

    Ok(())
}

/// Write input (keystrokes) to a PTY. `data` is a plain UTF-8 string.
#[tauri::command]
pub fn pty_write(
    state: tauri::State<'_, PtyState>,
    id: String,
    data: String,
) -> Result<(), String> {
    let id = normalize_id(id);
    let sessions = state
        .sessions
        .lock()
        .map_err(|_| "Failed to acquire PTY sessions lock".to_string())?;
    let session = sessions
        .get(&id)
        .ok_or_else(|| format!("No PTY session for id: {}", id))?;
    let mut writer = session
        .writer
        .lock()
        .map_err(|_| "Failed to acquire writer lock".to_string())?;
    writer
        .write_all(data.as_bytes())
        .map_err(|e| format!("Failed to write to PTY: {}", e))?;
    writer
        .flush()
        .map_err(|e| format!("Failed to flush PTY: {}", e))?;
    Ok(())
}

/// Resize a PTY to the given number of columns/rows.
#[tauri::command]
pub fn pty_resize(
    state: tauri::State<'_, PtyState>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let id = normalize_id(id);
    let sessions = state
        .sessions
        .lock()
        .map_err(|_| "Failed to acquire PTY sessions lock".to_string())?;
    let session = sessions
        .get(&id)
        .ok_or_else(|| format!("No PTY session for id: {}", id))?;
    let master = session
        .master
        .lock()
        .map_err(|_| "Failed to acquire master lock".to_string())?;
    master
        .resize(PtySize {
            rows: rows.max(1),
            cols: cols.max(1),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to resize PTY: {}", e))?;
    Ok(())
}

/// Kill a PTY session and remove it from the map.
#[tauri::command]
pub fn pty_kill(state: tauri::State<'_, PtyState>, id: String) -> Result<(), String> {
    let id = normalize_id(id);
    let mut sessions = state
        .sessions
        .lock()
        .map_err(|_| "Failed to acquire PTY sessions lock".to_string())?;
    if let Some(session) = sessions.remove(&id) {
        if let Ok(mut c) = session.child.lock() {
            if let Some(mut child) = c.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
    Ok(())
}
