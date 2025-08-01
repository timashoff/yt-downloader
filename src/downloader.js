import youtubedl from 'youtube-dl-exec';
import path from 'path';
import fs from 'fs/promises';
import cliProgress from 'cli-progress';
import { spawn } from 'child_process';
import { DEFAULT_CONFIG, YTDLP_OPTIONS, YTDLP_AUDIO_OPTIONS, YTDLP_YOUTUBE_HEADERS, ERROR_MESSAGES, SUCCESS_MESSAGES, UI_CONSTANTS, HTTP_HEADERS } from './constants.js';
import { isYouTubeUrl } from './validator.js';
import { logError, logSuccess, logInfo, logProgress, logWarning } from './logger.js';

async function callYtDlpDirectly(url, options, progressCallback = null) {
  const { audioOnly, format, quality, outputPath, cookiesFromBrowser, verbose } = options;
  return new Promise((resolve, reject) => {
    const ytdlpPath = path.join(process.cwd(), 'node_modules/youtube-dl-exec/bin/yt-dlp');
    
    const args = [
      '--output', path.join(outputPath, `%(title).${UI_CONSTANTS.TITLE_MAX_LENGTH}s [%(id)s].%(ext)s`),
      '--no-warnings',
      '--no-check-certificates',
      '--compat-options', 'no-certifi',
      '--age-limit', '99',  // Bypass age restrictions
      url
    ];
    
    if (audioOnly) {
      args.push('--extract-audio', '--audio-format', format, '--audio-quality', quality);
    } else {
      if (quality === 'best') {
        // Use best available format (YouTube may limit quality based on region/auth)
        args.push('--format', 'bestvideo+bestaudio/best');
      } else if (quality === 'worst') {
        args.push('--format', 'worst');
      } else {
        // For resolutions like 720p, 1080p - use separate streams
        const height = quality.replace('p', '');
        args.push('--format', `bestvideo[height<=${height}]+bestaudio/best`);
      }
    }
    
    // Add site-specific headers
    if (isYouTubeUrl(url)) {
      args.push('--extractor-args', 'youtube:player_client=web,android');
      args.push('--add-header', HTTP_HEADERS.REFERER);
      args.push('--add-header', `user-agent:${HTTP_HEADERS.USER_AGENT}`);
    } else if (url.includes('pornhub.com')) {
      // Pornhub-specific options
      args.push('--add-header', 'User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
      args.push('--add-header', 'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8');
      args.push('--add-header', 'Accept-Language:en-US,en;q=0.5');
      args.push('--add-header', 'Accept-Encoding:gzip, deflate');
      args.push('--add-header', 'DNT:1');
      args.push('--add-header', 'Connection:keep-alive');
      args.push('--add-header', 'Upgrade-Insecure-Requests:1');
    }
    
    if (cookiesFromBrowser) {
      args.unshift('--cookies-from-browser', cookiesFromBrowser);
    }
    
    // Debug logging only in verbose mode
    if (verbose) {
      console.log('🔍 yt-dlp args:', args);
      console.log('🔍 Audio mode:', audioOnly);
    }
    
    const childProcess = spawn(ytdlpPath, args, {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    // Better error handling
    childProcess.on('spawn', () => {
      if (verbose) {
        console.log('🔍 yt-dlp process spawned successfully');
      }
    });
    
    let stdout = '';
    let stderr = '';
    let videoTitle = '';
    let isKilled = false;
    
    // Add timeout to prevent infinite hanging
    const timeout = setTimeout(() => {
      if (verbose) {
        console.log('🔍 TIMEOUT: Killing yt-dlp process after 30 seconds');
      }
      isKilled = true;
      childProcess.kill('SIGTERM');
      
      // Force kill if SIGTERM doesn't work
      setTimeout(() => {
        if (!childProcess.killed) {
          if (verbose) {
            console.log('🔍 FORCE KILL: Using SIGKILL');
          }
          childProcess.kill('SIGKILL');
        }
      }, 5000);
    }, 30000); // 30 second timeout
    
    childProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    childProcess.stderr.on('data', (data) => {
      const chunk = data.toString();
      stderr += chunk;
      
      // Parse video title from Destination path
      const destinationMatch = chunk.match(/\[download\] Destination: .+\/(.+?)\.[^.]+$/);
      if (destinationMatch && !videoTitle) {
        // Remove ID in square brackets from end of title
        videoTitle = destinationMatch[1].replace(/ \[[^\]]+\]$/, '');
        if (progressCallback) {
          progressCallback({ type: 'title', title: videoTitle });
        }
      }
      
      // Parse download progress
      const progressMatch = chunk.match(/\[download\]\s+(\d+\.\d+)%/);
      if (progressMatch && progressCallback) {
        const percent = parseFloat(progressMatch[1]);
        progressCallback({ type: 'progress', percent });
      }
      
      // Parse conversion stage
      if (chunk.includes('[ExtractAudio]') && progressCallback) {
        progressCallback({ type: 'convert' });
      }
    });
    
    childProcess.on('close', (code) => {
      clearTimeout(timeout); // Clear timeout if process completes normally
      
      if (isKilled) {
        const error = new Error('Process timed out after 30 seconds');
        error.stdout = stdout;
        error.stderr = stderr;
        error.exitCode = -1;
        error.timeout = true;
        reject(error);
        return;
      }
      
      if (code === UI_CONSTANTS.EXIT_CODE_SUCCESS) {
        // Log successful completion
        if (verbose) {
          logInfo('yt-dlp completed successfully');
          if (stdout) {
            logInfo('--- yt-dlp output ---');
            console.log(stdout);
            logInfo('--- End of output ---');
          }
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
      clearTimeout(timeout); // Clear timeout on error
      const err = new Error(`Process error: ${error.message}`);
      err.originalError = error;
      reject(err);
    });
  });
}

async function tryDownloadWithBrowser(url, downloadOptions, browser, progressCallback = null) {
  try {
    logInfo(`Trying cookies from ${browser}...`);
    const callOptions = {
      audioOnly: downloadOptions.audioOnly,
      format: downloadOptions.format,  // Audio format (m4a, mp3, etc.)
      quality: downloadOptions.quality, // Video/Audio quality (best, 720p, etc.)
      outputPath: path.dirname(downloadOptions.output),
      cookiesFromBrowser: browser,
      verbose: downloadOptions.verbose
    };
    
    // Debug logging only in verbose mode
    if (downloadOptions.verbose) {
      console.log('🔍 tryDownloadWithBrowser callOptions:', callOptions);
    }
    const result = await callYtDlpDirectly(url, callOptions, progressCallback);
    logSuccess(`Works with ${browser}!`);
    return { success: true, result, browser };
  } catch (error) {
    logWarning(`❌ ${browser} doesn't work`);
    if (downloadOptions.verbose) {
      logError(`Error details for ${browser}:`, error);
      logError('Full yt-dlp error:', error.message);
      logError('Stderr:', error.stderr);
      logError('Stdout:', error.stdout);
    }
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

export async function downloadVideo(url, options = {}) {
  const {
    outputDir = DEFAULT_CONFIG.OUTPUT_DIR,
    format = DEFAULT_CONFIG.AUDIO_FORMAT,
    browser = null,
    cookiesFile = null,
    verbose = false,
    audioOnly = false,
    quality: userQuality = null
  } = options;
  
  // Set quality based on user input or defaults
  const quality = userQuality || (audioOnly ? DEFAULT_CONFIG.AUDIO_QUALITY : DEFAULT_CONFIG.VIDEO_QUALITY);
  
  // Debug logging only in verbose mode
  if (verbose) {
    console.log('🔍 Downloader Debug:', { 
      audioOnly, 
      quality, 
      format,
      userQuality,
      isYoutube: isYouTubeUrl(url)
    });
  }

  const fullOutputPath = path.resolve(outputDir);
  
  if (!(await createOutputDirectory(fullOutputPath))) {
    throw new Error(ERROR_MESSAGES.DIRECTORY_ERROR);
  }

  const progressBar = new cliProgress.SingleBar({
    format: 'Download |{bar}| {percentage}% | {value}/{total} | {filename}',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true
  });

  let progressStarted = false;

  try {
    logProgress('Starting download...');

    const downloadOptions = {
      audioOnly: audioOnly,
      format: format,
      quality: quality,
      output: path.join(fullOutputPath, '%(title)s.%(ext)s'),
      verbose
    };

    let result;
    let successfulBrowser = null;
    let currentVideoTitle = '';
    
    // Callback for progress handling
    const handleProgress = (data) => {
      if (data.type === 'title') {
        currentVideoTitle = data.title;
        logInfo(`🎥 ${data.title}`);
        progressBar.start(UI_CONSTANTS.PROGRESS_MAX, UI_CONSTANTS.PROGRESS_MIN, { 
          filename: 'Detecting video...' 
        });
        progressStarted = true;
      } else if (data.type === 'progress') {
        if (progressStarted) {
          progressBar.update(Math.round(data.percent), { 
            filename: 'Downloading...' 
          });
        }
      } else if (data.type === 'convert') {
        if (progressStarted) {
          progressBar.update(UI_CONSTANTS.PROGRESS_MAX, { 
            filename: 'Converting to audio...' 
          });
        }
      }
    };

    if (cookiesFile) {
      downloadOptions.cookies = cookiesFile;
      logInfo(`Using cookies from file: ${cookiesFile}`);
      result = await youtubedl(url, downloadOptions, {
        stdio: ['ignore', 'pipe', 'pipe']
      });
    } else {
      // Only use browser cookies for YouTube
      if (isYouTubeUrl(url)) {
        const browsersToTry = browser 
          ? [browser, ...DEFAULT_CONFIG.BROWSER_FALLBACK_ORDER.filter(b => b !== browser)]
          : DEFAULT_CONFIG.BROWSER_FALLBACK_ORDER;

        logInfo('Trying to find working cookies...');
      
      // Try browsers in order
      for (const browserToTry of browsersToTry) {
        const attempt = await tryDownloadWithBrowser(url, downloadOptions, browserToTry, handleProgress);
        if (attempt.success) {
          result = attempt.result;
          successfulBrowser = attempt.browser;
          break;
        }
      }

      // If all browsers fail, try WITHOUT cookies
      if (!result) {
        logInfo('Trying to download WITHOUT cookies...');
        try {
          const callOptions = {
            audioOnly: downloadOptions.audioOnly,
            format: downloadOptions.format,
            quality: downloadOptions.quality,
            outputPath: path.dirname(downloadOptions.output),
            cookiesFromBrowser: null,
            verbose: downloadOptions.verbose
          };
          result = await callYtDlpDirectly(url, callOptions, handleProgress);
          logSuccess('Works WITHOUT cookies!');
        } catch (error) {
          logError('Full error WITHOUT cookies:', error.message);
          logError('Stderr:', error.stderr);
          logError('Stdout:', error.stdout);
          throw new Error('Failed to download even without cookies');
        }
      }
      } else {
        // For non-YouTube sites, try direct download without cookies
        logInfo('Downloading from non-YouTube site...');
        try {
          const callOptions = {
            audioOnly: downloadOptions.audioOnly,
            format: downloadOptions.format,
            quality: downloadOptions.quality,
            outputPath: path.dirname(downloadOptions.output),
            cookiesFromBrowser: null,
            verbose: downloadOptions.verbose
          };
          result = await callYtDlpDirectly(url, callOptions, handleProgress);
          logSuccess('Download successful!');
        } catch (error) {
          if (error.timeout) {
            logError('Download timed out after 30 seconds - site may be unresponsive or blocked');
          } else {
            logError('Download failed:', error.message);
          }
          // Show error details only in verbose mode
          if (downloadOptions.verbose) {
            console.log('🔍 Full error details:', error);
            console.log('🔍 Stderr:', error.stderr);
            console.log('🔍 Stdout:', error.stdout);
            console.log('🔍 Exit code:', error.exitCode);
            console.log('🔍 Timeout:', error.timeout);
          }
          throw new Error('Failed to download from this site');
        }
      }
    }

    if (progressStarted) {
      progressBar.update(UI_CONSTANTS.PROGRESS_MAX, { filename: 'Completed!' });
      progressBar.stop();
    }

    logSuccess(SUCCESS_MESSAGES.DOWNLOAD_COMPLETE);
    
    // Show only the latest created file
    try {
      const files = await fs.readdir(fullOutputPath);
      const mediaFiles = audioOnly 
        ? files.filter(file => 
            file.endsWith('.m4a') || file.endsWith('.mp3') || 
            file.endsWith('.wav') || file.endsWith('.flac')
          )
        : files.filter(file => 
            file.endsWith('.mp4') || file.endsWith('.mkv') || file.endsWith('.webm') ||
            file.endsWith('.m4a') || file.endsWith('.mp3') || file.endsWith('.wav') || file.endsWith('.flac')
          );
      
      // Sort by modification time (newest first)
      const filesWithStats = await Promise.all(
        mediaFiles.map(async (file) => {
          const filePath = path.join(fullOutputPath, file);
          const stat = await fs.stat(filePath);
          return { file, mtime: stat.mtime };
        })
      );
      
      filesWithStats.sort((a, b) => b.mtime - a.mtime);
      
      if (filesWithStats.length > UI_CONSTANTS.PROGRESS_MIN) {
        const latestFile = filesWithStats[0].file;
        console.log(latestFile);
        
        if (verbose) {
          logInfo(`Folder: ${fullOutputPath}`);
          if (successfulBrowser) {
            logInfo(`Cookies: ${successfulBrowser}`);
          }
        }
      } else {
        logWarning(`${audioOnly ? 'Audio' : 'Media'} file not found! Possible download issue.`);
        if (verbose) {
          logInfo(`Check folder: ${fullOutputPath}`);
        }
      }
    } catch (error) {
      logWarning('Unable to check created files:', error.message);
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
      logInfo('💡 Solution:');
      logInfo('   1. npm start -- "URL" -b safari');
      logInfo('   2. Or: node src/cli.js "URL" -b safari');
      logInfo('   3. Make sure you are logged into YouTube in browser');
    } else if (errorMessage.includes('ffmpeg') || errorMessage.includes('ffprobe')) {
      logError(ERROR_MESSAGES.FFMPEG_NOT_FOUND);
      logInfo('💡 FFmpeg Installation:');
      logInfo('   macOS: brew install ffmpeg');
      logInfo('   Linux: sudo apt install ffmpeg');
      logInfo('   Windows: download from https://ffmpeg.org/download.html');
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
    logError('Unable to get video information');
    return null;
  }
}