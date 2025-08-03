import youtubedl from 'youtube-dl-exec';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { spawn } from 'child_process';
import { DEFAULT_CONFIG, YTDLP_OPTIONS, YTDLP_AUDIO_OPTIONS, YTDLP_YOUTUBE_HEADERS, ERROR_MESSAGES, SUCCESS_MESSAGES, UI_CONSTANTS, HTTP_HEADERS } from './constants.js';
import { isYouTubeUrl } from './validator.js';
import { logError, logSuccess, logInfo, logProgress, logWarning } from './logger.js';
import { spinner } from './spinner.js';

function getSystemDownloadsPath() {
  return path.join(os.homedir(), 'Downloads');
}

function extractDomain(url) {
  try {
    const hostname = new URL(url).hostname;
    // Remove prefixes like www., m., mobile.
    const cleanHostname = hostname.replace(/^(www\.|m\.|mobile\.)/, '');
    
    // Special handling for YouTube domains
    if (cleanHostname === 'youtu.be' || cleanHostname === 'youtube.com' || cleanHostname.endsWith('.youtube.com')) {
      return 'youtube';
    }
    
    const parts = cleanHostname.split('.');
    
    // Extract main domain name (second-to-last part for subdomains)
    if (parts.length >= 2) {
      return parts[parts.length - 2]; // e.g., "instagram" from "www.instagram.com"
    }
    return parts[0]; // fallback for single-part domains
  } catch (error) {
    return 'unknown';
  }
}

async function buildOutputPath(url, audioOnly, customOutputDir = null) {
  // If custom output directory is specified, use it
  if (customOutputDir) {
    return path.resolve(customOutputDir);
  }
  
  // Default: smart organization in system Downloads folder
  const downloadsPath = getSystemDownloadsPath();
  const contentType = audioOnly ? 'Audio' : 'Video';
  const domain = extractDomain(url);
  return path.join(downloadsPath, contentType, domain);
}

async function getExpectedFilename(url, options) {
  const { audioOnly, format, quality, outputPath, browser = null } = options;
  
  return new Promise((resolve, reject) => {
    const ytdlpPath = path.join(process.cwd(), 'node_modules/youtube-dl-exec/bin/yt-dlp');
    
    const args = [
      '--get-filename',
      '--output', path.join(outputPath, `%(title).${UI_CONSTANTS.TITLE_MAX_LENGTH}s [%(id)s].%(ext)s`),
      '--no-warnings',
      url
    ];
    
    // Add same format selection logic as in download
    if (audioOnly) {
      args.push('--extract-audio', '--audio-format', format, '--audio-quality', quality);
    } else {
      if (isYouTubeUrl(url)) {
        if (quality === 'best') {
          args.push('--format', 'bestvideo+bestaudio/best');
        } else if (quality === 'worst') {
          args.push('--format', 'worst');
        } else {
          const height = quality.replace('p', '');
          args.push('--format', `bestvideo[height<=${height}]+bestaudio/best`);
        }
      } else {
        if (quality === 'best') {
          args.push('--format', '1080p/720p/480p/240p/best');
        } else if (quality === 'worst') {
          args.push('--format', '240p/worst');
        } else {
          args.push('--format', `${quality}/(bestvideo[height<=${quality.replace('p', '')}]+bestaudio)/best`);
        }
      }
    }
    
    // Add site-specific headers (same as in download)
    if (isYouTubeUrl(url)) {
      args.push('--extractor-args', 'youtube:player_client=web,android');
      args.push('--add-header', HTTP_HEADERS.REFERER);
      args.push('--add-header', `user-agent:${HTTP_HEADERS.USER_AGENT}`);
    } else {
      // Other video hosts: optimization for speed
      args.push('--add-header', 'User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
      args.push('--add-header', 'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8');
      args.push('--add-header', 'Accept-Language:en-US,en;q=0.5');
      args.push('--add-header', 'Accept-Encoding:gzip, deflate');
      args.push('--add-header', 'DNT:1');
      args.push('--add-header', 'Connection:keep-alive');
      args.push('--add-header', 'Upgrade-Insecure-Requests:1');
    }
    
    // Add browser cookies if available
    if (browser) {
      args.unshift('--cookies-from-browser', browser);
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
      if (code === UI_CONSTANTS.EXIT_CODE_SUCCESS && stdout.trim()) {
        let filename = path.basename(stdout.trim());
        
        // For audio extraction, replace extension with audio format
        if (audioOnly) {
          const nameWithoutExt = filename.replace(/\.[^.]+$/, '');
          filename = `${nameWithoutExt}.${format}`;
        }
        
        resolve(filename);
      } else {
        // Create error message with original stderr for logging
        const errorMessage = `Failed to get filename: ${stderr}`;
        
        const error = new Error(errorMessage);
        error.stdout = stdout;
        error.stderr = stderr;
        error.exitCode = code;
        error.isFilenameError = true;
        reject(error);
      }
    });
    
    childProcess.on('error', (error) => {
      reject(new Error(`Process error getting filename: ${error.message}`));
    });
  });
}

