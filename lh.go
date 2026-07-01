package main

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

const (
	colorReset  = "\033[0m"
	colorRed    = "\033[1;31m"
	colorGreen  = "\033[1;32m"
	colorYellow = "\033[1;33m"
	colorCyan   = "\033[1;36m"
)

func printInfo(format string, a ...interface{}) {
	fmt.Printf(colorCyan+"[LexHub] "+colorReset+format+"\n", a...)
}

func printSuccess(format string, a ...interface{}) {
	fmt.Printf(colorGreen+"[LexHub] ✔ "+colorReset+format+"\n", a...)
}

func printWarn(format string, a ...interface{}) {
	fmt.Printf(colorYellow+"[LexHub] ⚠ "+colorReset+format+"\n", a...)
}

func printError(format string, a ...interface{}) {
	fmt.Printf(colorRed+"[LexHub] ✘ "+colorReset+format+"\n", a...)
}

func getLexHubDir() string {
	// First, check if current directory or binary directory contains core/package.json
	// 1. Current working directory
	if cwd, err := os.Getwd(); err == nil {
		if _, err := os.Stat(filepath.Join(cwd, "core", "package.json")); err == nil {
			return cwd
		}
	}
	// 2. Binary directory
	if execPath, err := os.Executable(); err == nil {
		binDir := filepath.Dir(execPath)
		if _, err := os.Stat(filepath.Join(binDir, "core", "package.json")); err == nil {
			return binDir
		}
	}
	// 3. Fallback to $HOME/.lexhub
	home, err := os.UserHomeDir()
	if err != nil {
		return ".lexhub" // local fallback
	}
	return filepath.Join(home, ".lexhub")
}

func isTermux() bool {
	return os.Getenv("TERMUX_VERSION") != "" || strings.Contains(os.Getenv("PREFIX"), "com.termux")
}

func runCmd(dir string, name string, args ...string) error {
	cmd := exec.Command(name, args...)
	cmd.Dir = dir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin
	
	env := append(os.Environ(), "DEBIAN_FRONTEND=noninteractive")
	if isTermux() && os.Getenv("SVDIR") == "" {
		prefix := os.Getenv("PREFIX")
		if prefix == "" {
			prefix = "/data/data/com.termux/files/usr"
		}
		env = append(env, "SVDIR=" + filepath.Join(prefix, "var", "service"))
	}
	cmd.Env = env
	return cmd.Run()
}

func testExecutable(name string, args ...string) bool {
	cmd := exec.Command(name, args...)
	if err := cmd.Run(); err != nil {
		return false
	}
	return true
}

func checkDependencies() {
	_, errNode := exec.LookPath("node")
	_, errGit := exec.LookPath("git")
	_, errNpm := exec.LookPath("npm")

	nodeOk := errNode == nil && testExecutable("node", "-v")
	gitOk := errGit == nil && testExecutable("git", "--version")
	npmOk := errNpm == nil && testExecutable("npm", "-v")

	if !nodeOk || !gitOk || !npmOk {
		printWarn("System dependencies (node/git/npm) are missing or broken. Attempting to resolve...")
		installSystemDependencies()

		// Re-verify after install
		nodeOk = testExecutable("node", "-v")
		gitOk = testExecutable("git", "--version")
		npmOk = testExecutable("npm", "-v")
		if !nodeOk || !gitOk || !npmOk {
			if isTermux() {
				printError("Some dependencies are still broken. In Termux, this is usually due to shared library mismatches (e.g. OpenSSL).")
				printError("Please run: pkg update && pkg upgrade -y")
			} else {
				printError("Failed to auto-install dependencies. Please install git, nodejs and npm manually.")
			}
			os.Exit(1)
		}
	}
}

