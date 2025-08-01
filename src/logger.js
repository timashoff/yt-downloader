import chalk from 'chalk';

export function logError(message, error = null) {
  console.error(chalk.red('✗ Ошибка:'), message);
  if (error && process.env.DEBUG) {
    console.error(chalk.gray(error.stack));
  }
}

export function logSuccess(message) {
  console.log(chalk.green('✓'), message);
}

export function logInfo(message) {
  console.log(chalk.blue('ℹ'), message);
}

export function logWarning(message) {
  console.log(chalk.yellow('⚠'), message);
}

export function logProgress(message) {
  console.log(chalk.cyan('→'), message);
}