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

# Append a synthetic <testcase><failure/></testcase> to an existing JUnit
# file. Used when a cell exited non-zero but its JUnit only records passes —
# e.g. the test process crashed during shutdown after writing the report.
# Without this the failure stays invisible in the PR summary comment, which
# only reads JUnit XML.
append_junit_failure() {
  local JUNIT_FILE="$1" LABEL="$2" MSG="$3"
  node -e '
    const fs = require("fs");
    const [file, label, msg] = process.argv.slice(1);
    let xml = fs.readFileSync(file, "utf8");
    const esc = s => String(s).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    const tc = "    <testcase name=\"" + esc(label + " process exit") + "\" classname=\"backend\" time=\"0\">\n" +
               "      <failure message=\"" + esc(msg) + "\"/>\n" +
               "    </testcase>\n";
    // Insert before the LAST </testsuite> in the document.
    const idx = xml.lastIndexOf("</testsuite>");
    if (idx < 0) {
      // No testsuite to inject into — overwrite with a minimal failing report.
      xml = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<testsuites>\n  <testsuite name=\"" + esc(label) + "\">\n" + tc + "  </testsuite>\n</testsuites>\n";
    } else {
      xml = xml.slice(0, idx) + tc + xml.slice(idx);
    }
    fs.writeFileSync(file, xml);
  ' "$JUNIT_FILE" "$LABEL" "$MSG"
}

