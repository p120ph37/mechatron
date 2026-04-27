#!/usr/bin/env bash
# CI test runner — invoked by .github/workflows/build-reusable.yml.
#
# Expected env vars (set by the workflow step):
#   MATRIX_ARCH   — matrix.arch  (x64, arm64, ia32)
#   MATRIX_OS     — matrix.os    (ubuntu-24.04, macos-15, windows-latest, …)
#   RUNNER_OS     — runner.os    (Linux, macOS, Windows)
#   RUNNER_ARCH   — runner.arch  (X64, ARM64)
#   RUNNER_TEMP   — runner.temp  (per-job temp directory)
set -euo pipefail

JUNIT_DIR="${RUNNER_TEMP}/junit"
COV_DIR="${RUNNER_TEMP}/coverage"
mkdir -p "$JUNIT_DIR" "$COV_DIR"
TEST_LOG="${RUNNER_TEMP}/test-output.txt"
: > "$TEST_LOG"

run_and_log() { "$@" 2>&1 | tee -a "$TEST_LOG"; return "${PIPESTATUS[0]}"; }

run_bun() {
  local LABEL="$1"; shift
  local JUNIT_FILE="$1"; shift
  [ "$1" = "--" ] && shift
  echo ">>> [$LABEL]: $*" | tee -a "$TEST_LOG"
  run_and_log "$@"
}

# Write a synthetic JUnit failure when a backend crashes before producing output.
synth_junit_failure() {
  local JUNIT_FILE="$1" LABEL="$2" MSG="$3"
  printf '<?xml version="1.0" encoding="UTF-8"?>\n' > "$JUNIT_FILE"
  printf '<testsuites tests="1" failures="1">\n' >> "$JUNIT_FILE"
  printf '  <testsuite name="%s-backend" tests="1" failures="1">\n' "$LABEL" >> "$JUNIT_FILE"
  printf '    <testcase name="%s backend startup" classname="backend" time="0">\n' "$LABEL" >> "$JUNIT_FILE"
  printf '      <failure message="%s"/>\n' "$MSG" >> "$JUNIT_FILE"
  printf '    </testcase>\n' >> "$JUNIT_FILE"
  printf '  </testsuite>\n' >> "$JUNIT_FILE"
  printf '</testsuites>\n' >> "$JUNIT_FILE"
}

# Guard: check a backend exit code and synthesize JUnit on crash.
guard_junit() {
  local BE_RC="$1" JUNIT_FILE="$2" LABEL="$3" MSG="$4"
  if [ "$BE_RC" != 0 ] && ! grep -q "<testcase" "$JUNIT_FILE" 2>/dev/null; then
    synth_junit_failure "$JUNIT_FILE" "$LABEL" "$MSG"
  fi
}

