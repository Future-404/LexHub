import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  en: {
    translation: {
      nav: {
        dashboard: "Dashboard",
        modules: "App Store",
        settings: "Settings",
      },
      common: {
        start: "Start",
        stop: "Stop",
        install: "Install",
        uninstall: "Uninstall",
        logs: "Logs",
        settings: "Settings",
        status: "Status"
      },
      status: {
        RUNNING: "Running",
        STOPPED: "Stopped",
        CRASHED: "Crashed",
        INSTALLING: "Installing",
        ERROR: "Error",
        NOT_INSTALLED: "Not Installed"
      },
      dashboard: {
        systemLoad: "System Load",
        cpu: "CPU Usage",
        memory: "Memory",
        uptime: "Uptime",
        runningApps: "Running Apps",
        noApps: "No apps installed yet.",
        error: "Failed to load system info",
        systemLogs: "System Logs"
      },
      modules: {
        error: "Failed to load module list",
        noDesc: "No description available",
        installed: "Installed",
        store: "Store",
        storeEmpty: "No modules available in store"
      },
      settings: {
        network: "Network Settings",
        strategy: "Global Strategy",
        strategyAuto: "Auto (Smart detection)",
        strategyDirect: "Direct Connect",
        strategyProxy: "Force Proxy",
        strategyMirror: "Force Mirror",
        netStatus: "Current Status",
        scanning: "Scanning...",
        rescan: "Rescan",
        general: "General",
        language: "Language",
        storeUrl: "Store Index URL"
      }
    }
  },
  zh: {
    translation: {
      nav: {
        dashboard: "仪表盘",
        modules: "应用商城",
        settings: "系统设置",
      },
      common: {
        start: "启动",
        stop: "停止",
        install: "安装",
        uninstall: "卸载",
        logs: "日志",
        settings: "设置",
        status: "状态",
        error: "出错了"
      },
      status: {
        RUNNING: "运行中",
        STOPPED: "已停止",
        CRASHED: "异常崩溃",
        INSTALLING: "安装中",
        ERROR: "错误",
        NOT_INSTALLED: "未安装"
      },
      dashboard: {
        systemLoad: "系统负载",
        cpu: "CPU 使用率",
        memory: "内存",
        uptime: "运行时间",
        runningApps: "运行中的应用",
        noApps: "暂无已安装的应用。",
        error: "加载系统信息失败",
        systemLogs: "系统日志"
      },
      modules: {
        error: "加载模块列表失败",
        noDesc: "暂无描述",
        installed: "已安装",
        store: "模块商店",
        storeEmpty: "商店中暂无模块"
      },
      settings: {
        network: "网络设置",
        strategy: "全局网络策略",
        strategyAuto: "自动分配 (智能测速)",
        strategyDirect: "全局直连 (国外服务器)",
        strategyProxy: "强制走代理",
        strategyMirror: "强制走镜像",
        netStatus: "当前网络状态",
        scanning: "测速中...",
        rescan: "重新测速",
        general: "基础设置",
        language: "显示语言",
        storeUrl: "模块商店源地址"
      }
    }
  },
  "zh-TW": {
    translation: {
      nav: {
        dashboard: "儀表盤",
        modules: "應用商城",
        settings: "系統設置",
      },
      common: {
        start: "啟動",
        stop: "停止",
        install: "安裝",
        uninstall: "卸載",
        logs: "日誌",
        settings: "設置",
        status: "狀態",
        error: "出錯了"
      },
      status: {
        RUNNING: "運行中",
        STOPPED: "已停止",
        CRASHED: "異常崩潰",
        INSTALLING: "安裝中",
        ERROR: "錯誤",
        NOT_INSTALLED: "未安裝"
      },
      dashboard: {
        systemLoad: "系統負載",
        cpu: "CPU 使用率",
        memory: "內存",
        uptime: "運行時間",
        runningApps: "運行中的應用",
        noApps: "暫無已安裝的應用。",
        error: "加載系統信息失敗",
        systemLogs: "系統日誌"
      },
      modules: {
        error: "加載模塊列表失敗",
        noDesc: "暫無描述",
        installed: "已安裝",
        store: "模塊商店",
        storeEmpty: "商店中暫無模塊"
      },
      settings: {
        network: "網絡設置",
        strategy: "全局網絡策略",
        strategyAuto: "自動分配 (智能測速)",
        strategyDirect: "全局直連 (國外服務器)",
        strategyProxy: "強制走代理",
        strategyMirror: "強制走鏡像",
        netStatus: "當前網絡狀態",
        scanning: "測速中...",
        rescan: "重新測速",
        general: "基礎設置",
        language: "顯示語言",
        storeUrl: "模塊商店源地址"
      }
    }
  }
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: localStorage.getItem('lexhub-lang') || 'zh',
    fallbackLng: 'en',
    interpolation: { escapeValue: false }
  });

export default i18n;
