#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;
use tauri::Manager;

#[derive(Debug, Serialize, Deserialize)]
struct UploadRequest {
api_key: String,
user_profile: String,
video_path: String,
title: String,
description: String,
hashtags: String,
music_mode: String, // "none", "custom", "draft"
custom_audio_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct UploadResponse {
success: bool,
message: String,
details: Option<serde_json::Value>,
}

/// Build the full caption from title + description + hashtags
fn build_caption(title: &str, description: &str, hashtags: &str) -> String {
let mut parts: Vec<String> = Vec::new();
if !title.trim().is_empty() {
    parts.push(title.trim().to_string());
}
if !description.trim().is_empty() {
    parts.push(description.trim().to_string());
}
if !hashtags.trim().is_empty() {
    // ensure each hashtag starts with #
    let tags: Vec<String> = hashtags
        .split_whitespace()
        .map(|t| {
            let t = t.trim_start_matches('#');
            format!("#{}", t)
        })
        .collect();
    parts.push(tags.join(" "));
}
parts.join(" ")
}

/// Overlay an audio file onto a video file using ffmpeg.
/// Returns the path to the produced output video file.
async fn overlay_audio_with_ffmpeg(
video_path: &str,
audio_path: &str,
) -> Result<String, String> {
// Output path: same directory as input video, with _withmusic.mp4 suffix
let input = PathBuf::from(video_path);
let stem = input
    .file_stem()
    .and_then(|s| s.to_str())
    .unwrap_or("output");
let parent = input.parent().unwrap_or(std::path::Path::new("."));
let output = parent.join(format!("{}_withmusic.mp4", stem));
let output_str = output.to_string_lossy().to_string();

// ffmpeg command:
// -i video -i audio -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -shortest -y output
// This replaces original audio with the new audio track, cutting to shortest stream.
let status = Command::new("ffmpeg")
    .args([
        "-i", video_path,
        "-i", audio_path,
        "-map", "0:v:0",
        "-map", "1:a:0",
        "-c:v", "copy",
        "-c:a", "aac",
        "-b:a", "192k",
        "-shortest",
        "-y",
        &output_str,
    ])
    .status()
    .map_err(|e| format!("Failed to spawn ffmpeg: {}. Is ffmpeg installed and in PATH?", e))?;

if !status.success() {
    return Err(format!(
        "ffmpeg exited with status {:?}. Check that the video and audio files are valid.",
        status.code()
    ));
}

Ok(output_str)
}

/// Main upload command called from the frontend.
#[tauri::command]
async fn upload_to_tiktok(req: UploadRequest) -> Result<UploadResponse, String> {
// 1. Validate inputs
if req.api_key.trim().is_empty() {
    return Err("API key is empty. Get one from https://app.upload-post.com".into());
}
if req.user_profile.trim().is_empty() {
    return Err("User profile is empty. This is the profile name from your upload-post dashboard.".into());
}
if req.video_path.trim().is_empty() {
    return Err("No video file selected.".into());
}
if !std::path::Path::new(&req.video_path).exists() {
    return Err(format!("Video file does not exist: {}", req.video_path));
}

// 2. If music_mode == custom, overlay the audio first
let final_video_path = if req.music_mode == "custom" {
    let audio = req
        .custom_audio_path
        .as_ref()
        .ok_or("Custom music mode selected but no audio file provided")?;
    if !std::path::Path::new(audio).exists() {
        return Err(format!("Audio file does not exist: {}", audio));
    }
    overlay_audio_with_ffmpeg(&req.video_path, audio).await?
} else {
    req.video_path.clone()
};

// 3. Build caption
let caption = build_caption(&req.title, &req.description, &req.hashtags);

// 4. Upload via upload-post.com API
let client = reqwest::Client::builder()
    .timeout(std::time::Duration::from_secs(600))
    .build()
    .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

let file_bytes = tokio::fs::read(&final_video_path)
    .await
    .map_err(|e| format!("Failed to read video file: {}", e))?;
let file_name = std::path::Path::new(&final_video_path)
    .file_name()
    .and_then(|s| s.to_str())
    .unwrap_or("video.mp4")
    .to_string();

let part = reqwest::multipart::Part::bytes(file_bytes)
    .file_name(file_name)
    .mime_str("video/mp4")
    .map_err(|e| format!("Failed to build multipart part: {}", e))?;

let form = reqwest::multipart::Form::new()
    .text("user", req.user_profile.clone())
    .text("platform[]", "tiktok")
    .text("title", caption.clone())
    .part("video", part);

// The Authorization header expects format: "Apikey YOUR_KEY"
// We allow the user to either paste the key alone or the full "Apikey xxx" string.
let auth_value = if req.api_key.starts_with("Apikey ") || req.api_key.starts_with("Bearer ") {
    req.api_key.clone()
} else {
    format!("Apikey {}", req.api_key)
};

let resp = client
    .post("https://api.upload-post.com/api/upload")
    .header("Authorization", auth_value)
    .multipart(form)
    .send()
    .await
    .map_err(|e| format!("HTTP request failed: {}", e))?;

let status = resp.status();
let body_text = resp.text().await.unwrap_or_default();
let body_json: Option<serde_json::Value> = serde_json::from_str(&body_text).ok();

if status.is_success() {
    Ok(UploadResponse {
        success: true,
        message: format!("Uploaded successfully (HTTP {})", status.as_u16()),
        details: body_json,
    })
} else {
    Err(format!(
        "Upload failed (HTTP {}): {}",
        status.as_u16(),
        body_text
    ))
}
}

/// Check whether ffmpeg is installed and reachable.
#[tauri::command]
fn check_ffmpeg() -> bool {
Command::new("ffmpeg")
    .arg("-version")
    .output()
    .map(|o| o.status.success())
    .unwrap_or(false)
}

fn main() {
tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_store::Builder::default().build())
    .invoke_handler(tauri::generate_handler![upload_to_tiktok, check_ffmpeg])
    .setup(|app| {
        #[cfg(debug_assertions)]
        {
            if let Some(window) = app.get_webview_window("main") {
                window.open_devtools();
            }
        }
        Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
