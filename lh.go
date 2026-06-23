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

func runCmd(dir string, name string, args ...string) error {
	cmd := exec.Command(name, args...)
	cmd.Dir = dir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin
	return cmd.Run()
}

func checkDependencies() {
	_, errNode := exec.LookPath("node")
	_, errGit := exec.LookPath("git")
	_, errNpm := exec.LookPath("npm")

	if errNode != nil || errGit != nil || errNpm != nil {
		printWarn("Missing some system dependencies (node/git/npm). Attempting to resolve...")
		installSystemDependencies()
	}
}

func installSystemDependencies() {
	goos := runtime.GOOS
	isTermux := os.Getenv("TERMUX_VERSION") != "" || os.Getenv("PREFIX") != ""

	if isTermux {
		printInfo("Termux detected. Installing git and nodejs...")
		runCmd("", "pkg", "update", "-y")
		runCmd("", "pkg", "install", "git", "nodejs", "-y")
		return
	}

	switch goos {
	case "darwin":
		printInfo("macOS detected. Checking for Homebrew...")
		if _, err := exec.LookPath("brew"); err == nil {
			runCmd("", "brew", "install", "git", "node")
		} else {
			printError("Homebrew not found. Please install Homebrew or install git & node manually.")
		}
	case "linux":
		if _, err := exec.LookPath("apt-get"); err == nil {
			printInfo("Debian/Ubuntu detected. Installing git and nodejs...")
			if os.Getuid() == 0 {
				runCmd("", "apt-get", "update", "-y")
				runCmd("", "apt-get", "install", "-y", "git", "nodejs")
			} else {
				printInfo("Not root. Requesting sudo to install dependencies...")
				runCmd("", "sudo", "apt-get", "update", "-y")
				runCmd("", "sudo", "apt-get", "install", "-y", "git", "nodejs")
			}
		} else if _, err := exec.LookPath("yum"); err == nil {
			printInfo("RedHat/CentOS detected. Installing git and nodejs...")
			if os.Getuid() == 0 {
				runCmd("", "yum", "install", "-y", "git", "nodejs")
			} else {
				runCmd("", "sudo", "yum", "install", "-y", "git", "nodejs")
			}
		} else {
			printWarn("Unsupported Linux distribution. Please install git and nodejs manually.")
		}
	case "windows":
		printError("On Windows, please install Git and Node.js manually: \n  - Git: https://git-scm.com\n  - Node.js: https://nodejs.org")
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
	printInfo("Starting LexHub Setup...")
	checkDependencies()

	printInfo("Racing GitHub mirrors for optimal speed...")
	bestUrl := raceMirrors()
	printSuccess("Using download source: %s", bestUrl)

	if _, err := os.Stat(filepath.Join(lexHubDir, ".git")); err == nil {
		printInfo("Existing repository found. Fetching updates...")
		if err := runCmd(lexHubDir, "git", "remote", "set-url", "origin", bestUrl); err != nil {
			printError("Failed to update remote URL: %v", err)
			return
		}
		if err := runCmd(lexHubDir, "git", "fetch", "origin"); err != nil {
			printError("Failed to fetch from origin: %v", err)
			return
		}
		if err := runCmd(lexHubDir, "git", "reset", "--hard", "FETCH_HEAD"); err != nil {
			printError("Failed to hard reset repository: %v", err)
			return
		}
	} else {
		printInfo("Cloning repository into %s...", lexHubDir)
		parentDir := filepath.Dir(lexHubDir)
		if err := os.MkdirAll(parentDir, 0755); err != nil {
			printError("Failed to create parent directory: %v", err)
			return
		}
		if err := runCmd(parentDir, "git", "clone", "--depth", "1", bestUrl, filepath.Base(lexHubDir)); err != nil {
			printError("Failed to clone repository: %v", err)
			return
		}
	}

	printInfo("Installing root level dependencies...")
	if err := runCmd(lexHubDir, "npm", "install", "yaml", "--save-exact"); err != nil {
		printWarn("Root level dependency installation returned code: %v", err)
	}

	coreDir := filepath.Join(lexHubDir, "core")
	printInfo("Installing dependencies for Core...")
	if err := runCmd(coreDir, "npm", "install"); err != nil {
		printError("Failed to install core dependencies: %v", err)
		return
	}
	printInfo("Building Core...")
	if err := runCmd(coreDir, "npm", "run", "build"); err != nil {
		printError("Failed to build core: %v", err)
		return
	}

	webUiDir := filepath.Join(lexHubDir, "web-ui")
	printInfo("Installing dependencies for Web UI...")
	if err := runCmd(webUiDir, "npm", "install"); err != nil {
		printError("Failed to install web-ui dependencies: %v", err)
		return
	}
	printInfo("Building Web UI...")
	if err := runCmd(webUiDir, "npm", "run", "build"); err != nil {
		printError("Failed to build web-ui: %v", err)
		return
	}

	injectShellAlias(lexHubDir)
	if runtime.GOOS == "windows" {
		printSuccess("LexHub setup completed successfully!")
	}
}

func injectShellAlias(lexHubDir string) {
	goos := runtime.GOOS
	if goos == "windows" {
		printInfo("要在 Windows 上方便地运行 LexHub，建议将 %s 目录添加到您的系统环境变量 PATH 中。", lexHubDir)
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

	aliasLine := fmt.Sprintf("alias lh='%s'", execPath)
	hasInjected := false

	for _, rc := range rcFiles {
		if _, err := os.Stat(rc); err == nil {
			content, err := os.ReadFile(rc)
			if err != nil {
				continue
			}

			lines := strings.Split(string(content), "\n")
			var newLines []string
			for _, line := range lines {
				if !strings.HasPrefix(strings.TrimSpace(line), "alias lh=") {
					newLines = append(newLines, line)
				}
			}
			newLines = append(newLines, aliasLine)

			err = os.WriteFile(rc, []byte(strings.Join(newLines, "\n")), 0644)
			if err == nil {
				printSuccess("已成功将快捷别名 'lh' 写入配置文件：%s", rc)
				hasInjected = true
			}
		}
	}

	if hasInjected {
		fmt.Println()
		printSuccess(colorGreen + "★ LexHub 安装并初始化完成！" + colorReset)
		printSuccess(colorYellow + "【重要步骤】请在终端执行以下命令激活 'lh' 命令行工具：" + colorReset)
		fmt.Printf("\n    " + colorGreen + "source ~/.bashrc" + colorReset + "  (若使用 Zsh，请执行: " + colorGreen + "source ~/.zshrc" + colorReset + ")\n\n")
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

func printHelp() {
	fmt.Println("LexHub AI 应用管理器 v2.0")
	fmt.Println("\n用法:")
	fmt.Println("  lh [command] [args...]")
	fmt.Println("\n内置服务管理命令 (管理主服务后台守护进程):")
	fmt.Println("  start           后台启动 LexHub 主服务")
	fmt.Println("  stop            停止 LexHub 主服务")
	fmt.Println("  restart         重启 LexHub 主服务")
	fmt.Println("  status | ps     查看主服务与已安装模块的状态")
	fmt.Println("  log             查看/追踪主服务后台运行日志")
	fmt.Println("  install         安装/重新安装 LexHub 项目")
	fmt.Println("  update          从最优镜像源更新并编译 LexHub")
	fmt.Println("  help            显示此帮助信息")
	fmt.Println("\n应用/模块管理命令 (转发给模块管理器):")
	fmt.Println("  lh start <module>    启动指定模块 (例如: lh start sillytavern)")
	fmt.Println("  lh stop <module>     停止指定模块")
	fmt.Println("  lh restart <module>  重启指定模块")
	fmt.Println("  lh install <module>  安装指定模块")
	fmt.Println("  lh info <module>     查看指定模块详情")
	fmt.Println("  lh log <module>      查看指定模块日志")
	fmt.Println("  lh sysinfo           查看系统运行信息")
}

func main() {
	lexHubDir := getLexHubDir()

	if len(os.Args) < 2 {
		coreDir := filepath.Join(lexHubDir, "core")
		_, errDist := os.Stat(filepath.Join(coreDir, "dist", "index.js"))
		_, errSrc := os.Stat(filepath.Join(coreDir, "src", "index.ts"))
		if errDist != nil && errSrc != nil {
			printInfo("LexHub is not installed. Initiating installation flow...")
			installOrUpdate(lexHubDir, false)
			return
		}

		printInfo("LexHub is installed. Starting in the foreground...")
		var entryCmd string
		var entryArgs []string
		if errDist == nil {
			entryCmd = "node"
			entryArgs = []string{"dist/index.js", "web"}
		} else {
			entryCmd = "npx"
			entryArgs = []string{"tsx", "src/index.ts", "web"}
		}
		if err := runCmd(coreDir, entryCmd, entryArgs...); err != nil {
			os.Exit(1)
		}
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
		installOrUpdate(lexHubDir, true)
	case "help", "-h", "--help":
		printHelp()
	default:
		forwardCommand(lexHubDir, os.Args[1:])
	}
}