func installSystemDependencies() {
	goos := runtime.GOOS

	if isTermux() {
		printInfo("检测到 Termux 环境，正在安装/更新 git, nodejs 和 openssl...")
		runCmd("", "apt-get", "update", "-y")
		runCmd("", "apt-get", "install", "-y", "-o", "Dpkg::Options::=--force-confdef", "-o", "Dpkg::Options::=--force-confold", "git", "nodejs", "openssl")
		return
	}

	switch goos {
	case "darwin":
		printInfo("检测到 macOS 环境，正在检查 Homebrew...")
		if _, err := exec.LookPath("brew"); err == nil {
			runCmd("", "brew", "install", "git", "node")
		} else {
			printError("未找到 Homebrew。请先安装 Homebrew，或者手动安装 git & node。")
		}
	case "linux":
		if _, err := exec.LookPath("apt-get"); err == nil {
			printInfo("检测到 Debian/Ubuntu 环境，正在安装 git 和 nodejs...")
			if os.Getuid() == 0 {
				runCmd("", "apt-get", "update", "-y")
				runCmd("", "apt-get", "install", "-y", "-o", "Dpkg::Options::=--force-confdef", "-o", "Dpkg::Options::=--force-confold", "git", "nodejs")
			} else {
				printInfo("当前非 root 用户，正在使用 sudo 权限以更新和安装系统依赖...")
				runCmd("", "sudo", "env", "DEBIAN_FRONTEND=noninteractive", "apt-get", "update", "-y")
				runCmd("", "sudo", "env", "DEBIAN_FRONTEND=noninteractive", "apt-get", "install", "-y", "-o", "Dpkg::Options::=--force-confdef", "-o", "Dpkg::Options::=--force-confold", "git", "nodejs")
			}
		} else if _, err := exec.LookPath("yum"); err == nil {
			printInfo("检测到 RedHat/CentOS 环境，正在安装 git 和 nodejs...")
			if os.Getuid() == 0 {
				runCmd("", "yum", "install", "-y", "git", "nodejs")
			} else {
				runCmd("", "sudo", "yum", "install", "-y", "git", "nodejs")
			}
		} else {
			printWarn("未知的 Linux 发行版，请手动安装 git 和 nodejs。")
		}
	case "windows":
		printInfo("检测到 Windows 环境，正在检查 winget...")
		if _, err := exec.LookPath("winget"); err == nil {
			if _, errGit := exec.LookPath("git"); errGit != nil {
				printInfo("正在通过 winget 安装 Git...")
				runCmd("", "winget", "install", "-e", "--id", "Git.Git", "--accept-package-agreements", "--accept-source-agreements")
			}
			if _, errNode := exec.LookPath("node"); errNode != nil {
				printInfo("正在通过 winget 安装 Node.js...")
				runCmd("", "winget", "install", "-e", "--id", "OpenJS.NodeJS", "--accept-package-agreements", "--accept-source-agreements")
			}
			printInfo("系统依赖环境检查完成！提示：如果是刚刚安装的依赖，你可能需要重启终端以使别名生效。")
		} else {
			printError("未找到 winget。请手动下载安装 Git 和 Node.js: \n  - Git: https://git-scm.com\n  - Node.js: https://nodejs.org")
		}
	}
}

func raceMirrors() string {
	mirrors := []string{
		"https://ghproxy.net/",
		"https://mirror.ghproxy.com/",
		"https://ghproxy.cc/",
		"https://gh.likk.cc/",
		"https://hub.gitmirror.com/",
		"https://hk.gh-proxy.com/",
		"https://ui.ghproxy.cc/",
		"https://gh-proxy.com/",
		"https://github.com/",
	}
	repoPath := "Future-404/LexHub.git"

	type Result struct {
		url string
		err error
	}

	ch := make(chan Result, len(mirrors))
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	for _, m := range mirrors {
		go func(m string) {
			var targetUrl string
			if m == "https://github.com/" {
				targetUrl = m + repoPath
			} else {
				targetUrl = m + "https://github.com/" + repoPath
			}

			req, err := http.NewRequestWithContext(ctx, "HEAD", targetUrl, nil)
			if err != nil {
				ch <- Result{"", err}
				return
			}

			client := &http.Client{Timeout: 3 * time.Second}
			resp, err := client.Do(req)
			if err != nil {
				ch <- Result{"", err}
				return
			}
			resp.Body.Close()

			if resp.StatusCode >= 200 && resp.StatusCode < 400 {
				ch <- Result{targetUrl, nil}
			} else {
				ch <- Result{"", fmt.Errorf("status: %d", resp.StatusCode)}
			}
		}(m)
	}

	timer := time.NewTimer(3 * time.Second)
	defer timer.Stop()

	for i := 0; i < len(mirrors); i++ {
		select {
		case res := <-ch:
			if res.err == nil && res.url != "" {
				return res.url
			}
		case <-timer.C:
			return "https://github.com/" + repoPath
		}
	}
	return "https://github.com/" + repoPath
}

