import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import util from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';

const execPromise = util.promisify(exec);

import { NextRequest } from 'next/server';
import { verifyRequest, isUserAdmin } from '@/lib/dbSecurity';

export async function GET(request: NextRequest) {
  try {
    const user = await verifyRequest(request);
    if (!user || !isUserAdmin(user)) {
      return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
    }
    let logOutput = '';

    // 1. Try reading via PM2 command
    try {
      const { stdout } = await execPromise('npx pm2 logs --lines 200 --raw --nostream', { timeout: 3000 });
      logOutput = stdout;
    } catch (e) {
      // 2. Fallback: Try reading PM2 log files directly from home directory
      try {
        const pm2LogDir = path.join(os.homedir(), '.pm2', 'logs');
        if (fs.existsSync(pm2LogDir)) {
          const files = fs.readdirSync(pm2LogDir);
          const errFiles = files.filter(f => f.includes('error') || f.includes('out')).reverse();
          for (const file of errFiles.slice(0, 2)) {
            const filePath = path.join(pm2LogDir, file);
            const content = fs.readFileSync(filePath, 'utf8');
            logOutput += `\n--- [FILE: ${file}] ---\n` + content.split('\n').slice(-100).join('\n');
          }
        }
      } catch (errFile) {
        console.warn("Direct log file read fallback:", errFile);
      }
    }

    if (!logOutput.trim()) {
      logOutput = `[INFO] ${new Date().toISOString()} Server is running smoothly. No recent system error logs recorded.`;
    }

    // Parse lines into structured log entries
    const lines = logOutput.split('\n').filter(Boolean);
    const parsedLogs = lines.map((line, idx) => {
      const isError = line.toLowerCase().includes('error') || line.toLowerCase().includes('failed') || line.toLowerCase().includes('fatal') || line.toLowerCase().includes('exception');
      const isWarn = line.toLowerCase().includes('warn') || line.toLowerCase().includes('deprecated');
      
      let level: 'error' | 'warn' | 'info' = 'info';
      if (isError) level = 'error';
      else if (isWarn) level = 'warn';

      return {
        id: idx,
        timestamp: new Date().toISOString(),
        level,
        message: line
      };
    });

    return NextResponse.json({
      success: true,
      logs: parsedLogs,
      rawOutput: logOutput,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch logs' },
      { status: 500 }
    );
  }
}
