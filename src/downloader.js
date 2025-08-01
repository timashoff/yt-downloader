import youtubedl from 'youtube-dl-exec';
import path from 'path';
import fs from 'fs/promises';
import cliProgress from 'cli-progress';
import { spawn } from 'child_process';
import { DEFAULT_CONFIG, YTDLP_OPTIONS, ERROR_MESSAGES, SUCCESS_MESSAGES, UI_CONSTANTS, HTTP_HEADERS } from './constants.js';
import { logError, logSuccess, logInfo, logProgress, logWarning } from './logger.js';

async function callYtDlpDirectly(url, audioFormat, audioQuality, outputPath, cookiesFromBrowser = null) {
  return new Promise((resolve, reject) => {
    const ytdlpPath = path.join(process.cwd(), 'node_modules/youtube-dl-exec/bin/yt-dlp');
    
    const args = [
      '--extract-audio',
      '--audio-format', audioFormat,
      '--audio-quality', audioQuality,
      '--output', path.join(outputPath, `%(title).${UI_CONSTANTS.TITLE_MAX_LENGTH}s [%(id)s].%(ext)s`),
      '--no-warnings',
      '--no-check-certificates',
      '--compat-options', 'no-certifi',
      '--extractor-args', 'youtube:player_client=web,android',
      '--add-header', HTTP_HEADERS.REFERER,
      '--add-header', `user-agent:${HTTP_HEADERS.USER_AGENT}`,
      url
    ];
    
    if (cookiesFromBrowser) {
      args.unshift('--cookies-from-browser', cookiesFromBrowser);
    }
    
    const childProcess = spawn(ytdlpPath, args, {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    
    childProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    childProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    childProcess.on('close', (code) => {
      if (code === UI_CONSTANTS.EXIT_CODE_SUCCESS) {
        // Логируем успешное завершение
        logInfo('yt-dlp завершился успешно');
        if (stdout) {
          logInfo('--- Вывод yt-dlp ---');
          console.log(stdout);
          logInfo('--- Конец вывода ---');
        }
        resolve({ success: true, stdout, stderr });
      } else {
        const error = new Error(`yt-dlp failed with exit code ${code}`);
        error.stdout = stdout;
        error.stderr = stderr;
        error.exitCode = code;
        reject(error);
      }
    });
    
    childProcess.on('error', (error) => {
      const err = new Error(`Process error: ${error.message}`);
      err.originalError = error;
      reject(err);
    });
  });
}

async function tryDownloadWithBrowser(url, downloadOptions, browser) {
  try {
    logInfo(`Пробуем cookies из ${browser}...`);
    const result = await callYtDlpDirectly(
      url, 
      downloadOptions.audioFormat, 
      downloadOptions.audioQuality, 
      path.dirname(downloadOptions.output),
      browser
    );
    logSuccess(`✅ Работает с ${browser}!`);
    return { success: true, result, browser };
  } catch (error) {
    logWarning(`❌ ${browser} не работает`);
    logError(`Детали ошибки ${browser}:`, error);
    logError('Полная ошибка от yt-dlp:', error.message);
    logError('Stderr:', error.stderr);
    logError('Stdout:', error.stdout);
    return { success: false, error: error.message };
  }
}

export async function createOutputDirectory(outputDir) {
  try {
    await fs.access(outputDir);
    return true;
  } catch {
    try {
      await fs.mkdir(outputDir, { recursive: true });
      logInfo(`${SUCCESS_MESSAGES.DIRECTORY_CREATED} ${outputDir}`);
      return true;
    } catch (error) {
      logError(`${ERROR_MESSAGES.DIRECTORY_ERROR} ${error.message}`);
      return false;
    }
  }
}

export async function downloadAudio(url, options = {}) {
  const {
    outputDir = DEFAULT_CONFIG.OUTPUT_DIR,
    format = DEFAULT_CONFIG.AUDIO_FORMAT,
    quality = DEFAULT_CONFIG.AUDIO_QUALITY,
    browser = null,
    cookiesFile = null
  } = options;

  const fullOutputPath = path.resolve(outputDir);
  
  if (!(await createOutputDirectory(fullOutputPath))) {
    throw new Error(ERROR_MESSAGES.DIRECTORY_ERROR);
  }

  const progressBar = new cliProgress.SingleBar({
    format: 'Скачивание |{bar}| {percentage}% | {value}/{total} | {filename}',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true
  });

  let progressStarted = false;

  try {
    logProgress('Начинаем скачивание...');

    const downloadOptions = {
      ...YTDLP_OPTIONS,
      audioFormat: format,
      audioQuality: quality,
      output: path.join(fullOutputPath, '%(title)s.%(ext)s')
    };

    let result;
    let successfulBrowser = null;

    if (cookiesFile) {
      downloadOptions.cookies = cookiesFile;
      logInfo(`Используем cookies из файла: ${cookiesFile}`);
      result = await youtubedl(url, downloadOptions, {
        stdio: ['ignore', 'pipe', 'pipe']
      });
    } else {
      // Определяем список браузеров для попытки
      const browsersToTry = browser 
        ? [browser, ...DEFAULT_CONFIG.BROWSER_FALLBACK_ORDER.filter(b => b !== browser)]
        : DEFAULT_CONFIG.BROWSER_FALLBACK_ORDER;

      logInfo('Пробуем найти рабочие cookies...');
      
      // Пробуем браузеры по порядку
      for (const browserToTry of browsersToTry) {
        const attempt = await tryDownloadWithBrowser(url, downloadOptions, browserToTry);
        if (attempt.success) {
          result = attempt.result;
          successfulBrowser = attempt.browser;
          break;
        }
      }

      // Если все браузеры не работают, попробуем БЕЗ cookies
      if (!result) {
        logInfo('Пробуем скачать БЕЗ cookies...');
        try {
          result = await callYtDlpDirectly(
            url, 
            downloadOptions.audioFormat, 
            downloadOptions.audioQuality, 
            path.dirname(downloadOptions.output),
            null
          );
          logSuccess('✅ Работает БЕЗ cookies!');
        } catch (error) {
          logError('Полная ошибка БЕЗ cookies:', error.message);
          logError('Stderr:', error.stderr);
          logError('Stdout:', error.stdout);
          throw new Error('Не удалось скачать даже без cookies');
        }
      }
    }

    if (!progressStarted) {
      progressBar.start(UI_CONSTANTS.PROGRESS_MAX, UI_CONSTANTS.PROGRESS_MIN, { filename: 'Обработка...' });
      progressStarted = true;
    }

    progressBar.update(UI_CONSTANTS.PROGRESS_MAX, { filename: 'Завершено!' });
    progressBar.stop();

    logSuccess(SUCCESS_MESSAGES.DOWNLOAD_COMPLETE);
    if (successfulBrowser) {
      logInfo(`Использованы cookies из: ${successfulBrowser}`);
    }
    logInfo(`Файл сохранён в: ${fullOutputPath}`);
    
    // Проверяем какие файлы были созданы
    try {
      const files = await fs.readdir(fullOutputPath);
      const audioFiles = files.filter(file => 
        file.endsWith('.m4a') || file.endsWith('.mp3') || 
        file.endsWith('.wav') || file.endsWith('.flac')
      );
      if (audioFiles.length > UI_CONSTANTS.PROGRESS_MIN) {
        logInfo(`Созданные аудиофайлы:`);
        audioFiles.forEach(file => logInfo(`  - ${file}`));
      } else {
        logWarning('Аудиофайлы не найдены! Возможная проблема с конвертацией.');
      }
    } catch (error) {
      logWarning('Не удалось проверить созданные файлы:', error.message);
    }

    return {
      success: true,
      outputPath: fullOutputPath,
      result
    };

  } catch (error) {
    if (progressStarted) {
      progressBar.stop();
    }
    
    const errorMessage = error.message || error.toString();
    
    if (errorMessage.includes('Sign in to confirm') || 
        errorMessage.includes('bot') || 
        errorMessage.includes('Failed to extract any player response')) {
      logError(ERROR_MESSAGES.YOUTUBE_BOT_DETECTION);
      logInfo('💡 Решение:');
      logInfo('   1. npm start -- "URL" -b safari');
      logInfo('   2. Или: node src/cli.js "URL" -b safari');
      logInfo('   3. Убедитесь, что вы вошли в YouTube в браузере');
    } else if (errorMessage.includes('ffmpeg') || errorMessage.includes('ffprobe')) {
      logError(ERROR_MESSAGES.FFMPEG_NOT_FOUND);
      logInfo('💡 Установка FFmpeg:');
      logInfo('   macOS: brew install ffmpeg');
      logInfo('   Linux: sudo apt install ffmpeg');
      logInfo('   Windows: скачайте с https://ffmpeg.org/download.html');
    } else {
      logError(`${ERROR_MESSAGES.DOWNLOAD_FAILED} ${errorMessage}`);
    }
    
    return {
      success: false,
      error: errorMessage
    };
  }
}

export async function getVideoInfo(url) {
  try {
    const info = await youtubedl(url, {
      dumpSingleJson: true,
      noWarnings: true
    });
    
    return {
      title: info.title,
      duration: info.duration,
      uploader: info.uploader,
      description: info.description
    };
  } catch (error) {
    logError('Не удалось получить информацию о видео');
    return null;
  }
}