func installOrUpdate(lexHubDir string, isUpdate bool) {
	printInfo("正在启动 LexHub 安装配置流程...")
	checkDependencies()

	printInfo("正在对 GitHub 镜像源进行并发测速...")
	bestUrl := raceMirrors()
	printSuccess("已选择最优下载源：%s", bestUrl)

	if _, err := os.Stat(filepath.Join(lexHubDir, ".git")); err == nil {
		printInfo("检测到已存在本地仓库，正在拉取更新...")
		if err := runCmd(lexHubDir, "git", "remote", "set-url", "origin", bestUrl); err != nil {
			printError("更新远程仓库 URL 失败：%v", err)
			return
		}
		if err := runCmd(lexHubDir, "git", "fetch", "origin"); err != nil {
			printError("拉取更新失败：%v", err)
			return
		}
		if err := runCmd(lexHubDir, "git", "reset", "--hard", "FETCH_HEAD"); err != nil {
			printError("硬重置本地仓库失败：%v", err)
			return
		}
	} else {
		printInfo("正在克隆 LexHub 仓库至 %s...", lexHubDir)
		parentDir := filepath.Dir(lexHubDir)
		if err := os.MkdirAll(parentDir, 0755); err != nil {
			printError("创建父级目录失败：%v", err)
			return
		}
		if err := runCmd(parentDir, "git", "clone", "--depth", "1", bestUrl, filepath.Base(lexHubDir)); err != nil {
			printError("克隆仓库失败：%v", err)
			return
		}
	}

	printInfo("正在安装根级别依赖...")
	if err := runCmd(lexHubDir, "npm", "install", "yaml", "--save-exact"); err != nil {
		printWarn("安装根级别依赖失败（已跳过）：%v", err)
	}

	coreDir := filepath.Join(lexHubDir, "core")
	printInfo("正在安装 Core 后端服务依赖...")
	if err := runCmd(coreDir, "npm", "install"); err != nil {
		printError("安装 Core 后端依赖失败：%v", err)
		return
	}
	printInfo("正在构建 Core 后端代码...")
	if err := runCmd(coreDir, "npm", "run", "build"); err != nil {
		printError("构建 Core 后端代码失败：%v", err)
		return
	}

	webUiDir := filepath.Join(lexHubDir, "web-ui")
	printInfo("正在安装 Web UI 前端依赖...")
	if err := runCmd(webUiDir, "npm", "install"); err != nil {
		printError("安装 Web UI 前端依赖失败：%v", err)
		return
	}
	printInfo("正在构建 Web UI 前端代码...")
	if err := runCmd(webUiDir, "npm", "run", "build"); err != nil {
		printError("构建 Web UI 前端代码失败：%v", err)
		return
	}

	downloadCloudflared(lexHubDir, bestUrl)

	injectShellAlias(lexHubDir)
	printPostInstallGuide(lexHubDir)
}

func printPostInstallGuide(lexHubDir string) {
	fmt.Println()
	printSuccess(colorGreen + "★ LexHub 安装并初始化完成！" + colorReset)
	fmt.Println("==================================================")
	fmt.Println("🎉 欢迎使用 LexHub AI 应用管理器！接下来请按照以下指引操作：")
	fmt.Println()
	if runtime.GOOS == "windows" {
		fmt.Println("1️⃣  【重要】请重新打开一个 PowerShell 终端以激活 'lh' 命令行别名。")
		fmt.Println("2️⃣  在命令行运行以下命令启动后台管理面板服务：")
		fmt.Println("    lh")
		fmt.Println("3️⃣  在手机/电脑浏览器中访问：http://127.0.0.1:3000 进入可视化面板。")
	} else {
		fmt.Println("1️⃣  【重要】激活 'lh' 别名（新开窗口或在当前终端运行）：")
		fmt.Println("    source ~/.bashrc  (若使用 Zsh，请输入: source ~/.zshrc)")
		fmt.Println("2️⃣  启动 LexHub 后台服务进程：")
		fmt.Println("    lh")
		fmt.Println("3️⃣  在浏览器访问以下地址进入管理面板：")
		fmt.Println("    http://127.0.0.1:3000")
	}
	fmt.Println()
	fmt.Println("💡 常用快捷命令行工具（在任意目录下执行）：")
	fmt.Println("   lh install sillytavern   # 一键安装酒馆模块")
	fmt.Println("   lh start sillytavern     # 一键启动酒馆模块")
	fmt.Println("   lh stop sillytavern      # 一键关闭酒馆")
	fmt.Println("   lh list                  # 查看所有已安装应用的状态")
	fmt.Println("==================================================")
	fmt.Println()
}

