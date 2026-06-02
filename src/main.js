import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { LazyStore } from '@tauri-apps/plugin-store';

const store = new LazyStore('settings.json');

// State
let state = {
videoPath: null,
audioPath: null,
apiKey: '',
userProfile: '',
};

// DOM
const $ = (id) => document.getElementById(id);
const settingsBtn = $('settingsBtn');
const settingsPanel = $('settingsPanel');
const apiKeyInput = $('apiKey');
const userProfileInput = $('userProfile');
const saveSettingsBtn = $('saveSettings');
const ffmpegStatus = $('ffmpegStatus');
const dropZone = $('dropZone');
const dropZoneEmpty = $('dropZoneEmpty');
const dropZoneSelected = $('dropZoneSelected');
const videoFileName = $('videoFileName');
const pickVideoBtn = $('pickVideoBtn');
const clearVideoBtn = $('clearVideoBtn');
const titleInput = $('title');
const descInput = $('description');
const hashtagsInput = $('hashtags');
const pickAudioBtn = $('pickAudioBtn');
const audioFileName = $('audioFileName');
const customMusicRow = $('customMusicRow');
const publishBtn = $('publishBtn');
const progressArea = $('progressArea');
const progressFill = $('progressFill');
const progressText = $('progressText');
const resultArea = $('resultArea');

// === Settings load/save ===
async function loadSettings() {
state.apiKey = (await store.get('apiKey')) || '';
state.userProfile = (await store.get('userProfile')) || '';
apiKeyInput.value = state.apiKey;
userProfileInput.value = state.userProfile;
if (!state.apiKey || !state.userProfile) {
  settingsPanel.classList.remove('hidden');
}
}

async function saveSettings() {
state.apiKey = apiKeyInput.value.trim();
state.userProfile = userProfileInput.value.trim();
await store.set('apiKey', state.apiKey);
await store.set('userProfile', state.userProfile);
await store.save();
settingsPanel.classList.add('hidden');
updatePublishButton();
}

// === ffmpeg check ===
async function checkFfmpeg() {
try {
  const ok = await invoke('check_ffmpeg');
  if (ok) {
    ffmpegStatus.textContent = '✅ ffmpeg найден';
    ffmpegStatus.className = 'status-line ok';
  } else {
    ffmpegStatus.innerHTML = '⚠️ ffmpeg не найден. Установи: <code>winget install ffmpeg</code>';
    ffmpegStatus.className = 'status-line warn';
  }
} catch (e) {
  ffmpegStatus.textContent = 'ffmpeg check failed: ' + e;
  ffmpegStatus.className = 'status-line warn';
}
}

// === File pickers ===
async function pickVideo() {
const selected = await open({
  multiple: false,
  filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm'] }],
});
if (selected && typeof selected === 'string') {
  state.videoPath = selected;
  const parts = selected.split(/[\\/]/);
  videoFileName.textContent = parts[parts.length - 1];
  dropZoneEmpty.classList.add('hidden');
  dropZoneSelected.classList.remove('hidden');
  updatePublishButton();
}
}

async function pickAudio() {
const selected = await open({
  multiple: false,
  filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'] }],
});
if (selected && typeof selected === 'string') {
  state.audioPath = selected;
  const parts = selected.split(/[\\/]/);
  audioFileName.textContent = parts[parts.length - 1];
  audioFileName.classList.remove('muted');
  updatePublishButton();
}
}

function clearVideo() {
state.videoPath = null;
videoFileName.textContent = '';
dropZoneEmpty.classList.remove('hidden');
dropZoneSelected.classList.add('hidden');
updatePublishButton();
}

// === Music mode handling ===
function getMusicMode() {
const checked = document.querySelector('input[name="musicMode"]:checked');
return checked ? checked.value : 'custom';
}

function updateMusicModeUI() {
const mode = getMusicMode();
customMusicRow.style.display = mode === 'custom' ? 'flex' : 'none';
updatePublishButton();
}

