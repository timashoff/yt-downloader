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
  .name('universal-downloader')
  .description('Universal downloader for any website')
  .version('1.0.0')
  .option(
    '-o, --output <dir>',
    `Save directory (default: ${DEFAULT_CONFIG.OUTPUT_DIR})`,
    DEFAULT_CONFIG.OUTPUT_DIR,
  )
  .option('-a, --audio', 'Extract audio only (explicit)')
  .option('-v, --video', 'Download video (default: audio)')
  .option(
    '-f, --format <format>',
    `Audio format: ${DEFAULT_CONFIG.SUPPORTED_FORMATS.join('|')} (default: ${DEFAULT_CONFIG.AUDIO_FORMAT})`,
    DEFAULT_CONFIG.AUDIO_FORMAT,
  )
  .option(
    '-q, --quality <quality>',
    `Video/Audio quality: ${DEFAULT_CONFIG.VIDEO_QUALITY_OPTIONS.join('|')} (default: ${DEFAULT_CONFIG.VIDEO_QUALITY})`,
    DEFAULT_CONFIG.VIDEO_QUALITY,
  )
  .option('-i, --info', 'Show video information before downloading')
  .option(
    '-b, --browser <browser>',
    'Browser for cookies: chrome|firefox|safari|edge',
  )
  .option('-c, --cookies <file>', 'Path to cookies.txt file')
  .option('--verbose', 'Show detailed yt-dlp output')
  .argument('<url>', 'Video URL to download')
  .action(async (url, options) => {
    try {
      console.log(chalk.bold.blue('\nUniversal Downloader\n'))
      
      // Determine mode: audio by default, video if -v flag is used
      const argv = process.argv;
      const hasVideoFlag = argv.includes('-v') || argv.includes('--video');
      const hasAudioFlag = argv.includes('-a') || argv.includes('--audio');
      
      // Default is audio, unless video flag is explicitly specified
      let audioOnly = true; // Default to audio
      if (hasVideoFlag) {
        audioOnly = false; // Explicit video mode
      }
      if (hasAudioFlag) {
        audioOnly = true; // Explicit audio mode (redundant but clear)
      }
      
      // Fix URL escaping - handle both URI encoding and shell escaping
      let fixedUrl = url;
      
      // First handle shell escaping (backslashes before special characters)
      fixedUrl = fixedUrl.replace(/\\([?&=])/g, '$1'); // Remove backslashes before ?, &, =
      
      // Then try URI decoding if needed
      try {
        const decoded = decodeURIComponent(fixedUrl);
        // Only use decoded version if it looks like a valid URL
        if (decoded.startsWith('http')) {
          fixedUrl = decoded;
        }
      } catch {
        // If decoding fails, keep the shell-unescaped version
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

      if (audioOnly) {
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
        audioOnly: audioOnly,
      }
      
      // Debug logging only in verbose mode
      if (options.verbose) {
        console.log('🔍 CLI Debug:', { 
          hasVideoFlag,
          hasAudioFlag,
          audioOnly,
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