func injectShellAlias(lexHubDir string) {
	goos := runtime.GOOS
	if goos == "windows" {
		printInfo("正在尝试将 LexHub 添加到系统用户 PATH 中...")
		script := fmt.Sprintf(`$p = [Environment]::GetEnvironmentVariable("PATH", "User"); if ($p -notlike "*%s*") { [Environment]::SetEnvironmentVariable("PATH", $p + ";%s", "User") }`, lexHubDir, lexHubDir)
		err := runCmd("", "powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script)
		if err == nil {
			printSuccess("已将 %s 添加到系统用户 PATH 中！", lexHubDir)
			printSuccess("【重要】请重新打开一个 PowerShell 终端，即可在任意目录直接使用 'lh' 命令！")
		} else {
			printWarn("自动写入 PATH 失败。要在 Windows 上方便地运行 LexHub，建议手动将 %s 目录添加到系统环境变量 PATH 中。", lexHubDir)
		}
		return
	}

	execPath, err := os.Executable()
	if err != nil {
		execPath = filepath.Join(lexHubDir, "lh")
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return
	}

	rcFiles := []string{
		filepath.Join(home, ".bashrc"),
		filepath.Join(home, ".zshrc"),
	}

	safePath := strings.ReplaceAll(execPath, "'", "'\\''")
	aliasLine := fmt.Sprintf("alias lh='%s'", safePath)

	for _, rc := range rcFiles {
		if _, err := os.Stat(rc); err == nil {
			content, err := os.ReadFile(rc)
			if err != nil {
				continue
			}

			contentStr := strings.ReplaceAll(string(content), "\r\n", "\n")
			lines := strings.Split(contentStr, "\n")
			var newLines []string
			for _, line := range lines {
				if !strings.HasPrefix(strings.TrimSpace(line), "alias lh=") {
					newLines = append(newLines, line)
				}
			}
			newLines = append(newLines, aliasLine)

			tmpFile, err := os.CreateTemp(filepath.Dir(rc), ".lh-alias-*")
			if err != nil {
				continue
			}
			tmpFile.WriteString(strings.Join(newLines, "\n") + "\n")
			tmpFile.Close()
			err = os.Rename(tmpFile.Name(), rc)
			
			if err == nil {
				printSuccess("已成功将快捷别名 'lh' 写入配置文件：%s", rc)
			} else {
				os.Remove(tmpFile.Name())
			}
		}
	}
}

func startDaemon(lexHubDir string) {
	pidFile := filepath.Join(lexHubDir, "server.pid")
	logDir := filepath.Join(lexHubDir, "logs")
	logFile := filepath.Join(logDir, "server.log")

	if pidData, err := os.ReadFile(pidFile); err == nil {
		if pid, err := strconv.Atoi(strings.TrimSpace(string(pidData))); err == nil {
			if checkProcessRunning(pid) {
				printWarn("LexHub daemon is already running (PID: %d)", pid)
				return
			}
		}
	}

	printInfo("Starting LexHub daemon in background...")
	if err := os.MkdirAll(logDir, 0755); err != nil {
		printError("Failed to create log directory: %v", err)
		return
	}

	coreDir := filepath.Join(lexHubDir, "core")
	var entryCmd string
	var entryArgs []string

	if _, err := os.Stat(filepath.Join(coreDir, "dist", "index.js")); err == nil {
		entryCmd = "node"
		entryArgs = []string{"dist/index.js", "web"}
	} else if _, err := os.Stat(filepath.Join(coreDir, "src", "index.ts")); err == nil {
		entryCmd = "npx"
		entryArgs = []string{"tsx", "src/index.ts", "web"}
	} else {
		printError("Could not find dist/index.js or src/index.ts in %s", coreDir)
		return
	}

	out, err := os.OpenFile(logFile, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		printError("Failed to open log file: %v", err)
		return
	}

	cmd := exec.Command(entryCmd, entryArgs...)
	cmd.Dir = coreDir
	cmd.Stdout = out
	cmd.Stderr = out
	setSysProcAttr(cmd)

	if err := cmd.Start(); err != nil {
		printError("Failed to start daemon: %v", err)
		out.Close()
		return
	}

	pid := cmd.Process.Pid
	err = os.WriteFile(pidFile, []byte(strconv.Itoa(pid)), 0644)
	if err != nil {
		printWarn("Failed to write PID file: %v", err)
	}

	out.Close()

	time.Sleep(1500 * time.Millisecond)
	if checkProcessRunning(pid) {
		printSuccess("LexHub daemon started successfully! (PID: %d)", pid)
		printSuccess("Web UI: http://localhost:3000")
	} else {
		printError("Daemon process terminated immediately. Check log: %s", logFile)
	}
}

func stopDaemon(lexHubDir string) {
	pidFile := filepath.Join(lexHubDir, "server.pid")
	pidData, err := os.ReadFile(pidFile)
	if err != nil {
		printWarn("LexHub daemon is not running (no PID file)")
		return
	}

	pid, err := strconv.Atoi(strings.TrimSpace(string(pidData)))
	if err != nil {
		printError("Invalid PID in file: %v", err)
		return
	}

	if !checkProcessRunning(pid) {
		printWarn("LexHub daemon is not running")
		os.Remove(pidFile)
		return
	}

	printInfo("Stopping LexHub daemon (PID: %d)...", pid)
	err = killProcessGroup(pid)
	if err != nil {
		printError("Failed to kill process group: %v", err)
		return
	}

	os.Remove(pidFile)
	printSuccess("LexHub daemon stopped successfully.")
}

func checkStatus(lexHubDir string) {
	pidFile := filepath.Join(lexHubDir, "server.pid")
	running := false
	pid := 0

	if pidData, err := os.ReadFile(pidFile); err == nil {
		if p, err := strconv.Atoi(strings.TrimSpace(string(pidData))); err == nil {
			if checkProcessRunning(p) {
				running = true
				pid = p
			}
		}
	}

	if running {
		printSuccess("LexHub Daemon: RUNNING (PID: %d)", pid)
	} else {
		printWarn("LexHub Daemon: STOPPED")
	}

	coreDir := filepath.Join(lexHubDir, "core")
	if _, err := os.Stat(filepath.Join(coreDir, "dist", "index.js")); err == nil {
		runCmd(coreDir, "node", "dist/index.js", "status")
	} else if _, err := os.Stat(filepath.Join(coreDir, "src", "index.ts")); err == nil {
		runCmd(coreDir, "npx", "tsx", "src/index.ts", "status")
	}
}

func tailLog(logPath string) {
	file, err := os.Open(logPath)
	if err != nil {
		printError("Failed to open log file: %v", err)
		return
	}
	defer file.Close()

	info, err := file.Stat()
	if err == nil {
		offset := info.Size() - 4096
		if offset < 0 {
			offset = 0
		}
		file.Seek(offset, io.SeekStart)
	}

	buf := make([]byte, 4096)
	n, _ := file.Read(buf)
	if n > 0 {
		fmt.Print(string(buf[:n]))
	}

	file.Seek(0, io.SeekEnd)

	for {
		n, err := file.Read(buf)
		if n > 0 {
			fmt.Print(string(buf[:n]))
		}
		if err == io.EOF {
			time.Sleep(500 * time.Millisecond)
			continue
		}
		if err != nil {
			break
		}
	}
}

func forwardCommand(lexHubDir string, args []string) {
	coreDir := filepath.Join(lexHubDir, "core")
	var entryCmd string
	var entryArgs []string

	if _, err := os.Stat(filepath.Join(coreDir, "dist", "index.js")); err == nil {
		entryCmd = "node"
		entryArgs = append([]string{"dist/index.js"}, args...)
	} else if _, err := os.Stat(filepath.Join(coreDir, "src", "index.ts")); err == nil {
		entryCmd = "npx"
		entryArgs = append([]string{"tsx", "src/index.ts"}, args...)
	} else {
		printError("Could not find dist/index.js or src/index.ts in %s. Please run 'lh install' first.", coreDir)
		return
	}

	if err := runCmd(coreDir, entryCmd, entryArgs...); err != nil {
		os.Exit(1)
	}
}

func cleanOldTermuxBashrc() {
	home, err := os.UserHomeDir()
	if err != nil {
		return
	}
	bashrc := filepath.Join(home, ".bashrc")
	content, err := os.ReadFile(bashrc)
	if err != nil {
		return
	}
	lines := strings.Split(string(content), "\n")
	var newLines []string
	skip := false
	found := false
	for _, line := range lines {
		if strings.TrimSpace(line) == "# === LexHub AutoStart BEGIN ===" {
			skip = true
			found = true
			continue
		}
		if skip && strings.TrimSpace(line) == "# === LexHub AutoStart END ===" {
			skip = false
			continue
		}
		if !skip {
			newLines = append(newLines, line)
		}
	}
	if found {
		os.WriteFile(bashrc, []byte(strings.Join(newLines, "\n")), 0644)
	}
}

func enableAutostart(lexHubDir string) {
	goos := runtime.GOOS
	
	execPath, err := os.Executable()
	if err != nil {
		execPath = filepath.Join(lexHubDir, "lh")
	}

	if isTermux() {
		cleanOldTermuxBashrc()
		
		if _, err := exec.LookPath("sv"); err != nil {
			printInfo("正在为您自动安装 termux-services...")
			installTermuxPackage("termux-services")
		}

		prefix := os.Getenv("PREFIX")
		if prefix == "" {
			prefix = "/data/data/com.termux/files/usr"
		}
		
		svcDir := filepath.Join(prefix, "var", "service", "lexhub")
		os.MkdirAll(svcDir, 0755)
		
		runScript := filepath.Join(svcDir, "run")
		runContent := fmt.Sprintf("#!%s/bin/sh\nexec 2>&1\nexec \"%s\"\n", prefix, execPath)
		os.WriteFile(runScript, []byte(runContent), 0755)
		
		logDir := filepath.Join(lexHubDir, "logs", "daemon")
		os.MkdirAll(logDir, 0755)
		svcLogDir := filepath.Join(svcDir, "log")
		os.MkdirAll(svcLogDir, 0755)
		logRunScript := filepath.Join(svcLogDir, "run")
		logRunContent := fmt.Sprintf("#!%s/bin/sh\nexec svlogd -tt \"%s\"\n", prefix, logDir)
		os.WriteFile(logRunScript, []byte(logRunContent), 0755)

		runCmd("", "sv-enable", "lexhub")
		
		printSuccess("已通过 termux-services (sv) 成功配置 Android 后台原生开机自启！")
		return
	}
	
	home, err := os.UserHomeDir()
	if err != nil {
		printError("Failed to get user home: %v", err)
		return
	}

	switch goos {
	case "linux":
		systemdDir := filepath.Join(home, ".config", "systemd", "user")
		os.MkdirAll(systemdDir, 0755)
		serviceFile := filepath.Join(systemdDir, "lexhub.service")
		serviceContent := fmt.Sprintf(`[Unit]
Description=LexHub Daemon
After=network.target

[Service]
ExecStart=%s start
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
`, execPath)
		os.WriteFile(serviceFile, []byte(serviceContent), 0644)
		runCmd("", "systemctl", "--user", "daemon-reload")
		runCmd("", "systemctl", "--user", "enable", "--now", "lexhub.service")
		runCmd("", "loginctl", "enable-linger", os.Getenv("USER"))
		printSuccess("已通过 Systemd 成功配置 Linux 开机自启。")
	case "darwin":
		launchAgentsDir := filepath.Join(home, "Library", "LaunchAgents")
		os.MkdirAll(launchAgentsDir, 0755)
		plistFile := filepath.Join(launchAgentsDir, "com.lexhub.daemon.plist")
		plistContent := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.lexhub.daemon</string>
    <key>ProgramArguments</key>
    <array>
        <string>%s</string>
        <string>start</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>`, execPath)
		os.WriteFile(plistFile, []byte(plistContent), 0644)
		runCmd("", "launchctl", "load", "-w", plistFile)
		printSuccess("已通过 Launchd 成功配置 macOS 开机自启。")
	case "windows":
		appData := os.Getenv("APPDATA")
		if appData == "" {
			printError("APPDATA env not found.")
			return
		}
		startupDir := filepath.Join(appData, "Microsoft", "Windows", "Start Menu", "Programs", "Startup")
		os.MkdirAll(startupDir, 0755)
		vbsFile := filepath.Join(startupDir, "lexhub-autostart.vbs")
		vbsContent := fmt.Sprintf(`Set WshShell = CreateObject("WScript.Shell")` + "\n" + `WshShell.Run """%s"" start", 0, False`, execPath)
		os.WriteFile(vbsFile, []byte(vbsContent), 0644)
		printSuccess("已通过启动文件夹成功配置 Windows 隐藏式开机自启。")
	default:
		printError("Unsupported OS for native autostart: %s", goos)
	}
}

func disableAutostart(lexHubDir string) {
	goos := runtime.GOOS

	if isTermux() {
		cleanOldTermuxBashrc()
		runCmd("", "sv-disable", "lexhub")
		printSuccess("已取消 Termux (sv) 开机自启。")
		return
	}
	
	home, err := os.UserHomeDir()
	if err != nil {
		return
	}

	switch goos {
	case "linux":
		runCmd("", "systemctl", "--user", "disable", "--now", "lexhub.service")
		serviceFile := filepath.Join(home, ".config", "systemd", "user", "lexhub.service")
		os.Remove(serviceFile)
		runCmd("", "systemctl", "--user", "daemon-reload")
		printSuccess("已取消 Linux 开机自启。")
	case "darwin":
		plistFile := filepath.Join(home, "Library", "LaunchAgents", "com.lexhub.daemon.plist")
		runCmd("", "launchctl", "unload", "-w", plistFile)
		os.Remove(plistFile)
		printSuccess("已取消 macOS 开机自启。")
	case "windows":
		appData := os.Getenv("APPDATA")
		vbsFile := filepath.Join(appData, "Microsoft", "Windows", "Start Menu", "Programs", "Startup", "lexhub-autostart.vbs")
		os.Remove(vbsFile)
		printSuccess("已取消 Windows 开机自启。")
	}
}

func checkAutostart(lexHubDir string) {
	goos := runtime.GOOS
	
	home, err := os.UserHomeDir()
	if err != nil {
		fmt.Println("disabled")
		return
	}

	if isTermux() {
		prefix := os.Getenv("PREFIX")
		if prefix == "" {
			prefix = "/data/data/com.termux/files/usr"
		}
		serviceFile := filepath.Join(prefix, "var", "service", "lexhub", "run")
		downFile := filepath.Join(prefix, "var", "service", "lexhub", "down")
		
		if _, err := os.Stat(serviceFile); err == nil {
			if _, errDown := os.Stat(downFile); errDown != nil {
				fmt.Println("enabled")
				return
			}
		}
		fmt.Println("disabled")
		return
	}

	switch goos {
	case "linux":
		serviceFile := filepath.Join(home, ".config", "systemd", "user", "lexhub.service")
		if _, err := os.Stat(serviceFile); err == nil {
			fmt.Println("enabled")
		} else {
			fmt.Println("disabled")
		}
	case "darwin":
		plistFile := filepath.Join(home, "Library", "LaunchAgents", "com.lexhub.daemon.plist")
		if _, err := os.Stat(plistFile); err == nil {
			fmt.Println("enabled")
		} else {
			fmt.Println("disabled")
		}
	case "windows":
		appData := os.Getenv("APPDATA")
		vbsFile := filepath.Join(appData, "Microsoft", "Windows", "Start Menu", "Programs", "Startup", "lexhub-autostart.vbs")
		if _, err := os.Stat(vbsFile); err == nil {
			fmt.Println("enabled")
		} else {
			fmt.Println("disabled")
		}
	default:
		fmt.Println("disabled")
	}
}

func printHelp() {
	fmt.Println("LexHub AI 应用管理器 v2.0")
	fmt.Println("\n用法:")
	fmt.Println("  lh [command] [args...]")
	fmt.Println("\n系统管理命令 (LexHub 主服务):")
	fmt.Println("  start           后台启动 LexHub 主服务")
	fmt.Println("  stop            停止 LexHub 主服务")
	fmt.Println("  restart         重启 LexHub 主服务")
	fmt.Println("  status | ps     查看系统与应用运行状态")
	fmt.Println("  log             查看 LexHub 系统日志")
	fmt.Println("  update          自动更新并编译 LexHub")
	fmt.Println("  enable          开启全平台开机自启 (支持 Win/Mac/Linux/Termux)")
	fmt.Println("  disable         关闭全平台开机自启")
	fmt.Println("  autostart-status 查看自启状态 (供前端使用)")
	fmt.Println("  sysinfo         查看设备与系统负载信息")
	fmt.Println("  help            显示此帮助信息")
	fmt.Println("\n应用管理命令 (支持缩写，例如 lh start st):")
	fmt.Println("  lh list | ls         列出已安装的应用")
	fmt.Println("  lh store             浏览云端应用商店")
	fmt.Println("  lh install <app>     安装指定应用")
	fmt.Println("  lh uninstall <app>   卸载指定应用")
	fmt.Println("  lh start <app>       启动应用")
	fmt.Println("  lh stop <app>        停止应用")
	fmt.Println("  lh restart <app>     重启应用")
	fmt.Println("  lh update <app>      更新应用源码")
	fmt.Println("  lh log <app>         查看应用日志")
	fmt.Println("  lh config <app>      修改应用配置")
}

func main() {
	lexHubDir := getLexHubDir()

	if len(os.Args) < 2 {
		coreDir := filepath.Join(lexHubDir, "core")
		_, errDist := os.Stat(filepath.Join(coreDir, "dist", "index.js"))
		_, errSrc := os.Stat(filepath.Join(coreDir, "src", "index.ts"))
		if errDist != nil && errSrc != nil {
			printInfo("检测到 LexHub 尚未安装，正在启动安装程序...")
			installOrUpdate(lexHubDir, false)
			return
		}

		// 默认启动后台守护进程（Daemon 模式）
		startDaemon(lexHubDir)
		return
	}

	cmd := os.Args[1]
	switch cmd {
	case "start":
		if len(os.Args) > 2 {
			forwardCommand(lexHubDir, os.Args[1:])
		} else {
			startDaemon(lexHubDir)
		}
	case "stop":
		if len(os.Args) > 2 {
			forwardCommand(lexHubDir, os.Args[1:])
		} else {
			stopDaemon(lexHubDir)
		}
	case "restart":
		if len(os.Args) > 2 {
			forwardCommand(lexHubDir, os.Args[1:])
		} else {
			stopDaemon(lexHubDir)
			time.Sleep(1 * time.Second)
			startDaemon(lexHubDir)
		}
	case "status", "ps":
		if len(os.Args) > 2 {
			forwardCommand(lexHubDir, os.Args[1:])
		} else {
			checkStatus(lexHubDir)
		}
	case "log":
		if len(os.Args) > 2 {
			forwardCommand(lexHubDir, os.Args[1:])
		} else {
			logFile := filepath.Join(lexHubDir, "logs", "server.log")
			tailLog(logFile)
		}
	case "install":
		if len(os.Args) > 2 {
			forwardCommand(lexHubDir, os.Args[1:])
		} else {
			installOrUpdate(lexHubDir, false)
		}
	case "update":
		if len(os.Args) > 2 {
			forwardCommand(lexHubDir, os.Args[1:])
		} else {
			installOrUpdate(lexHubDir, true)
		}
	case "enable":
		enableAutostart(lexHubDir)
	case "disable":
		disableAutostart(lexHubDir)
	case "autostart-status":
		checkAutostart(lexHubDir)
	case "help", "-h", "--help":
		printHelp()
	default:
		forwardCommand(lexHubDir, os.Args[1:])
	}
}

func downloadCloudflared(lexHubDir string, bestUrl string) {
	printInfo("正在配置 Cloudflare 穿透网关依赖...")
	
	// Check if Termux
	isTermux := false
	if prefix := os.Getenv("PREFIX"); prefix != "" && strings.Contains(prefix, "com.termux") {
		isTermux = true
	}
	if _, err := exec.LookPath("termux-setup-storage"); err == nil {
		isTermux = true
	}

	if isTermux {
		printInfo("检测到 Termux 环境，正在检查/安装 cloudflared...")
		if _, err := exec.LookPath("cloudflared"); err == nil {
			printSuccess("Termux 环境下的 cloudflared 已安装。")
			return
		}
		if err := installTermuxPackage("cloudflared"); err != nil {
			printWarn("安装 cloudflared 失败，请尝试在 Termux 手动运行 'pkg install cloudflared'：%v", err)
		} else {
			printSuccess("Termux 环境下的 cloudflared 安装成功！")
		}
		return
	}

	// For standard platforms, download to modules/cloudflare/app/bin/
	cfBinDir := filepath.Join(lexHubDir, "modules", "cloudflare", "app", "bin")
	if err := os.MkdirAll(cfBinDir, 0755); err != nil {
		printError("创建 Cloudflare 依赖目录失败：%v", err)
		return
	}

	ext := ""
	if runtime.GOOS == "windows" {
		ext = ".exe"
	}
	cfBinPath := filepath.Join(cfBinDir, "cloudflared"+ext)

	// Check if already exists
	if _, err := os.Stat(cfBinPath); err == nil {
		printSuccess("检测到 cloudflared 引擎已安装。")
		return
	}

	// Determine platform and architecture
	goos := runtime.GOOS
	goarch := runtime.GOARCH
	
	dlOS := goos
	if dlOS == "darwin" {
		dlOS = "darwin"
	} else if dlOS == "windows" {
		dlOS = "windows"
	} else {
		dlOS = "linux"
	}

	dlArch := "amd64"
	if goarch == "arm64" || goarch == "aarch64" {
		dlArch = "arm64"
	} else if goarch == "arm" {
		dlArch = "arm"
	}

	filename := fmt.Sprintf("cloudflared-%s-%s%s", dlOS, dlArch, ext)
	if dlOS == "windows" {
		filename = fmt.Sprintf("cloudflared-windows-%s.exe", dlArch)
	} else if dlOS == "darwin" {
		filename = "cloudflared-darwin-amd64"
	}
	
	rawUrl := fmt.Sprintf("https://github.com/cloudflare/cloudflared/releases/latest/download/%s", filename)
	
	// Rewrite URL with mirror prefix if applicable
	mirrorPrefix := ""
	if strings.Contains(bestUrl, "/https://github.com/") {
		mirrorPrefix = strings.Split(bestUrl, "https://github.com/")[0]
	}
	downloadUrl := mirrorPrefix + rawUrl

	printInfo("正在下载 cloudflared 二进制文件，这可能需要一些时间...")
	printInfo("下载地址: %s", downloadUrl)

	err := downloadFile(downloadUrl, cfBinPath)
	if err != nil {
		printError("下载 cloudflared 二进制失败：%v", err)
		return
	}

	if runtime.GOOS != "windows" {
		if err := os.Chmod(cfBinPath, 0755); err != nil {
			printError("设置 cloudflared 可执行权限失败：%v", err)
			return
		}
	}
	printSuccess("cloudflared 引擎下载安装成功！")
}

func downloadFile(url string, destPath string) error {
	client := &http.Client{Timeout: 10 * time.Minute}
	resp, err := client.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("bad status: %s", resp.Status)
	}

	out, err := os.Create(destPath)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, resp.Body)
	return err
}

func installTermuxPackage(name string) error {
	if os.Getuid() == 0 {
		return runCmd("", "apt-get", "install", "-y", name)
	}
	if err := runCmd("", "pkg", "install", "-y", name); err != nil {
		return runCmd("", "apt-get", "install", "-y", name)
	}
	return nil
}