# ── Windows ia32: legacy node runner, napi-only, no coverage ──────
if [ "$MATRIX_ARCH" = "ia32" ]; then
  NODE_VERSION=$(node -v)
  curl -sLO "https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-win-x86.zip"
  unzip -q "node-${NODE_VERSION}-win-x86.zip"
  JUNIT_FILE="$JUNIT_DIR/mechatron-${MATRIX_OS}-${MATRIX_ARCH}.xml"
  REPORT_DIR="${RUNNER_TEMP}/node-reports"
  mkdir -p "$REPORT_DIR"
  RC=0
  run_and_log ./node-${NODE_VERSION}-win-x86/node \
    --report-on-fatalerror --report-directory="$REPORT_DIR" \
    test/test.js all --backend napi --junit "$JUNIT_FILE" \
    || RC=$?
  if [ "$RC" != 0 ]; then
    echo ">>> [ia32] node exited rc=$RC; diagnostic reports (if any):"
    ls -la "$REPORT_DIR" || true
    for rpt in "$REPORT_DIR"/*.json; do
      [ -f "$rpt" ] || continue
      echo "--- $rpt ---"
      cat "$rpt"
    done
  fi
  exit "$RC"
fi

BUN="$(command -v bun)"

# ── Per-OS test wrapper (xvfb / sudo / none) ──────────────────────
if [ "$RUNNER_OS" = "Linux" ]; then
  export DISPLAY=:99
  Xvfb :99 -screen 0 1280x1024x24 -nolisten tcp &
  XVFB_PID=$!
  for _ in $(seq 1 50); do
    xdpyinfo -display :99 >/dev/null 2>&1 && break
    sleep 0.1
  done
  openbox &
  OPENBOX_PID=$!
  sleep 0.5
  xmessage -timeout 600 -name MechatronTestWindow "mechatron test client" &
  XMESSAGE_PID=$!
  XMSG_WIN=""
  for _ in $(seq 1 100); do
    XMSG_WIN=$(xwininfo -root -tree 2>/dev/null \
      | { grep MechatronTestWindow || true; } \
      | head -1 | awk '{print $1}')
    [ -n "$XMSG_WIN" ] && break
    sleep 0.1
  done
  if [ -n "$XMSG_WIN" ]; then
    xprop -id "$XMSG_WIN" -f _NET_WM_PID 32c -set _NET_WM_PID "$XMESSAGE_PID" 2>/dev/null || true
  else
    echo ">>> warning: xmessage window not mapped within 10s; window tests may have reduced coverage"
  fi
  cleanup_x() {
    kill "$XMESSAGE_PID" "$OPENBOX_PID" "$XVFB_PID" 2>/dev/null || true
  }
  trap cleanup_x EXIT
  WRAP=()
elif [ "$RUNNER_OS" = "macOS" ]; then
  WRAP=(sudo -E)
else
  WRAP=()
fi

# ── macOS x64 on arm64 runner: swap in x64 Bun under Rosetta ──────
if [ "$RUNNER_OS" = "macOS" ] && [ "$MATRIX_ARCH" = "x64" ] && [ "$RUNNER_ARCH" != "X64" ]; then
  curl -sL "https://github.com/oven-sh/bun/releases/latest/download/bun-darwin-x64-baseline.zip" -o /tmp/bun-x64.zip
  unzip -q /tmp/bun-x64.zip -d /tmp/
  X64_BUN="/tmp/bun-darwin-x64-baseline/bun"
  chmod +x "$X64_BUN"
  BUN="$X64_BUN"
  WRAP+=(arch -x86_64)
  TCC_DB="/Library/Application Support/com.apple.TCC/TCC.db"
  for SVC in kTCCServiceAccessibility kTCCServicePostEvent kTCCServiceScreenCapture; do
    sudo sqlite3 "$TCC_DB" "INSERT OR REPLACE INTO access (service, client, client_type, auth_value, auth_reason, auth_version, flags) VALUES ('$SVC','$X64_BUN',1,2,4,1,0);" 2>/dev/null || true
  done
  sudo launchctl stop com.apple.tccd 2>/dev/null || true
  sleep 1
fi

# ── Backends per platform ─────────────────────────────────────────
BACKENDS=(napi ffi)

OVERALL_RC=0
for be in "${BACKENDS[@]}"; do
  JUNIT_FILE="$JUNIT_DIR/mechatron-${MATRIX_OS}-${MATRIX_ARCH}-$be.xml"
  BE_COV_DIR="$COV_DIR/$be"
  mkdir -p "$BE_COV_DIR"
  BE_RC=0
  MECHATRON_BACKEND="$be" \
    run_bun "$be" "$JUNIT_FILE" -- "${WRAP[@]}" "$BUN" test test/bun.test.ts \
      --coverage --coverage-reporter=lcov --coverage-dir="$BE_COV_DIR" \
      --reporter=junit --reporter-outfile="$JUNIT_FILE" \
    || BE_RC=$?
  guard_junit "$BE_RC" "$JUNIT_FILE" "$be" \
    "bun test for MECHATRON_BACKEND=${be} exited ${BE_RC} without producing a JUnit report - the backend crashed before tests could run (see test-output.txt artifact)."
  [ "$BE_RC" = 0 ] || OVERALL_RC=$BE_RC
done

# ── Linux-only: FFI + nolib[vt] input (uinput path) ──────────────
if [ "$RUNNER_OS" = "Linux" ] && [ -w /dev/uinput ]; then
  JUNIT_FILE="$JUNIT_DIR/mechatron-${MATRIX_OS}-${MATRIX_ARCH}-nolib-vt-input.xml"
  BE_COV_DIR="$COV_DIR/nolib-vt-input"
  mkdir -p "$BE_COV_DIR"
  BE_RC=0
  MECHATRON_BACKEND=ffi \
  MECHATRON_BACKEND_KEYBOARD='nolib[vt]' \
  MECHATRON_BACKEND_MOUSE='nolib[vt]' \
    run_bun "nolib-vt-input" "$JUNIT_FILE" -- "${WRAP[@]}" "$BUN" test test/bun.test.ts \
      --coverage --coverage-reporter=lcov --coverage-dir="$BE_COV_DIR" \
      --reporter=junit --reporter-outfile="$JUNIT_FILE" \
    || BE_RC=$?
  guard_junit "$BE_RC" "$JUNIT_FILE" "nolib-vt-input" \
    "bun test for nolib-vt-input exited ${BE_RC} without producing a JUnit report."
  [ "$BE_RC" = 0 ] || OVERALL_RC=$BE_RC
fi

# ── Linux-only: FFI + nolib[x11] input (xproto path) ────────────
if [ "$RUNNER_OS" = "Linux" ]; then
  JUNIT_FILE="$JUNIT_DIR/mechatron-${MATRIX_OS}-${MATRIX_ARCH}-nolib-x11-input.xml"
  BE_COV_DIR="$COV_DIR/nolib-x11-input"
  mkdir -p "$BE_COV_DIR"
  BE_RC=0
  MECHATRON_BACKEND=ffi \
  MECHATRON_BACKEND_KEYBOARD='nolib[x11]' \
  MECHATRON_BACKEND_MOUSE='nolib[x11]' \
    run_bun "nolib-x11-input" "$JUNIT_FILE" -- "${WRAP[@]}" "$BUN" test test/bun.test.ts \
      --coverage --coverage-reporter=lcov --coverage-dir="$BE_COV_DIR" \
      --reporter=junit --reporter-outfile="$JUNIT_FILE" \
    || BE_RC=$?
  guard_junit "$BE_RC" "$JUNIT_FILE" "nolib-x11-input" \
    "bun test for nolib-x11-input exited ${BE_RC} without producing a JUnit report."
  [ "$BE_RC" = 0 ] || OVERALL_RC=$BE_RC
fi

# ── Linux-only: FFI with MECHATRON_SCREEN_MECHANISM=drm ───────────
if [ "$RUNNER_OS" = "Linux" ]; then
  JUNIT_FILE="$JUNIT_DIR/mechatron-${MATRIX_OS}-${MATRIX_ARCH}-ffi-drm.xml"
  BE_COV_DIR="$COV_DIR/ffi-drm"
  mkdir -p "$BE_COV_DIR"
  BE_RC=0
  MECHATRON_BACKEND=ffi \
  MECHATRON_SCREEN_MECHANISM=drm \
    run_bun "ffi-drm" "$JUNIT_FILE" -- "${WRAP[@]}" "$BUN" test test/bun.test.ts \
      --coverage --coverage-reporter=lcov --coverage-dir="$BE_COV_DIR" \
      --reporter=junit --reporter-outfile="$JUNIT_FILE" \
    || BE_RC=$?
  guard_junit "$BE_RC" "$JUNIT_FILE" "ffi-drm" \
    "bun test for ffi-drm exited ${BE_RC} without producing a JUnit report."
  [ "$BE_RC" = 0 ] || OVERALL_RC=$BE_RC
fi

# ── Linux-only: FFI with dlopen-block LD_PRELOAD shim ─────────────
if [ "$RUNNER_OS" = "Linux" ]; then
  for variant in "no-xtst:libXtst.so.6" "no-xrandr:libXrandr.so.2"; do
    label="${variant%%:*}"
    block="${variant#*:}"
    JUNIT_FILE="$JUNIT_DIR/mechatron-${MATRIX_OS}-${MATRIX_ARCH}-ffi-${label}.xml"
    BE_COV_DIR="$COV_DIR/ffi-${label}"
    mkdir -p "$BE_COV_DIR"
    BE_RC=0
    MECHATRON_BACKEND=ffi \
    MECHATRON_BLOCK_DLOPEN="$block" \
    LD_PRELOAD="$(pwd)/test/dlopen-block.so" \
      run_bun "ffi-$label" "$JUNIT_FILE" -- "${WRAP[@]}" "$BUN" test test/bun.test.ts \
        --coverage --coverage-reporter=lcov --coverage-dir="$BE_COV_DIR" \
        --reporter=junit --reporter-outfile="$JUNIT_FILE" \
      || BE_RC=$?
    guard_junit "$BE_RC" "$JUNIT_FILE" "ffi-${label}" \
      "bun test for ffi-${label} (LD_PRELOAD dlopen-block $block) exited ${BE_RC} without producing a JUnit report."
    [ "$BE_RC" = 0 ] || OVERALL_RC=$BE_RC
  done
fi

# ── Linux-only: nolib[sh] clipboard (xclip subprocess path) ──────
if [ "$RUNNER_OS" = "Linux" ] && command -v xclip >/dev/null 2>&1; then
  JUNIT_FILE="$JUNIT_DIR/mechatron-${MATRIX_OS}-${MATRIX_ARCH}-nolib-sh-clipboard.xml"
  BE_COV_DIR="$COV_DIR/nolib-sh-clipboard"
  mkdir -p "$BE_COV_DIR"
  BE_RC=0
  MECHATRON_BACKEND=ffi \
  MECHATRON_BACKEND_CLIPBOARD='nolib[sh]' \
    run_bun "nolib-sh-clipboard" "$JUNIT_FILE" -- "${WRAP[@]}" "$BUN" test test/bun.test.ts \
      --coverage --coverage-reporter=lcov --coverage-dir="$BE_COV_DIR" \
      --reporter=junit --reporter-outfile="$JUNIT_FILE" \
    || BE_RC=$?
  guard_junit "$BE_RC" "$JUNIT_FILE" "nolib-sh-clipboard" \
    "bun test for nolib-sh-clipboard (xclip subprocess) exited ${BE_RC} without producing a JUnit report."
  [ "$BE_RC" = 0 ] || OVERALL_RC=$BE_RC
fi

# ── Linux-only: nolib[x11] clipboard (xproto selections protocol) ─
# Pin clipboard to nolib[x11] so the xproto-based ICCCM SELECTION
# protocol path in lib/nolib/clipboard.ts is exercised under Xvfb,
# rather than the subprocess fallback. Verifies the architectural
# guarantee that explicit backend preference is honored.
if [ "$RUNNER_OS" = "Linux" ]; then
  JUNIT_FILE="$JUNIT_DIR/mechatron-${MATRIX_OS}-${MATRIX_ARCH}-nolib-x11-clipboard.xml"
  BE_COV_DIR="$COV_DIR/nolib-x11-clipboard"
  mkdir -p "$BE_COV_DIR"
  BE_RC=0
  MECHATRON_BACKEND=ffi \
  MECHATRON_BACKEND_CLIPBOARD='nolib[x11]' \
    run_bun "nolib-x11-clipboard" "$JUNIT_FILE" -- "${WRAP[@]}" "$BUN" test test/bun.test.ts \
      --coverage --coverage-reporter=lcov --coverage-dir="$BE_COV_DIR" \
      --reporter=junit --reporter-outfile="$JUNIT_FILE" \
    || BE_RC=$?
  guard_junit "$BE_RC" "$JUNIT_FILE" "nolib-x11-clipboard" \
    "bun test for nolib-x11-clipboard (xproto selections) exited ${BE_RC} without producing a JUnit report."
  [ "$BE_RC" = 0 ] || OVERALL_RC=$BE_RC
fi

# ── Linux-only: AT-SPI2 portal coverage ──────────────────────────
# Boot the AT-SPI2 registry so atspiAvailable() / atspiListWindows()
# can complete without throwing. With the registry up, the unit-test
# path in test/portal.js exercises the full bus-discovery + connection
# path (lib/portal/atspi.ts coverage rises ~30%).
if [ "$RUNNER_OS" = "Linux" ] && [ -x /usr/libexec/at-spi-bus-launcher ]; then
  JUNIT_FILE="$JUNIT_DIR/mechatron-${MATRIX_OS}-${MATRIX_ARCH}-ffi-atspi.xml"
  BE_COV_DIR="$COV_DIR/ffi-atspi"
  mkdir -p "$BE_COV_DIR"
  BE_RC=0
  /usr/libexec/at-spi-bus-launcher --launch-immediately &
  ATSPI_PID=$!
  sleep 1
  MECHATRON_BACKEND=ffi \
    run_bun "ffi-atspi" "$JUNIT_FILE" -- "${WRAP[@]}" "$BUN" test test/bun.test.ts \
      --coverage --coverage-reporter=lcov --coverage-dir="$BE_COV_DIR" \
      --reporter=junit --reporter-outfile="$JUNIT_FILE" \
    || BE_RC=$?
  kill "$ATSPI_PID" 2>/dev/null || true
  guard_junit "$BE_RC" "$JUNIT_FILE" "ffi-atspi" \
    "bun test for ffi-atspi exited ${BE_RC} without producing a JUnit report."
  [ "$BE_RC" = 0 ] || OVERALL_RC=$BE_RC
fi

# ── Linux-only: nolib[portal] via Wayland (mutter --headless) ─────
if [ "$RUNNER_OS" = "Linux" ] && command -v mutter >/dev/null 2>&1; then
  JUNIT_FILE="$JUNIT_DIR/mechatron-${MATRIX_OS}-${MATRIX_ARCH}-nolib-portal.xml"
  BE_COV_DIR="$COV_DIR/nolib-portal"
  mkdir -p "$BE_COV_DIR"
  BE_RC=0

  export BUN JUNIT_FILE BE_COV_DIR
  dbus-run-session -- bash -c '
    set -x
    export XDG_SESSION_TYPE=wayland
    export XDG_CURRENT_DESKTOP=GNOME

    echo ">>> XDG_RUNTIME_DIR=$XDG_RUNTIME_DIR"
    echo ">>> DBUS_SESSION_BUS_ADDRESS=$DBUS_SESSION_BUS_ADDRESS"

    mutter --headless --virtual-monitor 1920x1080 --wayland --no-x11 &
    MUTTER_PID=$!

    for _ in $(seq 1 100); do
      WAYLAND_DISPLAY=$(ls "$XDG_RUNTIME_DIR"/wayland-* 2>/dev/null | head -1 | xargs -r basename)
      [ -n "$WAYLAND_DISPLAY" ] && break
      sleep 0.1
    done
    export WAYLAND_DISPLAY

    if [ -z "$WAYLAND_DISPLAY" ]; then
      echo ">>> warning: mutter did not create a Wayland socket within 10s"
      ls -la "$XDG_RUNTIME_DIR"/ 2>/dev/null || true
      kill "$MUTTER_PID" 2>/dev/null || true
      exit 1
    fi
    echo ">>> WAYLAND_DISPLAY=$WAYLAND_DISPLAY"

    /usr/libexec/xdg-desktop-portal &
    XDP_PID=$!
    /usr/libexec/xdg-desktop-portal-gnome &
    XDP_GNOME_PID=$!
    sleep 2

    busctl --user list 2>/dev/null | grep -i portal || echo ">>> warning: portal not on session bus"

    MECHATRON_BACKEND="nolib[portal]" \
      "$BUN" test test/bun.test.ts \
        --coverage --coverage-reporter=lcov --coverage-dir="$BE_COV_DIR" \
        --reporter=junit --reporter-outfile="$JUNIT_FILE"
    RC=$?

    kill "$XDP_GNOME_PID" "$XDP_PID" "$MUTTER_PID" 2>/dev/null || true
    exit $RC
  ' 2>&1 | tee -a "$TEST_LOG" || BE_RC=$?
  guard_junit "$BE_RC" "$JUNIT_FILE" "nolib-portal" \
    "nolib-portal test (mutter --headless + portal) exited ${BE_RC} without producing a JUnit report."
  echo ">>> nolib-portal exited with rc=$BE_RC (non-blocking)"
fi

# ── Linux-only: full GNOME Shell + mechatron-wm extension ────────
# Boots a real gnome-shell process on Xvfb so the shell loads our
# extension (mechatron-wm@mechatronic.dev) and answers the
# dev.mechatronic.WindowManager D-Bus interface. This exercises
# lib/portal/gnome-wm.ts (D-Bus client) + lib/portal/gnome-ext-installer.ts
# (extension lifecycle) end-to-end, raising portal coverage substantially
# beyond what AT-SPI / mutter --headless alone can reach.
if [ "$RUNNER_OS" = "Linux" ] && command -v gnome-shell >/dev/null 2>&1; then
  JUNIT_FILE="$JUNIT_DIR/mechatron-${MATRIX_OS}-${MATRIX_ARCH}-nolib-shell.xml"
  BE_COV_DIR="$COV_DIR/nolib-shell"
  mkdir -p "$BE_COV_DIR"
  BE_RC=0

  TOKENS_FILE="$RUNNER_TEMP/mechatron-tokens"
  EXT_UUID="mechatron-wm@mechatronic.dev"

  export BUN JUNIT_FILE BE_COV_DIR TOKENS_FILE EXT_UUID
  dbus-run-session -- bash -c '
    set -x
    export DISPLAY=:99
    export MECHATRON_TOKENS_FILE="$TOKENS_FILE"

    # Provision a token for the extension to validate against.
    EXT_TOKEN=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid)
    echo "$EXT_TOKEN" > "$TOKENS_FILE"
    chmod 600 "$TOKENS_FILE"
    export MECHATRON_GNOME_TOKEN="$EXT_TOKEN"

    # Install the mechatron-wm extension into the user-local GNOME Shell
    # extensions directory (no system install needed).
    EXT_DIR="$HOME/.local/share/gnome-shell/extensions/$EXT_UUID"
    mkdir -p "$EXT_DIR"
    cp -r extensions/gnome-wm/* "$EXT_DIR/"

    # Pre-enable via gsettings (gnome-shell reads this list on startup;
    # gnome-extensions CLI would need a running shell).
    mkdir -p "$HOME/.config/dconf"
    gsettings set org.gnome.shell enabled-extensions "['$EXT_UUID']" 2>/dev/null \
      || dconf write /org/gnome/shell/enabled-extensions "['$EXT_UUID']" 2>/dev/null \
      || echo ">>> warning: could not pre-enable extension via gsettings/dconf"
    # Also disable user-extensions safety lock that some Shell versions
    # ship with (extensions silently fail to load otherwise).
    gsettings set org.gnome.shell disable-user-extensions false 2>/dev/null || true

    # Start gnome-shell on the Xvfb display.
    gnome-shell --x11 &
    SHELL_PID=$!

    # Wait for the extension to register its D-Bus name (up to 60s —
    # gnome-shell startup is not fast in CI).
    for i in $(seq 1 120); do
      if busctl --user list 2>/dev/null | grep -q "dev.mechatronic.WindowManager"; then
        echo ">>> mechatron-wm extension registered on D-Bus after ${i}*0.5s"
        break
      fi
      sleep 0.5
      [ $((i % 20)) -eq 0 ] && echo ">>> still waiting for extension... ($i/120)"
    done

    if ! busctl --user list 2>/dev/null | grep -q "dev.mechatronic.WindowManager"; then
      echo ">>> warning: extension never registered; gnome-shell log:"
      busctl --user list 2>/dev/null | head -50 || true
      kill "$SHELL_PID" 2>/dev/null || true
      exit 1
    fi

    # Smoke-test the bus interface before running the full suite.
    busctl --user call dev.mechatronic.WindowManager \
      /dev/mechatronic/WindowManager dev.mechatronic.WindowManager \
      Ping || echo ">>> Ping failed"

    MECHATRON_BACKEND="nolib[portal]" \
      "$BUN" test test/bun.test.ts \
        --coverage --coverage-reporter=lcov --coverage-dir="$BE_COV_DIR" \
        --reporter=junit --reporter-outfile="$JUNIT_FILE"
    RC=$?

    kill "$SHELL_PID" 2>/dev/null || true
    exit $RC
  ' 2>&1 | tee -a "$TEST_LOG" || BE_RC=$?
  guard_junit "$BE_RC" "$JUNIT_FILE" "nolib-shell" \
    "nolib-shell test (gnome-shell + mechatron-wm extension) exited ${BE_RC} without producing a JUnit report."
  echo ">>> nolib-shell exited with rc=$BE_RC (non-blocking)"
fi

if [ "$RUNNER_OS" = "macOS" ]; then
  sudo chown -R "$(whoami)" "$JUNIT_DIR" "$TEST_LOG" "$COV_DIR" 2>/dev/null || true
fi

# Merge per-backend lcov.info files into a single coverage/lcov.info.
node -e "
  const fs = require('fs'), path = require('path');
  const covDir = process.argv[1];
  const files = {};
  const fnSeen = {}, brSeen = {};
  for (const sub of fs.readdirSync(covDir)) {
    const p = path.join(covDir, sub, 'lcov.info');
    if (!fs.existsSync(p)) continue;
    let sf = null;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      if (line.startsWith('SF:')) {
        sf = line.slice(3);
        if (!files[sf]) files[sf] = { da: {}, fn: [], fnda: {}, brda: [] };
      } else if (sf === null) continue;
      else if (line.startsWith('DA:')) {
        const [ln, hits] = line.slice(3).split(',').map(Number);
        files[sf].da[ln] = (files[sf].da[ln] || 0) + (hits || 0);
      } else if (line.startsWith('FN:')) {
        if (!fnSeen[sf+'|'+line]) { fnSeen[sf+'|'+line] = 1; files[sf].fn.push(line); }
      } else if (line.startsWith('FNDA:')) {
        const m = line.slice(5).split(',');
        const name = m.slice(1).join(',');
        files[sf].fnda[name] = (files[sf].fnda[name] || 0) + Number(m[0] || 0);
      } else if (line === 'end_of_record') sf = null;
    }
  }
  const out = [];
  for (const [sf, info] of Object.entries(files)) {
    out.push('TN:', 'SF:' + sf);
    for (const fn of info.fn) out.push(fn);
    for (const [name, h] of Object.entries(info.fnda)) out.push('FNDA:' + h + ',' + name);
    for (const ln of Object.keys(info.da).map(Number).sort((a, b) => a - b)) {
      out.push('DA:' + ln + ',' + info.da[ln]);
    }
    out.push('end_of_record');
  }
  fs.writeFileSync(path.join(covDir, 'lcov.info'), out.join('\n') + '\n');
" "$COV_DIR"

exit "$OVERALL_RC"