// === Publish button state ===
function updatePublishButton() {
const mode = getMusicMode();
const hasVideo = !!state.videoPath;
const hasAudioIfNeeded = mode !== 'custom' || !!state.audioPath;
const hasCreds = !!state.apiKey && !!state.userProfile;
const hasTitle = !!titleInput.value.trim();
publishBtn.disabled = !(hasVideo && hasAudioIfNeeded && hasCreds && hasTitle);
}

// === Publish ===
async function publish() {
publishBtn.disabled = true;
resultArea.classList.add('hidden');
resultArea.innerHTML = '';
progressArea.classList.remove('hidden');
progressFill.style.width = '20%';
progressText.textContent = 'Подготовка...';

const mode = getMusicMode();
if (mode === 'custom') {
  progressFill.style.width = '40%';
  progressText.textContent = 'Накладываю музыку через ffmpeg...';
} else {
  progressFill.style.width = '40%';
  progressText.textContent = 'Загружаю в upload-post...';
}

try {
  progressFill.style.width = '70%';
  progressText.textContent = 'Загружаю в TikTok через upload-post...';
  const resp = await invoke('upload_to_tiktok', {
    req: {
      api_key: state.apiKey,
      user_profile: state.userProfile,
      video_path: state.videoPath,
      title: titleInput.value.trim(),
      description: descInput.value.trim(),
      hashtags: hashtagsInput.value.trim(),
      music_mode: mode,
      custom_audio_path: state.audioPath,
    },
  });
  progressFill.style.width = '100%';
  progressText.textContent = 'Готово!';
  resultArea.classList.remove('hidden');
  resultArea.className = 'result ok';
  resultArea.innerHTML = `
    <h3>✅ Опубликовано!</h3>
    <p>${resp.message}</p>
    ${resp.details ? `<pre>${JSON.stringify(resp.details, null, 2)}</pre>` : ''}
    ${mode === 'draft' ? '<p class="hint">Открой TikTok на телефоне и добавь рекомендованный звук в Drafts.</p>' : ''}
  `;
} catch (err) {
  progressFill.style.width = '100%';
  progressFill.style.background = '#e74c3c';
  progressText.textContent = 'Ошибка';
  resultArea.classList.remove('hidden');
  resultArea.className = 'result err';
  resultArea.innerHTML = `<h3>❌ Ошибка</h3><pre>${err}</pre>`;
} finally {
  setTimeout(() => {
    progressArea.classList.add('hidden');
    progressFill.style.width = '0%';
    progressFill.style.background = '';
    updatePublishButton();
  }, 2000);
}
}

// === Drag & drop ===
function setupDragDrop() {
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('drag-over');
});
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  // Tauri drop events come through the OS — file path is available via webview
  // But the HTML5 drop event in Tauri webview also exposes File objects:
  const files = e.dataTransfer.files;
  if (files.length > 0) {
    // We can't get a real filesystem path from a dropped File in standard HTML5;
    // Tauri v2 exposes a separate drag-drop event. For now, prompt user to use the picker.
    alert('Используй кнопку "Выбрать файл" — drag&drop работает только с пикером в этой версии.');
  }
});
}

// === Wire up ===
function init() {
settingsBtn.addEventListener('click', () => settingsPanel.classList.toggle('hidden'));
saveSettingsBtn.addEventListener('click', saveSettings);
pickVideoBtn.addEventListener('click', pickVideo);
clearVideoBtn.addEventListener('click', clearVideo);
pickAudioBtn.addEventListener('click', pickAudio);
publishBtn.addEventListener('click', publish);
titleInput.addEventListener('input', updatePublishButton);
document.querySelectorAll('input[name="musicMode"]').forEach((r) =>
  r.addEventListener('change', updateMusicModeUI)
);
setupDragDrop();
updateMusicModeUI();
loadSettings();
checkFfmpeg();
}

document.addEventListener('DOMContentLoaded', init);
