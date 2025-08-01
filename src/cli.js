#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { validateYouTubeUrl, validateFormat, validateQuality, validateBrowser } from './validator.js';
import { downloadAudio, getVideoInfo } from './downloader.js';
import { DEFAULT_CONFIG, ERROR_MESSAGES, UI_CONSTANTS } from './constants.js';
import { logError, logSuccess, logInfo } from './logger.js';

const program = new Command();

program
  .name('yt-audio')
  .description('CLI инструмент для скачивания аудио с YouTube')
  .version('1.0.0')
  .argument('<url>', 'YouTube URL для скачивания')
  .option('-o, --output <dir>', `Папка для сохранения (по умолчанию: ${DEFAULT_CONFIG.OUTPUT_DIR})`, DEFAULT_CONFIG.OUTPUT_DIR)
  .option('-f, --format <format>', `Формат аудио: ${DEFAULT_CONFIG.SUPPORTED_FORMATS.join('|')} (по умолчанию: ${DEFAULT_CONFIG.AUDIO_FORMAT})`, DEFAULT_CONFIG.AUDIO_FORMAT)
  .option('-q, --quality <quality>', `Качество аудио: ${DEFAULT_CONFIG.QUALITY_OPTIONS.join('|')} (по умолчанию: ${DEFAULT_CONFIG.AUDIO_QUALITY})`, DEFAULT_CONFIG.AUDIO_QUALITY)
  .option('-i, --info', 'Показать информацию о видео перед скачиванием')
  .option('-b, --browser <browser>', 'Браузер для cookies: chrome|firefox|safari|edge')
  .option('-c, --cookies <file>', 'Путь к файлу cookies.txt')
  .action(async (url, options) => {
    try {
      console.log(chalk.bold.blue('\n🎵 YouTube Audio Downloader\n'));

      const validation = validateYouTubeUrl(url);
      if (!validation.isValid) {
        logError(validation.error);
        process.exit(UI_CONSTANTS.EXIT_CODE_ERROR);
      }

      if (!(await validateFormat(options.format))) {
        logError(`${ERROR_MESSAGES.INVALID_FORMAT} Поддерживаемые форматы: ${DEFAULT_CONFIG.SUPPORTED_FORMATS.join(', ')}`);
        process.exit(UI_CONSTANTS.EXIT_CODE_ERROR);
      }

      if (!(await validateQuality(options.quality))) {
        logError(`${ERROR_MESSAGES.INVALID_QUALITY} Поддерживаемые опции: ${DEFAULT_CONFIG.QUALITY_OPTIONS.join(', ')}`);
        process.exit(UI_CONSTANTS.EXIT_CODE_ERROR);
      }

      if (!(await validateBrowser(options.browser))) {
        logError(`${ERROR_MESSAGES.INVALID_BROWSER} Поддерживаемые браузеры: ${DEFAULT_CONFIG.SUPPORTED_BROWSERS.join(', ')}`);
        process.exit(UI_CONSTANTS.EXIT_CODE_ERROR);
      }

      if (options.info) {
        logInfo('Получение информации о видео...');
        const videoInfo = await getVideoInfo(url);
        if (videoInfo) {
          console.log(chalk.cyan('\n📹 Информация о видео:'));
          console.log(chalk.white(`Название: ${videoInfo.title}`));
          console.log(chalk.white(`Автор: ${videoInfo.uploader}`));
          if (videoInfo.duration) {
            const minutes = Math.floor(videoInfo.duration / UI_CONSTANTS.SECONDS_IN_MINUTE);
            const seconds = videoInfo.duration % UI_CONSTANTS.SECONDS_IN_MINUTE;
            console.log(chalk.white(`Длительность: ${minutes}:${seconds.toString().padStart(UI_CONSTANTS.TIME_PAD_LENGTH, '0')}`));
          }
          console.log('');
        }
      }

      const downloadOptions = {
        outputDir: options.output,
        format: options.format.toLowerCase(),
        quality: options.quality.toLowerCase(),
        browser: options.browser,
        cookiesFile: options.cookies
      };

      const result = await downloadAudio(url, downloadOptions);

      if (result.success) {
        console.log(chalk.green.bold('\n✅ Скачивание завершено успешно!\n'));
      } else {
        process.exit(UI_CONSTANTS.EXIT_CODE_ERROR);
      }

    } catch (error) {
      logError('Непредвиденная ошибка:', error);
      process.exit(1);
    }
  });

program.parse();