import fs from 'fs';
import path from 'path';
import { LOGS_DIR } from './config.js';

export type LogLevel = 'info' | 'warn' | 'error' | 'success';

export class Logger {
  private static logDir = LOGS_DIR;
  private static engineLogPath = path.join(LOGS_DIR, 'lexhub.log');

  /**
   * 初始化日志目录与日志文件
   */
  static init(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
    const moduleLogDir = path.join(this.logDir, 'modules');
    if (!fs.existsSync(moduleLogDir)) {
      fs.mkdirSync(moduleLogDir, { recursive: true });
    }
  }

  /**
   * 写入核心引擎日志到 console 和 lexhub.log 文件中
   */
  static log(level: LogLevel, message: string, component: string = 'Engine'): void {
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const logLine = `[${timestamp}] [${level.toUpperCase()}] [${component}] ${message}\n`;

    // 1. 输出到控制台 (带简易颜色)
    let colorPrefix = '\x1b[0m';
    if (level === 'success') colorPrefix = '\x1b[32m'; // Green
    if (level === 'warn') colorPrefix = '\x1b[33m';    // Yellow
    if (level === 'error') colorPrefix = '\x1b[31m';   // Red
    if (level === 'info') colorPrefix = '\x1b[36m';    // Cyan

    console.log(`${colorPrefix}${logLine.trim()}\x1b[0m`);

    // 2. 写入全局日志文件 (异步，防止阻塞事件循环)
    fs.appendFile(this.engineLogPath, logLine, 'utf8', (err) => {
      if (err) console.error('Failed to write engine log file:', err);
    });
  }

  static info(message: string, component?: string): void {
    this.log('info', message, component);
  }

  static warn(message: string, component?: string): void {
    this.log('warn', message, component);
  }

  static error(message: string, component?: string): void {
    this.log('error', message, component);
  }

  static success(message: string, component?: string): void {
    this.log('success', message, component);
  }

  /**
   * 获取指定日志文件的末尾 N 行内容 (诊断用)
   * 修复 OOM 风险：仅读取文件末尾的一小块数据
   */
  static readTail(filePath: string, linesCount: number = 200): string {
    if (!fs.existsSync(filePath)) {
      return '';
    }
    try {
      const stats = fs.statSync(filePath);
      const chunkSize = 1024 * 64; // 读取最后 64KB
      const start = Math.max(0, stats.size - chunkSize);
      const buffer = Buffer.alloc(Math.min(chunkSize, stats.size));
      
      const fd = fs.openSync(filePath, 'r');
      fs.readSync(fd, buffer, 0, buffer.length, start);
      fs.closeSync(fd);
      
      const content = buffer.toString('utf8');
      const lines = content.split('\n');
      return lines.slice(-linesCount).join('\n');
    } catch {
      return 'Failed to read log file.';
    }
  }

  /**
   * 获取模块日志的存放路径
   */
  static getModuleLogPaths(moduleId: string) {
    const moduleLogDir = path.join(this.logDir, 'modules');
    return {
      stdout: path.join(moduleLogDir, `${moduleId}_stdout.log`),
      stderr: path.join(moduleLogDir, `${moduleId}_stderr.log`),
    };
  }
}
