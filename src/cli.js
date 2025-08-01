#!/usr/bin/env node

import { Command } from 'commander'
import chalk from 'chalk'
import {
  validateUrl,
  validateFormat,
  validateAudioQuality,
  validateVideoQuality,
  validateBrowser,
} from './validator.js'
import { downloadVideo, getVideoInfo } from './downloader.js'
import { DEFAULT_CONFIG, ERROR_MESSAGES, UI_CONSTANTS } from './constants.js'
import { logError, logSuccess, logInfo } from './logger.js'

const program = new Command()

program
  .name('video-downloader')
  .description('Universal video downloader for any website')
  .version('1.0.0')
  .option(
    '-o, --output <dir>',
    `Save directory (default: ${DEFAULT_CONFIG.OUTPUT_DIR})`,
    DEFAULT_CONFIG.OUTPUT_DIR,
  )
  .option('-a, --audio', 'Extract audio only (default: download video)')
  .option(
    '-f, --format <format>',
    `Audio format (only with -a): ${DEFAULT_CONFIG.SUPPORTED_FORMATS.join('|')} (default: ${DEFAULT_CONFIG.AUDIO_FORMAT})`,
    DEFAULT_CONFIG.AUDIO_FORMAT,
  )
  .option(
    '-q, --quality <quality>',
    `Video quality: ${DEFAULT_CONFIG.VIDEO_QUALITY_OPTIONS.join('|')} (default: ${DEFAULT_CONFIG.VIDEO_QUALITY})`,
    DEFAULT_CONFIG.VIDEO_QUALITY,
  )
  .option('-i, --info', 'Show video information before downloading')
  .option(
    '-b, --browser <browser>',
    'Browser for cookies: chrome|firefox|safari|edge',
  )
  .option('-c, --cookies <file>', 'Path to cookies.txt file')
  .option('-v, --verbose', 'Show detailed yt-dlp output')
  .argument('<url>', 'Video URL to download')
  .action(async (url, options) => {
    try {
      console.log(chalk.bold.blue('\nUniversal Video Downloader\n'))
      
      // Manual argv parsing as fallback for Commander.js issues
      const argv = process.argv;
      const hasAudioFlag = argv.includes('-a') || argv.includes('--audio');
      
      // Override Commander.js if manual detection finds the flag
      if (hasAudioFlag && !options.audio) {
        options.audio = true;
      }
      
      // Fix URL escaping using proper decoding instead of regex
      let fixedUrl = url;
      try {
        // Handle shell escaping by using decodeURIComponent if needed
        fixedUrl = decodeURIComponent(url);
      } catch {
        // If decoding fails, try simple string replacement
        fixedUrl = url.replace(/\\\\/g, '');
      }
      
      // Use fixed URL instead of original
      url = fixedUrl;

      const validation = validateUrl(url)
      if (!validation.isValid) {
        logError(validation.error)
        process.exit(UI_CONSTANTS.EXIT_CODE_ERROR)
      }

      if (!(await validateFormat(options.format))) {
        logError(
          `${ERROR_MESSAGES.INVALID_FORMAT} Supported formats: ${DEFAULT_CONFIG.SUPPORTED_FORMATS.join(', ')}`,
        )
        process.exit(UI_CONSTANTS.EXIT_CODE_ERROR)
      }

      if (options.audio) {
        // Validate audio quality for audio extraction
        if (!(await validateAudioQuality(options.quality))) {
          logError(
            `${ERROR_MESSAGES.INVALID_AUDIO_QUALITY} Supported options: ${DEFAULT_CONFIG.AUDIO_QUALITY_OPTIONS.join(', ')}`,
          )
          process.exit(UI_CONSTANTS.EXIT_CODE_ERROR)
        }
      } else {
        // Validate video quality for video download
        if (!(await validateVideoQuality(options.quality))) {
          logError(
            `${ERROR_MESSAGES.INVALID_VIDEO_QUALITY} Supported options: ${DEFAULT_CONFIG.VIDEO_QUALITY_OPTIONS.join(', ')}`,
          )
          process.exit(UI_CONSTANTS.EXIT_CODE_ERROR)
        }
      }

      if (!(await validateBrowser(options.browser))) {
        logError(
          `${ERROR_MESSAGES.INVALID_BROWSER} Supported browsers: ${DEFAULT_CONFIG.SUPPORTED_BROWSERS.join(', ')}`,
        )
        process.exit(UI_CONSTANTS.EXIT_CODE_ERROR)
      }

      if (options.info) {
        logInfo('Getting video information...')
        const videoInfo = await getVideoInfo(url)
        if (videoInfo) {
          console.log(chalk.cyan('\n📹 Video Information:'))
          console.log(chalk.white(`Title: ${videoInfo.title}`))
          console.log(chalk.white(`Author: ${videoInfo.uploader}`))
          if (videoInfo.duration) {
            const minutes = Math.floor(
              videoInfo.duration / UI_CONSTANTS.SECONDS_IN_MINUTE,
            )
            const seconds = videoInfo.duration % UI_CONSTANTS.SECONDS_IN_MINUTE
            console.log(
              chalk.white(
                `Duration: ${minutes}:${seconds.toString().padStart(UI_CONSTANTS.TIME_PAD_LENGTH, '0')}`,
              ),
            )
          }
          console.log('')
        }
      }

      const downloadOptions = {
        outputDir: options.output,
        format: options.format.toLowerCase(),
        quality: options.quality.toLowerCase(),
        browser: options.browser,
        cookiesFile: options.cookies,
        verbose: options.verbose,
        audioOnly: options.audio,
      }
      
      // Debug logging only in verbose mode
      if (options.verbose) {
        console.log('🔍 CLI Debug:', { 
          audio: options.audio, 
          audioOnly: options.audio,
          quality: options.quality,
          url: url
        });
      }

      const result = await downloadVideo(url, downloadOptions)

      if (result.success) {
        // console.log(chalk.green.bold('\n✅ Download completed successfully!\n'));
      } else {
        process.exit(UI_CONSTANTS.EXIT_CODE_ERROR)
      }
    } catch (error) {
      logError('Unexpected error:', error)
      process.exit(1)
    }
  })

program.parse()
