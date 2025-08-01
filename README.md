# Universal Downloader

A fast, universal CLI tool for downloading videos and audio from any website including YouTube, video hosting sites, and more.

## Quick Start

```bash
# Install dependencies
npm install

# Download video (default mode)
npm run video "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

# Download audio only
npm run audio "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

## Features

- ✅ **Universal Support**: Works with YouTube, video hosting sites, and hundreds of other websites
- ⚡ **Optimized Speed**: Smart format selection for faster downloads (up to 8MB/s vs 500KB/s)
- 🎵 **Audio Extraction**: Extract audio in multiple formats (MP3, M4A, WAV, FLAC)
- 🎬 **Video Download**: Download videos in available qualities
- 🔄 **Smart Timeout**: Dynamic timeout that resets on activity, prevents hanging
- 🍪 **Browser Cookies**: Automatic cookie extraction for authenticated content
- 📊 **Progress Bars**: Real-time download progress with file information

## Installation

```bash
git clone <repository-url>
cd universal-downloader
npm install
```

### Requirements

- Node.js >= 16.0.0
- FFmpeg (for audio processing)

#### Install FFmpeg

**macOS:**
```bash
brew install ffmpeg
```

**Windows:**
Download from https://ffmpeg.org/download.html

**Linux:**
```bash
sudo apt install ffmpeg  # Ubuntu/Debian
sudo yum install ffmpeg  # CentOS/RHEL
```

## Usage

### Basic Usage

```bash
# Download video
npm run video "URL"

# Download audio only  
npm run audio "URL"

# Alternative direct usage
node src/cli.js "URL"        # video
node src/cli.js "URL" -a     # audio
```

### Advanced Options

```bash
# Verbose output for troubleshooting
npm run video "URL" -- -v

# Custom output directory
npm run video "URL" -- -o ./downloads

# Video info before download
npm run video "URL" -- -i

# Use browser cookies (for authenticated content)
npm run video "URL" -- -b chrome

# Custom audio format (audio mode only)
npm run audio "URL" -- -f mp3
```

## Supported Sites

- **YouTube** - Full support with automatic cookie handling
- **Video Hosting Sites** - Optimized for fast downloads
- **Social Media** - Twitter, TikTok, Instagram, etc.
- **Educational** - Coursera, Udemy, Khan Academy, etc.
- **Live Streams** - Twitch, YouTube Live, etc.
- **And 1000+ more sites** supported by yt-dlp

## Quality & Performance

### Download Speed Optimization

This tool automatically selects the best download method for each site:

- **YouTube**: Separate video+audio streams for best quality
- **Other Sites**: Direct HTTPS downloads preferred over slow HLS streams
- **Result**: Up to 16x faster downloads (8MB/s vs 500KB/s)

### Quality Limitations

**YouTube**: Due to platform restrictions, video quality is often limited to 360p-480p without authentication. This is normal and affects all downloaders.

**Other Sites**: Full quality options usually available (720p, 1080p, etc.)

## Troubleshooting

### YouTube "Sign in to confirm you're not a bot"

YouTube blocks unauthenticated downloads. Solutions:

1. **Use browser cookies** (recommended):
   ```bash
   npm run video "URL" -- -b chrome
   ```

2. **Make sure you're logged into YouTube** in the specified browser

3. **Try different browsers**: `-b safari`, `-b firefox`, `-b edge`

### Slow Downloads

The tool automatically optimizes download speed, but if you experience issues:

1. **Use verbose mode** to see details:
   ```bash
   npm run video "URL" -- -v
   ```

2. **Check your internet connection**

3. **Some sites may have rate limiting** - this is normal

### URL with Special Characters

If your URL contains `?`, `&`, or `=` characters:

```bash
# Always use quotes
npm run video "https://example.com/video?id=123&t=45"

# NOT this (will fail)
npm run video https://example.com/video?id=123&t=45
```

## Command Reference

### Options

- `-o, --output <dir>` - Save directory (default: `./downloads`)
- `-a, --audio` - Extract audio only (default: download video)
- `-f, --format <format>` - Audio format: `mp3|m4a|wav|flac` (default: `m4a`)
- `-q, --quality <quality>` - Video quality: `best|worst|720p|1080p|480p|360p` (default: `best`)
- `-i, --info` - Show video information before downloading
- `-b, --browser <browser>` - Browser for cookies: `chrome|firefox|safari|edge`
- `-c, --cookies <file>` - Path to cookies.txt file
- `-v, --verbose` - Show detailed yt-dlp output
- `-h, --help` - Show help

### Examples

```bash
# Basic video download
npm run video "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

# Audio in MP3 format
npm run audio "https://www.youtube.com/watch?v=dQw4w9WgXcQ" -- -f mp3

# Video with browser cookies
npm run video "https://www.youtube.com/watch?v=dQw4w9WgXcQ" -- -b safari