async function checkFileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}



async function callYtDlpDirectly(url, options) {
  const { audioOnly, format, quality, outputPath, cookiesFromBrowser, verbose, useDownloadSpinner = false } = options;
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
      // Site-specific format selection
      if (isYouTubeUrl(url)) {
        // YouTube uses separate video+audio streams
        if (quality === 'best') {
          args.push('--format', 'bestvideo+bestaudio/best');
        } else if (quality === 'worst') {
          args.push('--format', 'worst');
        } else {
          const height = quality.replace('p', '');
          args.push('--format', `bestvideo[height<=${height}]+bestaudio/best`);
        }
      } else {
        // Other video hosts: prefer direct HTTPS downloads over HLS (much faster)
        if (quality === 'best') {
          args.push('--format', '1080p/720p/480p/240p/best');
        } else if (quality === 'worst') {
          args.push('--format', '240p/worst');
        } else {
          // For specific quality, prefer direct format over HLS
          args.push('--format', `${quality}/(bestvideo[height<=${quality.replace('p', '')}]+bestaudio)/best`);
        }
      }
    }
    
    // Add site-specific headers
    if (isYouTubeUrl(url)) {
      args.push('--extractor-args', 'youtube:player_client=web,android');
      args.push('--add-header', HTTP_HEADERS.REFERER);
      args.push('--add-header', `user-agent:${HTTP_HEADERS.USER_AGENT}`);
    } else {
      // Other video hosts: optimization for speed
      args.push('--add-header', 'User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
      args.push('--add-header', 'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8');
      args.push('--add-header', 'Accept-Language:en-US,en;q=0.5');
      args.push('--add-header', 'Accept-Encoding:gzip, deflate');
      args.push('--add-header', 'DNT:1');
      args.push('--add-header', 'Connection:keep-alive');
      args.push('--add-header', 'Upgrade-Insecure-Requests:1');
      
      // HLS optimization (in case we fall back to HLS)
      args.push('--concurrent-fragments', '4');
      args.push('--fragment-retries', '10');
      args.push('--hls-prefer-native');
    }
    
    if (cookiesFromBrowser) {
      args.unshift('--cookies-from-browser', cookiesFromBrowser);
    }
    
    // Debug logging only in verbose mode
    if (verbose) {
      console.log('🔍 yt-dlp args:', args);
      console.log('🔍 Audio mode:', audioOnly);
    }
    
    let stdout = '';
    let stderr = '';
    let videoTitle = '';
    let finalFilename = '';
    let isAlreadyDownloaded = false;
    let isConverting = false;
    let isKilled = false;
    let lastProgressTime = Date.now();
    let accumulatedStdout = ''; // For multiline parsing
    let downloadStartTime = null; // Track download start time
    
    // Start download spinner if needed
    if (useDownloadSpinner) {
      downloadStartTime = Date.now();
      spinner.start('Starting download...');
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
    
    // Dynamic timeout - reset on progress, kill if no activity for 60 seconds
    let timeout = setTimeout(() => {
      if (verbose) {
        console.log('🔍 TIMEOUT: Killing yt-dlp process after 60 seconds of no activity');
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
    }, 60000); // 60 second timeout for no activity
    
    // Function to reset timeout when there's activity
    const resetTimeout = () => {
      clearTimeout(timeout);
      lastProgressTime = Date.now();
      timeout = setTimeout(() => {
        if (verbose) {
          console.log('🔍 TIMEOUT: Killing yt-dlp process after 60 seconds of no activity');
        }
        isKilled = true;
        childProcess.kill('SIGTERM');
        
        setTimeout(() => {
          if (!childProcess.killed) {
            if (verbose) {
              console.log('🔍 FORCE KILL: Using SIGKILL');
            }
            childProcess.kill('SIGKILL');
          }
        }, 5000);
      }, 60000);
    };
    
    childProcess.stdout.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;
      accumulatedStdout += chunk;
      resetTimeout(); // Reset timeout on any stdout activity
      
      if (useDownloadSpinner) {
        // Parse already downloaded files
        if (accumulatedStdout.includes('has already been downloaded')) {
          isAlreadyDownloaded = true;
          const alreadyMatch = accumulatedStdout.match(/\/([^/]+)\s+has already been downloaded/);
          if (alreadyMatch) {
            finalFilename = alreadyMatch[1];
          }
        }
        
        // Parse video title and final filename from Destination path using accumulated data
        const destinationMatch = accumulatedStdout.match(/\[download\] Destination: (.+?)(?=\n|$)/);
        if (destinationMatch && !videoTitle) {
          const fullPath = destinationMatch[1].trim();
          finalFilename = fullPath.split('/').pop();
          videoTitle = finalFilename.replace(/\s+\[[^\]]+\]\.[^.]+$/, '');
          
          spinner.updateMessage(`Downloading "${videoTitle}"...`);
        }
        
        // Parse download progress from current chunk
        const progressMatch = chunk.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
        if (progressMatch && !isConverting) {
          const percent = parseFloat(progressMatch[1]);
          spinner.updateProgress(percent);
        }
        
        // Parse ExtractAudio stage and final audio filename
        if (chunk.includes('[ExtractAudio]')) {
          isConverting = true;
          spinner.updateMessage('Converting to audio...');
          spinner.updateProgress(null);
          
          // Update final filename for audio files using accumulated data
          const audioDestMatch = accumulatedStdout.match(/\[ExtractAudio\] Destination: (.+?)(?=\n|$)/);
          if (audioDestMatch) {
            finalFilename = audioDestMatch[1].trim().split('/').pop();
          }
        }
      }
    });
    
    childProcess.stderr.on('data', (data) => {
      const chunk = data.toString();
      stderr += chunk;
      resetTimeout(); // Reset timeout on any stderr activity
      
      // stderr is mainly for warnings and errors in yt-dlp
      // Progress info is now parsed from stdout
    });
    
    childProcess.on('close', (code) => {
      clearTimeout(timeout); // Clear timeout if process completes normally
      
      if (isKilled) {
        if (useDownloadSpinner) {
          spinner.stop(false, 'Download timed out');
        }
        const error = new Error('Process timed out after 60 seconds of no activity');
        error.stdout = stdout;
        error.stderr = stderr;
        error.exitCode = -1;
        error.timeout = true;
        reject(error);
        return;
      }
      
      if (code === UI_CONSTANTS.EXIT_CODE_SUCCESS) {
        if (useDownloadSpinner) {
          // Calculate download time
          const downloadTime = downloadStartTime ? ((Date.now() - downloadStartTime) / 1000).toFixed(1) : '0.0';
          
          // Smart final message - time shown by spinner.stop(), only show filename
          let finalMessage = 'Download completed!';
          
          if (isAlreadyDownloaded && finalFilename) {
            finalMessage = `"${finalFilename}" (already exists)`;
          } else if (finalFilename) {
            finalMessage = `"${finalFilename}"`;
          } else {
            finalMessage = 'Download completed!';
          }
          
          spinner.stop(true, finalMessage);
        }
        
        // Log successful completion
        if (verbose) {
          logInfo('yt-dlp completed successfully');
          if (stdout) {
            logInfo('--- yt-dlp output ---');
            console.log(stdout);
            logInfo('--- End of output ---');
          }
        }
        resolve({ success: true, stdout, stderr, finalFilename });
      } else {
        if (useDownloadSpinner) {
          spinner.stop(false, 'Download failed');
        }
        
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

async function tryDownloadWithBrowser(url, downloadOptions, browser, useDownloadSpinner = false) {
  try {
    const callOptions = {
      audioOnly: downloadOptions.audioOnly,
      format: downloadOptions.format,  // Audio format (m4a, mp3, etc.)
      quality: downloadOptions.quality, // Video/Audio quality (best, 720p, etc.)
      outputPath: path.dirname(downloadOptions.output),
      cookiesFromBrowser: browser,
      verbose: downloadOptions.verbose,
      useDownloadSpinner
    };
    
    // Debug logging only in verbose mode
    if (downloadOptions.verbose) {
      console.log('🔍 tryDownloadWithBrowser callOptions:', callOptions);
    }
    const result = await callYtDlpDirectly(url, callOptions);
    return { success: true, result, browser };
  } catch (error) {
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
    outputDir = null,
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

  // Use smart path organization or custom path
  const fullOutputPath = await buildOutputPath(url, audioOnly, outputDir);
  
  if (verbose) {
    logInfo(`📁 Output directory: ${fullOutputPath}`);
  }
  
  
  if (!(await createOutputDirectory(fullOutputPath))) {
    throw new Error(ERROR_MESSAGES.DIRECTORY_ERROR);
  }

  // 1. Quick file existence check (skip slow yt-dlp filename detection)
  let expectedFilename = null;
  let skipFileCheck = true; // For now, skip the slow pre-check
  
  if (verbose) {
    logInfo('⏩ Skipping file check for faster startup');
  }
  
  // 3. Start with browser connection phase
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

  try {
    if (cookiesFile) {
      downloadOptions.cookies = cookiesFile;
      logInfo(`Using cookies from file: ${cookiesFile}`);
      
      // Start download spinner
      spinner.start('Starting download...');
      try {
        result = await youtubedl(url, downloadOptions, {
          stdio: ['ignore', 'pipe', 'pipe']
        });
        spinner.stop(true, 'Download completed!');
      } catch (error) {
        spinner.stop(false, 'Download failed');
        throw error;
      }
    } else {
      // Only use browser cookies for YouTube
      if (isYouTubeUrl(url)) {
        const browsersToTry = browser 
          ? [browser, ...DEFAULT_CONFIG.BROWSER_FALLBACK_ORDER.filter(b => b !== browser)]
          : DEFAULT_CONFIG.BROWSER_FALLBACK_ORDER;

        // Try browsers with download progress
        
        // Try browsers in order
        for (const browserToTry of browsersToTry) {
          spinner.updateMessage(`Trying ${browserToTry} cookies...`);
          const attempt = await tryDownloadWithBrowser(url, downloadOptions, browserToTry, true); // Download with progress
          if (attempt.success) {
            result = attempt.result;
            successfulBrowser = attempt.browser;
            break;
          }
        }

        // If all browsers fail, try WITHOUT cookies
        if (!result) {
          spinner.updateMessage('Trying without cookies...');
          try {
            const callOptions = {
              audioOnly: downloadOptions.audioOnly,
              format: downloadOptions.format,
              quality: downloadOptions.quality,
              outputPath: path.dirname(downloadOptions.output),
              cookiesFromBrowser: null,
              verbose: downloadOptions.verbose,
              useDownloadSpinner: true
            };
            result = await callYtDlpDirectly(url, callOptions);
          } catch (error) {
            spinner.stop(false, 'Connection failed');
            logError('Full error WITHOUT cookies:', error.message);
            logError('Stderr:', error.stderr);
            logError('Stdout:', error.stdout);
            throw new Error('Failed to download even without cookies');
          }
        }
      } else {
        // For non-YouTube sites, try direct download without cookies
        spinner.start('Connecting to site...');
        try {
          const callOptions = {
            audioOnly: downloadOptions.audioOnly,
            format: downloadOptions.format,
            quality: downloadOptions.quality,
            outputPath: path.dirname(downloadOptions.output),
            cookiesFromBrowser: null,
            verbose: downloadOptions.verbose,
            useDownloadSpinner: true
          };
          result = await callYtDlpDirectly(url, callOptions);
        } catch (error) {
          spinner.stop(false, 'Connection failed');
          if (error.timeout) {
            logError('Download timed out after 60 seconds of no activity - site may be unresponsive or blocked');
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

    // Show additional info only in verbose mode
    if (verbose) {
      logInfo(`Folder: ${fullOutputPath}`);
      if (successfulBrowser) {
        logInfo(`Cookies: ${successfulBrowser}`);
      }
      if (expectedFilename) {
        logInfo(`File: ${expectedFilename}`);
      }
    }

    return {
      success: true,
      outputPath: fullOutputPath,
      filename: expectedFilename || 'Downloaded file',
      result
    };

  } catch (error) {
    // Handle filename detection errors  
    if (error.message && error.message.includes('Failed to get filename')) {
      spinner.stop(false, 'Unable to get video information');
      return {
        success: false,
        error: error.message
      };
    }
    
    // Handle download errors (spinner may already be stopped by callYtDlpDirectly)
    if (spinner.isRunning()) {
      spinner.stop(false, 'Download failed');
    }
    
    const errorMessage = error.message || error.toString();
    
    if (errorMessage.includes('Sign in to confirm') || 
        errorMessage.includes('bot') || 
        errorMessage.includes('Failed to extract any player response')) {
      logError(ERROR_MESSAGES.YOUTUBE_BOT_DETECTION);
      logInfo('💡 Solutions:');
      if (process.platform === 'darwin') {
        logInfo('   🍎 macOS: Enable Full Disk Access for Terminal/iTerm');
        logInfo('      1. System Settings → Privacy & Security → Full Disk Access');
        logInfo('      2. Add Terminal.app or iTerm.app');
        logInfo('      3. Restart terminal and try again');
        logInfo('   🌐 Alternative: Try with browser cookies:');
        logInfo('      udav "URL" -b safari');
      } else {
        logInfo('   🌐 Try with browser cookies:');
        logInfo('      udav "URL" -b chrome');
      }
      logInfo('   ⚠️  Make sure you are logged into YouTube in browser');
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