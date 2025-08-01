export const DEFAULT_CONFIG = {
  OUTPUT_DIR: './downloads',
  AUDIO_FORMAT: 'm4a',
  AUDIO_QUALITY: 'best',
  SUPPORTED_FORMATS: ['mp3', 'm4a', 'wav', 'flac'],
  QUALITY_OPTIONS: ['best', 'worst'],
  SUPPORTED_BROWSERS: ['chrome', 'firefox', 'safari', 'edge'],
  BROWSER_FALLBACK_ORDER: ['safari', 'chrome', 'firefox', 'edge']
};

export const YOUTUBE_DOMAINS = [
  'youtube.com',
  'www.youtube.com',
  'youtu.be',
  'm.youtube.com',
  'music.youtube.com'
];

export const ERROR_MESSAGES = {
  INVALID_URL: 'Неверный YouTube URL. Поддерживаются только ссылки на YouTube.',
  MISSING_URL: 'URL не указан. Пожалуйста, укажите ссылку на YouTube видео.',
  DOWNLOAD_FAILED: 'Ошибка при скачивании. Проверьте URL и интернет-соединение.',
  INVALID_FORMAT: 'Неподдерживаемый формат аудио.',
  INVALID_QUALITY: 'Неподдерживаемое качество аудио.',
  DIRECTORY_ERROR: 'Ошибка при создании директории.',
  INVALID_BROWSER: 'Неподдерживаемый браузер.',
  COOKIES_FILE_NOT_FOUND: 'Файл cookies не найден.',
  YOUTUBE_BOT_DETECTION: 'YouTube заблокировал доступ. Нужны cookies из браузера.',
  FFMPEG_NOT_FOUND: 'FFmpeg не найден. Установите FFmpeg для обработки аудио.'
};

export const SUCCESS_MESSAGES = {
  DOWNLOAD_COMPLETE: 'Скачивание завершено успешно!',
  DIRECTORY_CREATED: 'Директория создана:'
};

export const UI_CONSTANTS = {
  TITLE_MAX_LENGTH: 200,
  PROGRESS_MAX: 100,
  PROGRESS_MIN: 0,
  SECONDS_IN_MINUTE: 60,
  TIME_PAD_LENGTH: 2,
  EXIT_CODE_SUCCESS: 0,
  EXIT_CODE_ERROR: 1,
  PROGRESS_CHUNK_SIZE: 10485760
};

export const HTTP_HEADERS = {
  USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  REFERER: 'referer:youtube.com'
};

export const YTDLP_OPTIONS = {
  extractAudio: true,
  audioFormat: DEFAULT_CONFIG.AUDIO_FORMAT,
  audioQuality: DEFAULT_CONFIG.AUDIO_QUALITY,
  output: `%(title).${UI_CONSTANTS.TITLE_MAX_LENGTH}s [%(id)s].%(ext)s`,
  windowsFilenames: false,
  noWarnings: true,
  noCheckCertificates: true,
  compatOptions: ['no-certifi'],
  extractorArgs: 'youtube:player_client=web,android',
  addHeader: [
    HTTP_HEADERS.REFERER,
    `user-agent:${HTTP_HEADERS.USER_AGENT}`,
    'accept:text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'accept-language:en-US,en;q=0.9',
    'accept-encoding:gzip, deflate, br',
    'sec-fetch-dest:document',
    'sec-fetch-mode:navigate',
    'sec-fetch-site:none',
    'sec-fetch-user:?1',
    'upgrade-insecure-requests:1'
  ]
};