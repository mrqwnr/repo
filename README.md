# TikTok Poster

Десктопное приложение для постинга видео в TikTok через [upload-post.com](https://app.upload-post.com) API.

## Что умеет

- ✅ Выбор видеофайла (drag & drop или кнопка)
- ✅ Указать название, описание, хештеги
- ✅ Два режима музыки:
- **Своя музыка** — выбираешь аудиофайл, приложение накладывает его на видео через ffmpeg
- **Draft mode** — загружает как черновик, ты добиваешь рекомендованный звук в приложении TikTok
- ✅ Один тап → видео в TikTok

## ⚠️ Про "рекомендованную музыку TikTok"

TikTok **не предоставляет публичного API** для подбора рекомендованной музыки при загрузке через сторонние сервисы. Авто-подбор звука работает только когда грузишь видео из самого приложения TikTok на телефоне.

Поэтому в этом софте два рабочих варианта:
1. Накладываешь свою музыку (локальный mp3/wav)
2. Загружаешь как Draft → открываешь TikTok на телефоне → один тап на "Sounds" → выбираешь рекомендованный → публикуешь

## Установка

### Готовый билд (рекомендуется)
1. Скачай последний `.msi` из [Releases](https://github.com/mrqwnr/repo/releases)
2. Установи
3. Запусти, введи свой upload-post.com API ключ

### Собрать самому
Требования: Node.js 20+, Rust (https://rustup.rs), ffmpeg в PATH

```bash
git clone https://github.com/mrqwnr/repo.git
cd repo
npm install
npm run tauri dev
```

Собрать установщик:
```bash
npm run tauri build
```

`.msi` будет в `src-tauri/target/release/bundle/msi/`

## Установка ffmpeg

Один раз:
```powershell
winget install ffmpeg
```

Или скачать с https://www.gyan.dev/ffmpeg/builds/ и добавить в PATH.

## Где взять upload-post API ключ

1. Зарегистрируйся на https://app.upload-post.com
2. Подключи свой TikTok аккаунт
3. Settings → API → скопируй JWT токен

## Стек

- **Tauri** (Rust + WebView) — десктопная оболочка
- **HTML/CSS/JS** — UI
- **ffmpeg** — наложение музыки на видео
- **upload-post.com API** — загрузка в TikTok

## Лицензия

MIT
