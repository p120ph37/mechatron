/*
 * LD_PRELOAD shim: fake /dev/fb0 framebuffer for CI testing.
 *
 * Intercepts open() and ioctl() so that any code opening /dev/fb0 gets
 * a regular file (the pixel-data stub) while ioctl calls on that fd
 * return synthetic fb_var_screeninfo / fb_fix_screeninfo.  This lets
 * the full ioctl-based geometry query path in lib/nolib/screen-vt.ts
 * (via the perl/python ioctl bridge) execute against a CI-generated
 * pixel file without a real kernel framebuffer driver.
 *
 * Env vars (read once at load):
 *   MECHATRON_FB_STUB_W       — width  in pixels    (default 8)
 *   MECHATRON_FB_STUB_H       — height in pixels    (default 4)
 *   MECHATRON_FB_STUB_BPP     — bits per pixel      (default 32)
 *
 * The stub file must be placed at /dev/fb0 (e.g. via `sudo tee`) and
 * contain exactly W * H * (BPP/8) bytes of raw pixel data.
 *
 * Build:    clang -shared -fPIC -ldl -o test/fb-stub.so test/fb-stub.c
 * Use:      LD_PRELOAD=./test/fb-stub.so <cmd>
 */

#define _GNU_SOURCE
#include <dlfcn.h>
#include <fcntl.h>
#include <stdarg.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

/* linux/fb.h ioctl numbers — reproduced here to avoid a build-time
 * kernel-header dependency in cross-platform CI images. */
#define FBIOGET_VSCREENINFO 0x4600
#define FBIOGET_FSCREENINFO 0x4602

/* Geometry defaults matching the CI-generated stub. */
static int fb_w   = 8;
static int fb_h   = 4;
static int fb_bpp = 32;

static void __attribute__((constructor)) fb_stub_init(void) {
    const char *v;
    if ((v = getenv("MECHATRON_FB_STUB_W")))   fb_w   = atoi(v);
    if ((v = getenv("MECHATRON_FB_STUB_H")))   fb_h   = atoi(v);
    if ((v = getenv("MECHATRON_FB_STUB_BPP"))) fb_bpp = atoi(v);
}

/* ── fd tracking ────────────────────────────────────────────────────
 * Record which fds were opened on /dev/fb0 so the ioctl handler knows
 * which calls to intercept.  A small fixed-size table is fine — the
 * test only opens the device once or twice.
 */
#define MAX_TRACKED 8
static int tracked_fds[MAX_TRACKED];
static int n_tracked = 0;

static void track_fd(int fd) {
    if (fd < 0 || n_tracked >= MAX_TRACKED) return;
    tracked_fds[n_tracked++] = fd;
}

static int is_tracked(int fd) {
    for (int i = 0; i < n_tracked; i++)
        if (tracked_fds[i] == fd) return 1;
    return 0;
}

static int is_fb0(const char *path) {
    return path && strcmp(path, "/dev/fb0") == 0;
}

/* ── open / open64 / openat interception ────────────────────────── */

typedef int (*open_fn)(const char *, int, ...);
typedef int (*openat_fn)(int, const char *, int, ...);

int open(const char *path, int flags, ...) {
    open_fn real = (open_fn)dlsym(RTLD_NEXT, "open");
    mode_t mode = 0;
    if (flags & (O_CREAT | __O_TMPFILE)) {
        va_list ap; va_start(ap, flags); mode = va_arg(ap, mode_t); va_end(ap);
    }
    int fd = real(path, flags, mode);
    if (fd >= 0 && is_fb0(path)) track_fd(fd);
    return fd;
}

int open64(const char *path, int flags, ...) {
    open_fn real = (open_fn)dlsym(RTLD_NEXT, "open64");
    mode_t mode = 0;
    if (flags & (O_CREAT | __O_TMPFILE)) {
        va_list ap; va_start(ap, flags); mode = va_arg(ap, mode_t); va_end(ap);
    }
    int fd = real(path, flags, mode);
    if (fd >= 0 && is_fb0(path)) track_fd(fd);
    return fd;
}

int openat(int dirfd, const char *path, int flags, ...) {
    openat_fn real = (openat_fn)dlsym(RTLD_NEXT, "openat");
    mode_t mode = 0;
    if (flags & (O_CREAT | __O_TMPFILE)) {
        va_list ap; va_start(ap, flags); mode = va_arg(ap, mode_t); va_end(ap);
    }
    int fd = real(dirfd, path, flags, mode);
    if (fd >= 0 && is_fb0(path)) track_fd(fd);
    return fd;
}

int openat64(int dirfd, const char *path, int flags, ...) {
    openat_fn real = (openat_fn)dlsym(RTLD_NEXT, "openat64");
    mode_t mode = 0;
    if (flags & (O_CREAT | __O_TMPFILE)) {
        va_list ap; va_start(ap, flags); mode = va_arg(ap, mode_t); va_end(ap);
    }
    int fd = real(dirfd, path, flags, mode);
    if (fd >= 0 && is_fb0(path)) track_fd(fd);
    return fd;
}

/* ── ioctl interception ─────────────────────────────────────────── */

typedef int (*ioctl_fn)(int, unsigned long, ...);

int ioctl(int fd, unsigned long request, ...) {
    va_list ap;
    va_start(ap, request);
    void *arg = va_arg(ap, void *);
    va_end(ap);

    if (fd >= 0 && is_tracked(fd) && arg) {
        int line_len = fb_w * (fb_bpp / 8);
        int smem_len = line_len * fb_h;

        if (request == FBIOGET_VSCREENINFO) {
            /*
             * struct fb_var_screeninfo layout (first 80 bytes):
             *   u32 xres            @  0
             *   u32 yres            @  4
             *   ...
             *   u32 bits_per_pixel  @ 24
             *   ...
             *   fb_bitfield red     @ 32  (offset@0, length@4, msb_right@8)
             *   fb_bitfield green   @ 44
             *   fb_bitfield blue    @ 56
             *   fb_bitfield transp  @ 68
             */
            uint8_t *buf = (uint8_t *)arg;
            memset(buf, 0, 160);
            uint32_t *u = (uint32_t *)buf;
            u[0]  = fb_w;           /* xres */
            u[1]  = fb_h;           /* yres */
            u[6]  = fb_bpp;         /* bits_per_pixel */
            u[8]  = 16; u[9]  = 8;  /* red: offset=16, length=8 */
            u[11] = 8;  u[12] = 8;  /* green: offset=8, length=8 */
            u[14] = 0;  u[15] = 8;  /* blue: offset=0, length=8 */
            u[17] = 24; u[18] = 8;  /* transp: offset=24, length=8 */
            return 0;
        }
        if (request == FBIOGET_FSCREENINFO) {
            /*
             * struct fb_fix_screeninfo layout:
             *   ...
             *   u32 smem_len     @ 20
             *   ...
             *   u32 line_length  @ 40
             */
            uint8_t *buf = (uint8_t *)arg;
            memset(buf, 0, 68);
            uint32_t *u = (uint32_t *)buf;
            u[5]  = smem_len;    /* smem_len @ offset 20 */
            u[10] = line_len;    /* line_length @ offset 40 */
            return 0;
        }
    }

    ioctl_fn real = (ioctl_fn)dlsym(RTLD_NEXT, "ioctl");
    return real(fd, request, arg);
}
