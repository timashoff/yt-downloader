#!/usr/bin/env node

import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { Command } from 'commander'
import chalk from 'chalk'
import {
  validateUrl,
  validateFormat,
  validateAudioQuality,
  validateVideoQuality,
  validateBrowser,
} from './validator.js'
import { downloadVideo, updateYtDlp } from './downloader.js'
import { DEFAULT_CONFIG, ERROR_MESSAGES, UI_CONSTANTS, YTDLP } from './constants.js'
import { logError, logWarning } from './logger.js'
import { removeSafariCookiesSync } from './safari.js'
import { spinner } from './spinner.js'

const { version } = createRequire(import.meta.url)('../package.json')

// Ctrl+C: yt-dlp stops on its own (it gets the same signal) and keeps the partial
// file, so running the same command again resumes the download.
process.on('SIGINT', () => {
  spinner.cleanup()
  removeSafariCookiesSync()
  console.log(chalk.yellow('\nCancelled. Run the same command again to resume.'))
  process.exit(UI_CONSTANTS.EXIT_CODE_INTERRUPTED)
})

function fixUrlEscaping(url) {
  // First handle shell escaping (backslashes before special characters)
  let fixedUrl = url.replace(/\\([?&=])/g, '$1'); // Remove backslashes before ?, &, =

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
  return fixedUrl
}

function fail(message) {
  logError(message)
  process.exit(UI_CONSTANTS.EXIT_CODE_ERROR)
}

const program = new Command()

program
  .name('udav')
  .description('Download audio (default) or video from YouTube and 1000+ other sites')
  .version(version)
  .option('-o, --output <dir>', 'Save directory (default: ~/Downloads/Audio|Video/<site>)')
  .option('-a, --audio', 'Extract audio only (default mode)')
  .option('-v, --video', 'Download video (MP4: H.264 + AAC, plays everywhere)')
  .option(
    '-f, --format <format>',
    `Audio format: ${DEFAULT_CONFIG.SUPPORTED_FORMATS.join('|')}`,
    DEFAULT_CONFIG.AUDIO_FORMAT,
  )
  .option(
    '-q, --quality <quality>',
    `Video: ${DEFAULT_CONFIG.VIDEO_QUALITY_OPTIONS.join('|')} (max = highest resolution, any codec); audio: ${DEFAULT_CONFIG.AUDIO_QUALITY_OPTIONS.join('|')}`,
    DEFAULT_CONFIG.VIDEO_QUALITY,
  )
  .option('-i, --info', 'Show title, author and duration before downloading')
  .option(
    '-b, --browser <browser>',
    `Always use cookies from this browser: ${DEFAULT_CONFIG.SUPPORTED_BROWSERS.join('|')}`,
  )
  .option('-c, --cookies <file>', 'Path to cookies.txt file')
  .option('-U, --update', 'Update yt-dlp now (also checked automatically once a day)')
  .option('--verbose', 'Show detailed yt-dlp output')
  .argument('[url]', 'Video, track or playlist URL (in quotes)')
  .action(async (url, options) => {
    try {
      console.log(chalk.bold.blue('\nUniversal Downloader\n'))

      const nodeMajor = Number(process.versions.node.split('.')[0])
      if (nodeMajor < YTDLP.MIN_NODE_MAJOR) {
        logWarning(`Node.js ${YTDLP.MIN_NODE_MAJOR}+ is needed for YouTube (current: ${process.versions.node}).`)
      }

      if (!url) {
        if (options.update) {
          process.exitCode = (await updateYtDlp()) ? UI_CONSTANTS.EXIT_CODE_SUCCESS : UI_CONSTANTS.EXIT_CODE_ERROR
          return
        }
        program.help({ error: true })
      }

      // Audio by default; -a wins if both -a and -v are given
      const audioOnly = Boolean(options.audio) || !options.video

      url = fixUrlEscaping(url)

      const validation = validateUrl(url)
      if (!validation.isValid) fail(validation.error)

      if (!(await validateFormat(options.format))) {
        fail(`${ERROR_MESSAGES.INVALID_FORMAT} Supported formats: ${DEFAULT_CONFIG.SUPPORTED_FORMATS.join(', ')}`)
      }

      if (audioOnly) {
        // Validate audio quality for audio extraction
        if (!(await validateAudioQuality(options.quality))) {
          fail(`${ERROR_MESSAGES.INVALID_AUDIO_QUALITY} Supported options: ${DEFAULT_CONFIG.AUDIO_QUALITY_OPTIONS.join(', ')}`)
        }
      } else if (!(await validateVideoQuality(options.quality))) {
        fail(`${ERROR_MESSAGES.INVALID_VIDEO_QUALITY} Supported options: ${DEFAULT_CONFIG.VIDEO_QUALITY_OPTIONS.join(', ')}`)
      }

      if (!(await validateBrowser(options.browser))) {
        fail(`${ERROR_MESSAGES.INVALID_BROWSER} Supported browsers: ${DEFAULT_CONFIG.SUPPORTED_BROWSERS.join(', ')}`)
      }

      if (options.cookies) {
        try {
          await fs.access(options.cookies)
        } catch {
          fail(`${ERROR_MESSAGES.COOKIES_FILE_NOT_FOUND} ${options.cookies}`)
        }
      }

      const result = await downloadVideo(url, {
        outputDir: options.output,
        format: options.format.toLowerCase(),
        quality: options.quality.toLowerCase(),
        browser: options.browser,
        cookiesFile: options.cookies,
        verbose: options.verbose,
        audioOnly,
        showInfo: options.info,
        forceUpdate: options.update,
      })

      process.exitCode = result.success ? UI_CONSTANTS.EXIT_CODE_SUCCESS : UI_CONSTANTS.EXIT_CODE_ERROR
    } catch (error) {
      spinner.cleanup()
      logError(`Unexpected error: ${error.message}`, error)
      process.exitCode = UI_CONSTANTS.EXIT_CODE_ERROR
    }
  })

program.parse()