# Show video info first
npm run video "https://www.youtube.com/watch?v=dQw4w9WgXcQ" -- -i

# Custom output directory
npm run video "https://www.youtube.com/watch?v=dQw4w9WgXcQ" -- -o ./music

# Verbose troubleshooting
npm run video "https://www.youtube.com/watch?v=dQw4w9WgXcQ" -- -v
```

## Dependencies

- [youtube-dl-exec](https://www.npmjs.com/package/youtube-dl-exec) - yt-dlp wrapper
- [commander](https://www.npmjs.com/package/commander) - Command-line argument parsing
- [chalk](https://www.npmjs.com/package/chalk) - Terminal colors
- [cli-progress](https://www.npmjs.com/package/cli-progress) - Progress bars

---

# Universal Downloader (Русская версия)

Быстрый универсальный CLI инструмент для скачивания видео и аудио с любых сайтов, включая YouTube, видеохостинги и многое другое.

## Быстрый старт

```bash
# Установка зависимостей
npm install

# Скачать видео (по умолчанию)
npm run video "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

# Скачать только аудио
npm run audio "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

## Возможности

- ✅ **Универсальная поддержка**: Работает с YouTube, видеохостингами и сотнями других сайтов
- ⚡ **Оптимизированная скорость**: Умный выбор формата для быстрых загрузок (до 8МБ/с против 500КБ/с)
- 🎵 **Извлечение аудио**: Извлечение аудио в разных форматах (MP3, M4A, WAV, FLAC)
- 🎬 **Скачивание видео**: Скачивание видео в доступных качествах
- 🔄 **Умный таймаут**: Динамический таймаут, который сбрасывается при активности
- 🍪 **Cookies браузера**: Автоматическое извлечение cookies для авторизованного контента
- 📊 **Прогресс-бары**: Прогресс загрузки в реальном времени с информацией о файле

## Установка

```bash
git clone <repository-url>
cd universal-downloader
npm install
```

### Требования

- Node.js >= 16.0.0
- FFmpeg (для обработки аудио)

## Использование

### Базовое использование

```bash
# Скачать видео
npm run video "URL"

# Скачать только аудио
npm run audio "URL"

# Альтернативный прямой вызов
node src/cli.js "URL"        # видео
node src/cli.js "URL" -a     # аудио
```

### Дополнительные опции

```bash
# Подробный вывод для диагностики
npm run video "URL" -- -v

# Своя папка для сохранения
npm run video "URL" -- -o ./downloads

# Информация о видео перед скачиванием
npm run video "URL" -- -i

# Использовать cookies браузера
npm run video "URL" -- -b chrome

# Формат аудио (только для аудио режима)
npm run audio "URL" -- -f mp3
```

## Поддерживаемые сайты

- **YouTube** - Полная поддержка с автоматической обработкой cookies
- **Видеохостинги** - Оптимизированы для быстрых загрузок
- **Социальные сети** - Twitter, TikTok, Instagram и др.
- **Образовательные** - Coursera, Udemy, Khan Academy и др.
- **Прямые трансляции** - Twitch, YouTube Live и др.
- **И 1000+ других сайтов** поддерживаемых yt-dlp

## Качество и производительность

### Ограничения качества

**YouTube**: Из-за ограничений платформы качество видео часто ограничено 360p-480p без аутентификации. Это нормально и затрагивает все загрузчики.

**Другие сайты**: Обычно доступны полные опции качества (720p, 1080p и т.д.)

## Решение проблем

### YouTube "Sign in to confirm you're not a bot"

YouTube блокирует неавторизованные загрузки. Решения:

1. **Используйте cookies браузера** (рекомендуется):
   ```bash
   npm run video "URL" -- -b chrome
   ```

2. **Убедитесь что вы вошли в YouTube** в указанном браузере

3. **Попробуйте разные браузеры**: `-b safari`, `-b firefox`, `-b edge`

### URL со специальными символами

Если ваш URL содержит символы `?`, `&` или `=`:

```bash
# Всегда используйте кавычки
npm run video "https://example.com/video?id=123&t=45"

# НЕ так (будет ошибка)
npm run video https://example.com/video?id=123&t=45
```

### Примеры

```bash
# Базовое скачивание видео
npm run video "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

# Аудио в формате MP3
npm run audio "https://www.youtube.com/watch?v=dQw4w9WgXcQ" -- -f mp3

# Видео с cookies браузера
npm run video "https://www.youtube.com/watch?v=dQw4w9WgXcQ" -- -b safari

# Показать информацию о видео сначала
npm run video "https://www.youtube.com/watch?v=dQw4w9WgXcQ" -- -i

# Своя папка для сохранения
npm run video "https://www.youtube.com/watch?v=dQw4w9WgXcQ" -- -o ./music

# Подробная диагностика
npm run video "https://www.youtube.com/watch?v=dQw4w9WgXcQ" -- -v
```