# ADR-0002: ADB Keepalive & Process Persistence Architecture Design

## Status

Proposed

## Context

In Android environments, Termux processes are frequently terminated by the Android OS (especially Android 12+) due to aggressive resource management features:
1. **Phantom Process Killer**: Restricts the maximum number of child processes spawned under Termux (default limit is 32) and kills them if they exceed the limit or consume too much CPU/memory.
2. **Doze Mode & Battery Savers**: Kills background processes that don't hold active wake locks or foreground services.

To ensure LexHub and its managed modules (like SillyTavern) run uninterrupted in the background on Android, we need to introduce an **ADB-based Keepalive & Persistence** feature.

After auditing the TAV-X project's keepalive implementation, we identified several highly effective strategies that should be ported to LexHub.

---

## Decision

We will implement the ADB Keepalive system as a **core system service** integrated into the LexHub launcher/core, rather than as a pluggable module, and **only expose/activate it under Termux (Android)** environments. We will replicate and port the following core strategies from TAV-X:

### 1. ADB Universal Keepalive
* **Rationale**: Wireless pairing/connection setup, disabling Phantom Process Killer, whitelisting `com.termux` in `deviceidle`, granting system-level appops permissions (`RUN_IN_BACKGROUND`, `WAKE_LOCK`, etc.).

### 2. OEM Vendor Optimization (Aggressive Mode)
* **Rationale**: Deactivating manufacturer-specific background resource harvesters (`com.huawei.powergenie`, `com.xiaomi.joyose`, `com.coloros.athena`, `com.vivo.pem`, etc.) and launching settings activities to guide manual autostart configuration.

### 3. Audio Heartbeat (音频心跳)
* **Rationale**: Generating a base64-decoded silent `.wav` file and running `mpv` in a looping, silent, background session (registered via `termux-services` as `audio_keeper`), leveraging Android's MediaSession protection to keep the Termux process alive.

### 4. Clean Reversal/Rollback
* **Rationale**: Re-enabling vendor packages and restoring system defaults when optimization is disabled, leaving the user's Android environment completely clean.

---

## Consequences

### Positive
* **High Stability**: Eliminates random "Termux died" crashes due to phantom process limits on Android 12+.
* **True Background Running**: Prevents Node.js daemon from being swept by battery saving routines.
* **PC User Simplicity**: Zero UI clutter or settings for non-Android users.

### Negative
* **Manual Setup Step**: Android Wireless Debugging requires developer options to be enabled manually by the user on their phone first.

---

## References
* [Termux Phantom Process Issue & ADB Fix](https://github.com/termux/termux-app/issues/2366)
* [Android Wireless Debugging Specification](https://developer.android.com/tools/adb#wireless)