# Guard: check a backend exit code and surface failure in JUnit.
#   - No testcases at all → synthesize a single failing testcase
#   - Has testcases but no failures → tests passed but the process died
#     non-zero afterward; append a synthetic failure so the PR comment
#     reflects what the CI step status already shows.
guard_junit() {
  local BE_RC="$1" JUNIT_FILE="$2" LABEL="$3" MSG="$4"
  if [ "$BE_RC" = 0 ]; then return; fi
  if ! grep -q "<testcase" "$JUNIT_FILE" 2>/dev/null; then
    synth_junit_failure "$JUNIT_FILE" "$LABEL" "$MSG"
  elif ! grep -q "<failure" "$JUNIT_FILE" 2>/dev/null; then
    append_junit_failure "$JUNIT_FILE" "$LABEL" "$MSG"
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
  guard_junit "$RC" "$JUNIT_FILE" "ia32" \
    "node exited rc=$RC after writing JUnit (likely a shutdown crash; see test-output.txt and node-reports)."
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
UNIT_DONE=false
for be in "${BACKENDS[@]}"; do
  JUNIT_FILE="$JUNIT_DIR/mechatron-${MATRIX_OS}-${MATRIX_ARCH}-$be.xml"
  BE_COV_DIR="$COV_DIR/$be"
  mkdir -p "$BE_COV_DIR"
  BE_RC=0
  # Unit tests run once in the first backend cell; subsequent cells skip them.
  SKIP_UNIT=""
  if [ "$UNIT_DONE" = true ]; then SKIP_UNIT=1; fi
  MECHATRON_BACKEND="$be" \
  MECHATRON_SKIP_UNIT="$SKIP_UNIT" \
    run_bun "$be" "$JUNIT_FILE" -- "${WRAP[@]}" "$BUN" test test/bun.test.ts \
      --coverage --coverage-reporter=lcov --coverage-dir="$BE_COV_DIR" \
      --reporter=junit --reporter-outfile="$JUNIT_FILE" \
    || BE_RC=$?
  guard_junit "$BE_RC" "$JUNIT_FILE" "$be" \
    "bun test for MECHATRON_BACKEND=${be} exited ${BE_RC} without producing a JUnit report - the backend crashed before tests could run (see test-output.txt artifact)."
  [ "$BE_RC" = 0 ] || OVERALL_RC=$BE_RC
  UNIT_DONE=true
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
  MECHATRON_SKIP_UNIT=1 \
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
  MECHATRON_SKIP_UNIT=1 \
    run_bun "nolib-x11-input" "$JUNIT_FILE" -- "${WRAP[@]}" "$BUN" test test/bun.test.ts \
      --coverage --coverage-reporter=lcov --coverage-dir="$BE_COV_DIR" \
      --reporter=junit --reporter-outfile="$JUNIT_FILE" \
    || BE_RC=$?
  guard_junit "$BE_RC" "$JUNIT_FILE" "nolib-x11-input" \
    "bun test for nolib-x11-input exited ${BE_RC} without producing a JUnit report."
  [ "$BE_RC" = 0 ] || OVERALL_RC=$BE_RC
fi

# ── Linux-only: nolib[vt] screen (framebuffer) ──────────────────
# If /dev/fb0 is already a real device, run the test directly against
# the real framebuffer.  Otherwise generate a synthetic pixel file at
# /dev/fb0 and preload fb-stub.so so the ioctl calls return valid
# geometry.  Either way, this exercises the full screen-vt.ts code path
# (ioctl bridge → geometry parse → readSync → rowToArgb).
if [ "$RUNNER_OS" = "Linux" ]; then
  FB_USE_STUB=false
  if [ -c /dev/fb0 ] && [ -r /dev/fb0 ]; then
    echo ">>> /dev/fb0 is a real device — using it directly"
  elif [ -f test/fb-stub.so ]; then
    FB_W=8 FB_H=4 FB_BPP=32
    python3 -c "
import struct, sys
W, H = $FB_W, $FB_H
for y in range(H):
    for x in range(W):
        sys.stdout.buffer.write(struct.pack('BBBB', x*30, y*60, 128, 255))
" | sudo tee /dev/fb0 > /dev/null
    sudo chmod 666 /dev/fb0
    FB_USE_STUB=true
  else
    echo ">>> skipping nolib-vt-fb: no /dev/fb0 and no fb-stub.so"
  fi

  if [ -e /dev/fb0 ]; then
    JUNIT_FILE="$JUNIT_DIR/mechatron-${MATRIX_OS}-${MATRIX_ARCH}-nolib-vt-fb.xml"
    BE_COV_DIR="$COV_DIR/nolib-vt-fb"
    mkdir -p "$BE_COV_DIR"
    BE_RC=0
    if [ "$FB_USE_STUB" = true ]; then
      MECHATRON_BACKEND=ffi \
      MECHATRON_BACKEND_SCREEN='nolib[vt]' \
      MECHATRON_FB_STUB_W=$FB_W \
      MECHATRON_FB_STUB_H=$FB_H \
      MECHATRON_FB_STUB_BPP=$FB_BPP \
      MECHATRON_SKIP_UNIT=1 \
      LD_PRELOAD="$(pwd)/test/fb-stub.so" \
        run_bun "nolib-vt-fb" "$JUNIT_FILE" -- "${WRAP[@]}" "$BUN" test test/bun.test.ts \
          --coverage --coverage-reporter=lcov --coverage-dir="$BE_COV_DIR" \
          --reporter=junit --reporter-outfile="$JUNIT_FILE" \
        || BE_RC=$?
    else
      MECHATRON_BACKEND=ffi \
      MECHATRON_BACKEND_SCREEN='nolib[vt]' \
      MECHATRON_SKIP_UNIT=1 \
        run_bun "nolib-vt-fb" "$JUNIT_FILE" -- "${WRAP[@]}" "$BUN" test test/bun.test.ts \
          --coverage --coverage-reporter=lcov --coverage-dir="$BE_COV_DIR" \
          --reporter=junit --reporter-outfile="$JUNIT_FILE" \
        || BE_RC=$?
    fi
    guard_junit "$BE_RC" "$JUNIT_FILE" "nolib-vt-fb" \
      "bun test for nolib-vt-fb (framebuffer) exited ${BE_RC} without producing a JUnit report."
    [ "$BE_RC" = 0 ] || OVERALL_RC=$BE_RC
    [ "$FB_USE_STUB" = true ] && sudo rm -f /dev/fb0
  fi
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
    MECHATRON_SKIP_UNIT=1 \
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
  MECHATRON_SKIP_UNIT=1 \
    run_bun "nolib-sh-clipboard" "$JUNIT_FILE" -- "${WRAP[@]}" "$BUN" test test/bun.test.ts \
      --coverage --coverage-reporter=lcov --coverage-dir="$BE_COV_DIR" \
      --reporter=junit --reporter-outfile="$JUNIT_FILE" \
    || BE_RC=$?
  guard_junit "$BE_RC" "$JUNIT_FILE" "nolib-sh-clipboard" \
    "bun test for nolib-sh-clipboard (xclip subprocess) exited ${BE_RC} without producing a JUnit report."
  [ "$BE_RC" = 0 ] || OVERALL_RC=$BE_RC
fi

# ── macOS-only: nolib[sh] clipboard (pbcopy/pbpaste subprocess path) ─
if [ "$RUNNER_OS" = "macOS" ]; then
  JUNIT_FILE="$JUNIT_DIR/mechatron-${MATRIX_OS}-${MATRIX_ARCH}-nolib-sh-clipboard.xml"
  BE_COV_DIR="$COV_DIR/nolib-sh-clipboard"
  mkdir -p "$BE_COV_DIR"
  BE_RC=0
  MECHATRON_BACKEND=ffi \
  MECHATRON_BACKEND_CLIPBOARD='nolib[sh]' \
  MECHATRON_SKIP_UNIT=1 \
    run_bun "nolib-sh-clipboard" "$JUNIT_FILE" -- "${WRAP[@]}" "$BUN" test test/bun.test.ts \
      --coverage --coverage-reporter=lcov --coverage-dir="$BE_COV_DIR" \
      --reporter=junit --reporter-outfile="$JUNIT_FILE" \
    || BE_RC=$?
  guard_junit "$BE_RC" "$JUNIT_FILE" "nolib-sh-clipboard" \
    "bun test for nolib-sh-clipboard (pbcopy/pbpaste subprocess) exited ${BE_RC} without producing a JUnit report."
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
  MECHATRON_SKIP_UNIT=1 \
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
  MECHATRON_SKIP_UNIT=1 \
    run_bun "ffi-atspi" "$JUNIT_FILE" -- "${WRAP[@]}" "$BUN" test test/bun.test.ts \
      --coverage --coverage-reporter=lcov --coverage-dir="$BE_COV_DIR" \
      --reporter=junit --reporter-outfile="$JUNIT_FILE" \
    || BE_RC=$?
  kill "$ATSPI_PID" 2>/dev/null || true
  guard_junit "$BE_RC" "$JUNIT_FILE" "ffi-atspi" \
    "bun test for ffi-atspi exited ${BE_RC} without producing a JUnit report."
  [ "$BE_RC" = 0 ] || OVERALL_RC=$BE_RC
fi

# ── Linux-only: nolib[portal] via Wayland (gnome-shell --headless) ────
# Uses gnome-shell as the Wayland compositor so that org.gnome.Shell is
# on the session bus — xdg-desktop-portal-gnome requires it to fulfill
# RemoteDesktop and Screenshot portal requests. PipeWire must be running
# before gnome-shell starts so Mutter initialises its RemoteDesktop and
# ScreenCast D-Bus interfaces (which xdg-desktop-portal-gnome delegates
# to); without PipeWire, xdg-desktop-portal-gnome falls back to
# "settings only" mode and the portal tests fail.
# No mechatron extension is installed: this tests the standard freedesktop
# portal code path, not the gext path.
if [ "$RUNNER_OS" = "Linux" ] && command -v gnome-shell >/dev/null 2>&1; then
  JUNIT_FILE="$JUNIT_DIR/mechatron-${MATRIX_OS}-${MATRIX_ARCH}-nolib-portal.xml"
  BE_COV_DIR="$COV_DIR/nolib-portal"
  mkdir -p "$BE_COV_DIR"
  BE_RC=0

  export BUN JUNIT_FILE BE_COV_DIR
  dbus-run-session -- bash -c '
    set -x
    export XDG_SESSION_TYPE=wayland
    export XDG_CURRENT_DESKTOP=GNOME

    # Ensure the mechatron extension is NOT loaded in this cell — we are
    # testing the standard portal path, not the gext path.
    gsettings set org.gnome.shell enabled-extensions "[]" 2>/dev/null \
      || dconf write /org/gnome/shell/enabled-extensions "[]" 2>/dev/null \
      || true
    gsettings set org.gnome.shell disable-user-extensions true 2>/dev/null || true

    # PipeWire must be running before gnome-shell so Mutter can register
    # org.gnome.Mutter.RemoteDesktop and org.gnome.Mutter.ScreenCast.
    pipewire &
    PW_PID=$!
    sleep 0.5
    if command -v wireplumber >/dev/null 2>&1; then
      wireplumber &
      WP_PID=$!
    elif command -v pipewire-media-session >/dev/null 2>&1; then
      pipewire-media-session &
      WP_PID=$!
    else
      WP_PID=""
    fi
    sleep 0.5

    gnome-shell --headless --virtual-monitor 1920x1080 --wayland --no-x11 &
    SHELL_PID=$!

    for _ in $(seq 1 100); do
      WAYLAND_DISPLAY=$(ls "$XDG_RUNTIME_DIR"/wayland-* 2>/dev/null | head -1 | xargs -r basename)
      [ -n "$WAYLAND_DISPLAY" ] && break
      sleep 0.1
    done
    export WAYLAND_DISPLAY

    if [ -z "$WAYLAND_DISPLAY" ]; then
      echo ">>> warning: gnome-shell did not create a Wayland socket within 10s"
      kill "$SHELL_PID" ${WP_PID:+"$WP_PID"} "$PW_PID" 2>/dev/null || true
      exit 1
    fi
    echo ">>> WAYLAND_DISPLAY=$WAYLAND_DISPLAY"

    # Wait for org.gnome.Shell on the bus (needed by xdg-desktop-portal-gnome).
    for i in $(seq 1 60); do
      if busctl --user list 2>/dev/null | grep -q "org.gnome.Shell"; then
        echo ">>> org.gnome.Shell registered after ${i}*0.5s"
        break
      fi
      sleep 0.5
    done

    /usr/libexec/xdg-desktop-portal &
    XDP_PID=$!
    /usr/libexec/xdg-desktop-portal-gnome &
    XDP_GNOME_PID=$!

    # Wait for the portal frontend to register on the bus.
    for i in $(seq 1 40); do
      if busctl --user list 2>/dev/null | grep -q "org.freedesktop.portal.Desktop"; then
        echo ">>> org.freedesktop.portal.Desktop registered after ${i}*0.5s"
        break
      fi
      sleep 0.5
    done

    MECHATRON_BACKEND="nolib[portal]" \
    MECHATRON_SKIP_UNIT=1 \
      "$BUN" test test/bun.test.ts \
        --coverage --coverage-reporter=lcov --coverage-dir="$BE_COV_DIR" \
        --reporter=junit --reporter-outfile="$JUNIT_FILE"
    RC=$?

    kill "$XDP_GNOME_PID" "$XDP_PID" "$SHELL_PID" ${WP_PID:+"$WP_PID"} "$PW_PID" 2>/dev/null || true
    exit $RC
  ' 2>&1 | tee -a "$TEST_LOG" || BE_RC=$?
  guard_junit "$BE_RC" "$JUNIT_FILE" "nolib-portal" \
    "nolib-portal test (gnome-shell --headless + portal) exited ${BE_RC} without producing a JUnit report."
  [ "$BE_RC" = 0 ] || OVERALL_RC=$BE_RC
fi

# ── Linux-only: full GNOME Shell + Mechatron extension ──────────
# Boots a real gnome-shell process on Xvfb so the shell loads our
# extension (mechatron@mechatronic.dev) and answers the
# dev.mechatronic.Shell D-Bus interface. This exercises lib/gext/window.ts
# (D-Bus client) + lib/gext/installer.ts (extension lifecycle) +
# lib/nolib/window-gext.ts (variant impl) end-to-end. Distinct from the
# nolib[portal] cell which only exercises the read-only AT-SPI fallback.
#
# The extension uses GNOME 45+ ES module format (import/export default),
# so it requires Shell 45 or later. Earlier versions (e.g. Shell 42 on
# Ubuntu 22.04) use a different extension API and will silently refuse
# to load the extension.
GNOME_SHELL_VER=$(gnome-shell --version 2>/dev/null | grep -oE '[0-9]+' | head -1 || echo 0)
if [ "$RUNNER_OS" = "Linux" ] && command -v gnome-shell >/dev/null 2>&1 \
   && [ "${GNOME_SHELL_VER:-0}" -ge 45 ]; then
  JUNIT_FILE="$JUNIT_DIR/mechatron-${MATRIX_OS}-${MATRIX_ARCH}-nolib-gext.xml"
  BE_COV_DIR="$COV_DIR/nolib-gext"
  mkdir -p "$BE_COV_DIR"
  BE_RC=0

  TOKENS_FILE="$RUNNER_TEMP/mechatron-tokens"
  EXT_UUID="mechatron@mechatronic.dev"

  export BUN JUNIT_FILE BE_COV_DIR TOKENS_FILE EXT_UUID
  dbus-run-session -- bash -c '
    set -x

    # The outer ci-run-tests.sh setup puts openbox on DISPLAY=:99 so EWMH
    # window tests have a window manager. gnome-shell needs to BE the
    # window manager, so it cannot share that display. Start a fresh
    # Xvfb on :199 dedicated to gnome-shell.
    Xvfb :199 -screen 0 1920x1080x24 -nolisten tcp &
    GEXT_XVFB_PID=$!
    for _ in $(seq 1 50); do
      xdpyinfo -display :199 >/dev/null 2>&1 && break
      sleep 0.1
    done
    export DISPLAY=:199
    export MECHATRON_TOKENS_FILE="$TOKENS_FILE"

    # Provision a token for the extension to validate against.
    EXT_TOKEN=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid)
    echo "$EXT_TOKEN" > "$TOKENS_FILE"
    chmod 600 "$TOKENS_FILE"
    export MECHATRON_GNOME_TOKEN="$EXT_TOKEN"

    # Install the extension into the user-local GNOME Shell extensions
    # directory (no system install needed).
    EXT_DIR="$HOME/.local/share/gnome-shell/extensions/$EXT_UUID"
    mkdir -p "$EXT_DIR"
    cp -r extensions/mechatron/* "$EXT_DIR/"

    # Pre-enable via gsettings (gnome-shell reads this list on startup;
    # gnome-extensions CLI would need a running shell). GVariant accepts
    # double-quoted strings inside arrays which sidesteps the bash -c
    # outer-single-quote escaping headache entirely.
    mkdir -p "$HOME/.config/dconf"
    EXT_LIST="[\"$EXT_UUID\"]"
    gsettings set org.gnome.shell enabled-extensions "$EXT_LIST" 2>/dev/null \
      || dconf write /org/gnome/shell/enabled-extensions "$EXT_LIST" 2>/dev/null \
      || echo ">>> warning: could not pre-enable extension via gsettings/dconf"
    # Also disable user-extensions safety lock that some Shell versions
    # ship with (extensions silently fail to load otherwise).
    gsettings set org.gnome.shell disable-user-extensions false 2>/dev/null || true

    # Start gnome-shell on the dedicated Xvfb display.
    gnome-shell --x11 &
    SHELL_PID=$!

    # Wait for the extension to register its D-Bus name (up to 60s —
    # gnome-shell startup is not fast in CI).
    for i in $(seq 1 120); do
      if busctl --user list 2>/dev/null | grep -q "dev.mechatronic.Shell"; then
        echo ">>> mechatron extension registered on D-Bus after ${i}*0.5s"
        break
      fi
      sleep 0.5
      [ $((i % 20)) -eq 0 ] && echo ">>> still waiting for extension... ($i/120)"
    done

    if ! busctl --user list 2>/dev/null | grep -q "dev.mechatronic.Shell"; then
      echo ">>> warning: extension never registered; current bus state:"
      busctl --user list 2>/dev/null | head -50 || true
      kill "$SHELL_PID" "$GEXT_XVFB_PID" 2>/dev/null || true
      exit 1
    fi

    # Smoke-test the bus interface before running the full suite.
    busctl --user call dev.mechatronic.Shell \
      /dev/mechatronic/Shell dev.mechatronic.Shell.Window \
      Ping || echo ">>> Ping failed"

    # Only the window subsystem has a gext variant — pin it explicitly
    # while leaving every other subsystem on the default ffi backend so
    # keyboard/mouse/clipboard/etc. tests still load successfully.
    MECHATRON_BACKEND=ffi \
    MECHATRON_BACKEND_WINDOW="nolib[gext]" \
    MECHATRON_SKIP_UNIT=1 \
      "$BUN" test test/bun.test.ts \
        --coverage --coverage-reporter=lcov --coverage-dir="$BE_COV_DIR" \
        --reporter=junit --reporter-outfile="$JUNIT_FILE"
    RC=$?

    kill "$SHELL_PID" "$GEXT_XVFB_PID" 2>/dev/null || true
    exit $RC
  ' 2>&1 | tee -a "$TEST_LOG" || BE_RC=$?
  guard_junit "$BE_RC" "$JUNIT_FILE" "nolib-gext" \
    "nolib-gext test (gnome-shell + mechatron extension) exited ${BE_RC} without producing a JUnit report."
  [ "$BE_RC" = 0 ] || OVERALL_RC=$BE_RC
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
