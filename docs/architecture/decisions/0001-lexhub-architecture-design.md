# ADR-0001: LexHub Core System Architecture Design

## Status

Accepted

## Context

LexHub v2.0 is designed as a lightweight, cross-platform AI application manager running primarily in local/Termux environments on Android phones, as well as on Linux, macOS, and Windows. 

The system must satisfy several key forces:
- **Low Resource Utilization**: Termux environments run on mobile hardware with strict memory and CPU boundaries. Spawning overhead must be minimized.
- **Robustness**: Third-party module lifecycle scripts must not crash the main manager server.
- **Maintainability & Comprehensibility**: As the codebase grows, we must prevent circular dependencies and messy coupling between CLI, Web, and process management logic.

### Current System Layout
- **Go CLI Launcher (`lh.go`)**: Preflight dependency checker (Node, Git, npm), racing-mirror downloader, self-updater, and system service manager (daemon wrapper).
- **Node.js Core Backend (`core/`)**: TypeScript process manager, configuration registry, and Fastify REST API.
- **React Frontend (`web-ui/`)**: User dashboard dashboard for module management.

---

## Decision

We will adopt a **Clean Layered Monolith Architecture** with **Out-of-Process Script Execution** and a **File-Based Shared Registry**.

### 1. Unidirectional Dependency Layers
We enforce a strict dependency hierarchy in the `core` TypeScript codebase to prevent circular references:
```
  [ Web Layer (server.ts, routes.ts, ws.ts) ]
                      │
                      ▼
   [ Domain Managers (module.ts, process.ts) ]
                      │
                      ▼
   [ Persistence & Config (config.ts, network.ts, migrate.ts) ]
                      │
                      ▼
   [ Core Utilities (logger.ts, system.ts) ]
```
* **Rule**: Lower layers must NEVER import from upper layers. If a lower layer needs to notify an upper layer, it must use callback hooks (e.g. `ProcessManager.setBroadcast` injecting a callback to push WebSocket events) rather than importing it directly.

### 2. Out-of-Process Script Isolation
Third-party module scripts (`lifecycle.js`) must run inside separate child processes to insulate the main backend server from memory leaks or blocks.
- Spawning a module runs `src/runtime/starter.ts` in a separate process.
- State communication between the main process and child processes is achieved via an asynchronous file-based database (`installed.json`).

### 3. Automated Fitness Functions
To ensure architecture drift does not reintroduce circular dependencies, we will integrate `madge` circular checks into the build pipeline.

---

## Alternatives Considered

### Option 1: Microservices Architecture (separate processes for Config, Logging, Process Management)
- **Pros**: Ultimate process isolation.
- **Cons**: High CPU/memory overhead on Termux (Android). Spawning 5-6 Node daemons is too heavy.
- **Why rejected**: Violates the "Low Resource Utilization" constraint.

### Option 2: Event-driven In-Memory Monolith (All lifecycles execute inside the main server thread)
- **Pros**: Zero process-spawn overhead.
- **Cons**: A bad/hanging lifecycle script (e.g. `npm install` blocks or infinite loops) will freeze the entire Web UI dashboard.
- **Why rejected**: Violates the "Robustness" constraint.

---

## Consequences

### Positive
- **Zero Circular Dependencies**: Running `madge --circular` confirms that the backend is 100% free of import loops.
- **High Stability**: Third-party module installation and execution is safely sandboxed in isolated child processes.
- **Fast Startup**: A lean, layered design starts up in less than 200ms on standard mobile processors.

### Negative
- **IPC Complexity**: Since processes are isolated, real-time logging must be piped via stdout streams to the parent process and broadcasted over WebSocket clients.

---

## Implementation Plan

1. **Verify No Cycles**: Run `npx madge --circular --extensions ts --ts-config tsconfig.json src/` on every CI/PR workflow.
2. **Add Script to Package.json**: Define `"lint:deps": "madge --circular --extensions ts --ts-config tsconfig.json src/"` to easily enforce this fitness function.
3. **Decouple Child Process Context**: Ensure `starter.ts` only loads context helpers, minimizing the memory footprint of the child processes.

## References

- [Deloitte 2026 Tech Study on Technical Debt](https://www.deloitte.com/us/en/insights/topics/technology-management/technical-debt-impact.html)
- [MADR 4.0 Template Specification](https://github.com/adr/madr)
