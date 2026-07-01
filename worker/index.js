export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.slice(1); // remove leading slash
    const userAgent = request.headers.get('User-Agent') || '';
    
    // 1. If path is a specific binary name or metadata, serve it directly from R2 bucket
    if (path.startsWith('lh-') || path === 'sha256sums.txt' || path === 'version.json' || path.endsWith('.sha256')) {
      try {
        const object = await env.LAUNCHER_BUCKET.get(path);
        if (object === null) {
          return new Response('File not found in R2 bucket', { status: 404 });
        }
        
        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set('etag', object.httpEtag);
        if (path.endsWith('.txt') || path.endsWith('.sha256')) {
          headers.set('content-type', 'text/plain;charset=UTF-8');
          headers.set('content-disposition', 'inline');
        } else if (path.endsWith('.json')) {
          headers.set('content-type', 'application/json;charset=UTF-8');
          headers.set('content-disposition', 'inline');
        } else {
          headers.set('content-type', 'application/octet-stream');
          headers.set('content-disposition', `attachment; filename="${path}"`);
        }
        
        return new Response(object.body, { headers });
      } catch (err) {
        return new Response(`Error reading from R2: ${err.message}`, { status: 500 });
      }
    }
    
    // 2. If it's a browser request (non-cli), return an elegant setup guide page
    if (!userAgent.includes('curl') && !userAgent.includes('wget') && !userAgent.includes('PowerShell') && !userAgent.includes('WindowsPowerShell')) {
      const html = `<!DOCTYPE html>
      <html lang="zh-CN">
      <head>
        <meta charset="UTF-8">
        <title>LexHub 自动安装程序</title>
        <style>
          body { 
            background: #09090b; 
            color: #f4f4f5; 
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; 
            display: flex; 
            justify-content: center; 
            align-items: center; 
            min-height: 100vh; 
            margin: 0; 
          }
          .card { 
            background: rgba(24, 24, 27, 0.8); 
            border: 1px solid rgba(63, 63, 70, 0.4); 
            backdrop-filter: blur(12px); 
            border-radius: 24px; 
            padding: 40px; 
            max-width: 600px; 
            width: 90%; 
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); 
            text-align: center; 
          }
          h1 { 
            font-size: 2rem; 
            font-weight: 800; 
            margin-bottom: 8px; 
            background: linear-gradient(to right, #60a5fa, #a78bfa); 
            -webkit-background-clip: text; 
            -webkit-text-fill-color: transparent; 
          }
          p { 
            color: #a1a1aa; 
            font-size: 0.95rem; 
            line-height: 1.6; 
            text-align: left;
            margin-bottom: 4px;
            margin-top: 16px;
          }
          .code-block { 
            background: #18181b; 
            border: 1px solid #27272a; 
            padding: 16px 20px; 
            border-radius: 14px; 
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; 
            font-size: 0.9rem; 
            color: #34d399; 
            margin: 8px 0; 
            overflow-x: auto; 
            text-align: left; 
          }
          .hint { 
            font-size: 0.8rem; 
            color: #71717a; 
            display: block;
            margin-top: 24px;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>🎭 LexHub AI 应用管理器</h1>
          <p>🍎 Linux / macOS / Termux 终端执行：</p>
          <div class="code-block">
            curl -s -L https://${url.host} | bash
          </div>
          <p>🪟 Windows (以管理员运行 PowerShell) 执行：</p>
          <div class="code-block">
            irm https://${url.host} | iex
          </div>
          <span class="hint">安装程序会自动进行 SHA256 完整性校验并检查依赖环境。</span>
        </div>
      </body>
      </html>`;
      return new Response(html, { headers: { 'content-type': 'text/html;charset=UTF-8' } });
    }
 
    // 3. PowerShell loader script
    if (userAgent.includes('PowerShell') || userAgent.includes('WindowsPowerShell')) {
      const psScript = `# ===================================================================
#  LexHub — PowerShell Loader Script (Powered by Cloudflare R2)
# ===================================================================
$ErrorActionPreference = "Stop"
Write-Host "[LexHub Loader] 正在从边缘节点下载安装引导器..." -ForegroundColor Cyan

$ARCH = $env:PROCESSOR_ARCHITECTURE.ToLower()
if ($ARCH -eq "amd64") {
    $GOARCH = "amd64"
} elseif ($ARCH -eq "x86") {
    $GOARCH = "386"
} else {
    Write-Host "Unsupported architecture: $ARCH" -ForegroundColor Red
    exit 1
}

$BINARY = "lh-windows-\${GOARCH}.exe"
$DOWNLOAD_URL = "https://${url.host}/\${BINARY}"

Invoke-WebRequest -Uri $DOWNLOAD_URL -OutFile "lh.exe"

# Verify Checksum
try {
    $SHA_TXT = Invoke-RestMethod -Uri "https://${url.host}/sha256sums.txt" -TimeoutSec 5
    $EXPECTED_HASH = ""
    foreach ($line in ($SHA_TXT -split "\`n")) {
        if ($line -like "*$BINARY*") {
            $EXPECTED_HASH = ($line -split "\s+")[0].Trim()
            break
        }
    }
    
    if ($EXPECTED_HASH) {
        Write-Host "[LexHub Loader] 正在校验二进制完整性..." -ForegroundColor Cyan
        $LOCAL_HASH = (Get-FileHash -Path "lh.exe" -Algorithm SHA256).Hash.ToLower()
        if ($LOCAL_HASH -ne $EXPECTED_HASH.ToLower()) {
            Write-Host "Error: SHA256 checksum mismatch for lh.exe!" -ForegroundColor Red
            Write-Host "Expected: $EXPECTED_HASH" -ForegroundColor Red
            Write-Host "Got:      $LOCAL_HASH" -ForegroundColor Red
            Remove-Item -Force "lh.exe"
            exit 1
        }
        Write-Host "[LexHub Loader] 完整性校验成功！" -ForegroundColor Green
    } else {
        Write-Host "[LexHub Loader] 警告: 未在校验文件中找到该架构的哈希值，跳过校验。" -ForegroundColor Yellow
    }
} catch {
    Write-Host "[LexHub Loader] 警告: 无法获取校验文件或执行校验，跳过完整性校验 ($($_.Exception.Message))" -ForegroundColor Yellow
}

Write-Host "[LexHub Loader] 正在执行安装流程..." -ForegroundColor Green
.\\lh.exe install
`;
      return new Response(psScript, { headers: { 'content-type': 'text/plain;charset=UTF-8' } });
    }
 
    // 4. If it's curl/wget, return a short bash script that downloads the binary from this Worker
    const loaderScript = `#!/usr/bin/env bash
# ===================================================================
#  LexHub — Go CLI Loader Script (Powered by Cloudflare R2)
# ===================================================================
set -e

OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

# Map ARCH
if [ "$ARCH" = "x86_64" ]; then
    GOARCH="amd64"
elif [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
    GOARCH="arm64"
else
    echo "Unsupported architecture: $ARCH"
    exit 1
fi

# Map OS
if [ "$OS" = "linux" ]; then
    if [ -n "$TERMUX_VERSION" ] || [[ "$PREFIX" == *"com.termux"* ]] || [[ "$(uname -o 2>/dev/null)" == *"Android"* ]] || [[ "$(uname -a)" == *"Android"* ]]; then
        BINARY="lh-android-\${GOARCH}"
    else
        BINARY="lh-linux-\${GOARCH}"
    fi
elif [ "$OS" = "darwin" ]; then
    BINARY="lh-darwin-\${GOARCH}"
else
    echo "Unsupported OS: $OS"
    exit 1
fi

DOWNLOAD_URL="https://${url.host}/\${BINARY}"

echo "[LexHub Loader] 正在从边缘节点下载安装引导器 (\${BINARY})..."
if command -v curl >/dev/null 2>&1; then
    curl -L -f "\${DOWNLOAD_URL}" -o lh
elif command -v wget >/dev/null 2>&1; then
    wget -qO lh "\${DOWNLOAD_URL}"
else
    echo "Error: curl or wget is required." >&2
    exit 1
fi

# Check SHA256 integrity
echo "[LexHub Loader] 正在获取 SHA256 校验信息..."
download_to_stdout() {
    local target_url="$1"
    if command -v curl >/dev/null 2>&1; then
        curl -s -L "$target_url"
    elif command -v wget >/dev/null 2>&1; then
        wget -qO- "$target_url"
    fi
}

SHA_TXT=$(download_to_stdout "https://${url.host}/sha256sums.txt" || true)
EXPECTED_HASH=$(echo "$SHA_TXT" | grep "\${BINARY}" | awk '{print $1}' || true)

if [ -n "$EXPECTED_HASH" ]; then
    echo "[LexHub Loader] 正在校验二进制完整性..."
    LOCAL_HASH=""
    if command -v sha256sum >/dev/null 2>&1; then
        LOCAL_HASH=$(sha256sum lh | awk '{print $1}')
    elif command -v shasum >/dev/null 2>&1; then
        LOCAL_HASH=$(shasum -a 256 lh | awk '{print $1}')
    elif command -v openssl >/dev/null 2>&1; then
        LOCAL_HASH=$(openssl dgst -sha256 lh | awk '{print $2}')
    fi
    
    if [ -n "$LOCAL_HASH" ]; then
        if [ "$LOCAL_HASH" != "$EXPECTED_HASH" ]; then
            echo "Error: SHA256 checksum mismatch for lh!" >&2
            echo "Expected: $EXPECTED_HASH" >&2
            echo "Got:      $LOCAL_HASH" >&2
            rm -f lh
            exit 1
        fi
        echo "[LexHub Loader] 完整性校验成功！"
    else
        echo "[LexHub Loader] 警告: 未找到可用的 SHA256 计算工具，跳过校验。"
    fi
else
    echo "[LexHub Loader] 警告: 无法获取校验文件或未找到对应架构哈希，跳过校验。"
fi

chmod +x lh
echo "[LexHub Loader] 开始执行安装流程..."
./lh install
`;
 
    return new Response(loaderScript, { 
      headers: { 'content-type': 'text/plain;charset=UTF-8' } 
    });
  }
};
