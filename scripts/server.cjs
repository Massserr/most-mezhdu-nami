'use strict';
// Local static-file launcher. No application backend, network APIs or telemetry.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const HOST = '127.0.0.1';
const PORT = 4173;
const APP_ID = 'most-mezhdu-nami-offline-v1';
const URL = `http://${HOST}:${PORT}/`;
const ROOT = fs.existsSync(path.join(__dirname, 'index.html'))
  ? __dirname
  : path.resolve(__dirname, '../dist');
const OPEN = !process.argv.includes('--no-open');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
};
function openBrowser() {
  if (!OPEN) return;
  const opener =
    process.platform === 'win32'
      ? 'explorer.exe'
      : process.platform === 'darwin'
        ? 'open'
        : 'xdg-open';
  const child = spawn(opener, [URL], { detached: true, stdio: 'ignore', windowsHide: true });
  child.on('error', () => console.log(`Не удалось автоматически открыть браузер. Откройте ${URL}`));
  child.unref();
}
function respond(res, code, text) {
  res.writeHead(code, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(text);
}
function probeExisting() {
  const request = http.get(`${URL}__most_health`, { timeout: 1500 }, (res) => {
    let body = '';
    res.on('data', (chunk) => {
      body += chunk;
      if (body.length > 4096) request.destroy(new Error('Unexpected response'));
    });
    res.on('end', () => {
      try {
        if (res.statusCode === 200 && JSON.parse(body).app === APP_ID) {
          console.log(`Игра уже запущена: ${URL}`);
          openBrowser();
          return;
        }
      } catch {}
      occupied();
    });
  });
  request.on('timeout', () => request.destroy(new Error('Timeout')));
  request.on('error', occupied);
}
let conflictReported = false;
function occupied() {
  if (conflictReported) return;
  conflictReported = true;
  console.error(
    `Порт ${PORT} занят другой программой. Закройте её и повторите запуск. Порт не изменён: это сохраняет доступ к вашей партии в браузере.`,
  );
  process.exitCode = 1;
}
if (!fs.existsSync(path.join(ROOT, 'index.html'))) {
  console.error(
    'Не найден index.html. Распакуйте архив полностью. Для исходного проекта сначала выполните npm run build.',
  );
  process.exitCode = 1;
} else {
  const realRoot = fs.realpathSync(ROOT);
  const server = http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      respond(res, 405, 'Метод не поддерживается');
      return;
    }
    let pathname;
    try {
      pathname = decodeURIComponent((req.url || '/').split('?')[0]);
    } catch {
      respond(res, 400, 'Некорректный адрес');
      return;
    }
    if (pathname === '/__most_health') {
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ app: APP_ID }));
      return;
    }
    if (
      !pathname.startsWith('/') ||
      pathname.includes('\\') ||
      pathname.includes('\0') ||
      pathname.split('/').some((p) => p === '..' || p === '.') ||
      pathname.includes(':')
    ) {
      respond(res, 403, 'Доступ запрещён');
      return;
    }
    const candidate = path.resolve(ROOT, '.' + (pathname === '/' ? '/index.html' : pathname));
    const relative = path.relative(ROOT, candidate);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      respond(res, 403, 'Доступ запрещён');
      return;
    }
    // Serve only browser assets, never the runtime, launcher, source, or directories.
    const contentType = MIME[path.extname(candidate).toLowerCase()];
    if (!contentType) {
      respond(res, 404, 'Файл не найден');
      return;
    }
    fs.realpath(candidate, (realError, realFile) => {
      if (realError) {
        respond(res, 404, 'Файл не найден');
        return;
      }
      const realRelative = path.relative(realRoot, realFile);
      if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
        respond(res, 403, 'Доступ запрещён');
        return;
      }
      fs.stat(realFile, (error, stat) => {
        if (error || !stat.isFile()) {
          respond(res, 404, 'Файл не найден');
          return;
        }
        res.writeHead(200, {
          'Content-Type': contentType,
          'Content-Length': stat.size,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        });
        if (req.method === 'HEAD') {
          res.end();
          return;
        }
        const stream = fs.createReadStream(realFile);
        stream.on('error', () => res.destroy());
        stream.pipe(res);
      });
    });
  });
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') probeExisting();
    else {
      console.error(`Не удалось запустить игру: ${error.message}`);
      process.exitCode = 1;
    }
  });
  server.listen(PORT, HOST, () => {
    console.log(
      `Мост между нами — ${URL}\nОставьте это окно открытым во время игры. Для завершения нажмите Ctrl+C. Интернет не требуется.`,
    );
    openBrowser();
  });
}
