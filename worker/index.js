export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.slice(1); // remove leading slash
    const userAgent = request.headers.get('User-Agent') || '';
    
    // 1. If path is a specific binary name, serve it directly from R2 bucket
    if (path.startsWith('lh-')) {
      try {
        const object = await env.LAUNCHER_BUCKET.get(path);
        if (object === null) {
          return new Response('Binary file not found in R2 bucket', { status: 404 });
        }
        
        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set('etag', object.httpEtag);
        headers.set('content-type', 'application/octet-stream');
        headers.set('content-disposition', `attachment; filename="${path}"`);
        
        return new Response(object.body, { headers });
      } catch (err) {
        return new Response(`Error reading from R2: ${err.message}`, { status: 500 });
      }
    }
    
    // 2. If it's a browser request (non-cli), return an elegant setup guide page
    if (!userAgent.includes('curl') && !userAgent.includes('wget')) {
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
          }
          .code-block { 
            background: #18181b; 
            border: 1px solid #27272a; 
            padding: 16px 20px; 
            border-radius: 14px; 
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; 
            font-size: 0.9rem; 
            color: #34d399; 
            margin: 24px 0; 
            overflow-x: auto; 
            text-align: left; 
          }
          .hint { 
            font-size: 0.8rem; 
            color: #71717a; 
          }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>🎭 LexHub AI 应用管理器</h1>
          <p>请复制下方命令并在您的终端（Linux / macOS / Termux）中执行，以开始全自动安装。</p>
          <div class="code-block">
            curl -s -L https://${url.host} | bash
          </div>
          <span class="hint">安装程序会自动获取最优镜像，并检查系统依赖环境。</span>
        </div>
      </body>
      </html>`;
      return new Response(html, { headers: { 'content-type': 'text/html;charset=UTF-8' } });
    }
    
    // 3. If it's curl/wget, return a short bash script that downloads the binary from this Worker
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

chmod +x lh
echo "[LexHub Loader] 下载完成，开始执行安装流程..."
./lh install
`;

    return new Response(loaderScript, { 
      headers: { 'content-type': 'text/plain;charset=UTF-8' } 
    });
  }
};
