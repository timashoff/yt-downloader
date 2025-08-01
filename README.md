# YouTube Audio Downloader

CLI инструмент для скачивания аудио с YouTube видео.

## Установка

```bash
npm install
```

## Использование

### Базовое использование
```bash
# Через npm (с двойным дефисом для передачи аргументов)
npm start -- "https://www.youtube.com/watch?v=VIDEO_ID"

# Прямой запуск (рекомендуется)
node src/cli.js "https://www.youtube.com/watch?v=VIDEO_ID"
```

### С дополнительными параметрами
```bash
# Через npm
npm start -- "https://www.youtube.com/watch?v=VIDEO_ID" -o ./music -f mp3 -q best

# Прямой запуск (проще и надежнее)
node src/cli.js "https://www.youtube.com/watch?v=VIDEO_ID" -o ./music -f mp3 -q best
```

### Опции

- `-o, --output <dir>` - Папка для сохранения (по умолчанию: ./downloads)
- `-f, --format <format>` - Формат аудио: mp3|m4a|wav|flac (по умолчанию: m4a)
- `-q, --quality <quality>` - Качество аудио: best|worst (по умолчанию: best)
- `-i, --info` - Показать информацию о видео перед скачиванием
- `-b, --browser <browser>` - Браузер для cookies: chrome|firefox|safari|edge
- `-c, --cookies <file>` - Путь к файлу cookies.txt
- `-h, --help` - Показать справку

### Примеры

```bash
# Скачать в формате m4a в папку downloads (прямой запуск)
node src/cli.js "https://youtu.be/dQw4w9WgXcQ"

# Через npm (с двойным дефисом)
npm start -- "https://youtu.be/dQw4w9WgXcQ"

# Скачать в формате mp3 в папку music
node src/cli.js "https://youtu.be/dQw4w9WgXcQ" -f mp3 -o ./music

# Показать информацию о видео и скачать
node src/cli.js "https://youtu.be/dQw4w9WgXcQ" -i

# Скачать в худшем качестве
node src/cli.js "https://youtu.be/dQw4w9WgXcQ" -q worst

# Использовать cookies из Firefox
node src/cli.js "https://youtu.be/dQw4w9WgXcQ" -b firefox

# Использовать файл cookies  
node src/cli.js "https://youtu.be/dQw4w9WgXcQ" -c ./cookies.txt
```

## Решение проблем с YouTube

### Ошибка "Sign in to confirm you're not a bot"

Если вы получаете эту ошибку, YouTube блокирует скачивание. Решения:

1. **Использовать cookies из браузера** (рекомендуется):
   ```bash
   node src/cli.js "URL" -b chrome
   # или через npm
   npm start -- "URL" -b chrome
   ```

2. **Экспортировать cookies в файл**:
   - Установите расширение "Get cookies.txt" в Chrome/Firefox
   - Откройте YouTube и войдите в аккаунт
   - Экспортируйте cookies в файл cookies.txt
   - Используйте: `node src/cli.js "URL" -c cookies.txt`

3. **Проверьте, что вы вошли в YouTube** в указанном браузере

### Ошибка "Failed to extract any player response"

Эта ошибка означает, что YouTube заблокировал доступ без аутентификации:

1. **Используйте cookies из браузера**: `node src/cli.js "URL" -b safari`
2. **Убедитесь, что вы вошли в YouTube** в указанном браузере
3. **Попробуйте разные браузеры**: -b chrome, -b firefox

## Глобальная установка

Для использования как глобальная команда:

```bash
npm install -g .
yt-audio "https://youtu.be/dQw4w9WgXcQ"
```

## Требования

- Node.js >= 16.0.0
- Python 3.7+ (для yt-dlp)
- FFmpeg (для обработки аудио)

### Установка FFmpeg

**macOS:**
```bash
brew install ffmpeg
```

**Windows:**
Скачайте с https://ffmpeg.org/download.html

**Linux:**
```bash
sudo apt install ffmpeg  # Ubuntu/Debian
sudo yum install ffmpeg  # CentOS/RHEL
```

## Зависимости

- youtube-dl-exec - Обёртка для yt-dlp
- commander - Парсинг аргументов командной строки
- chalk - Цветной вывод в консоль
- cli-progress - Прогресс-бар