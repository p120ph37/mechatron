/*
 * LD_PRELOAD shim: selectively refuse dlopen for sonames matching
 * a colon-separated substring list in `$MECHATRON_BLOCK_DLOPEN`.
 *
 * Used to force the FFI loader's "library unavailable" catch arms
 * in lib/ffi/x11.ts (libXtst.so.6, libXrandr.so.2) to fire in CI
 * without physically uninstalling the libraries.  Any dlopen() call
 * whose path substring-matches one of the entries is denied with
 * dlerror="blocked by MECHATRON_BLOCK_DLOPEN"; all other loads pass
 * through to the real libc dlopen.
 *
 * Build:    cc -shared -fPIC -ldl -o dlopen-block.so dlopen-block.c
 * Use:      LD_PRELOAD=./dlopen-block.so \
 *             MECHATRON_BLOCK_DLOPEN=libXrandr.so.2 <cmd>
 *
 * Multiple libraries can be blocked at once via colon separation:
 *   MECHATRON_BLOCK_DLOPEN=libXrandr.so.2:libXtst.so.6
 */

#define _GNU_SOURCE
#include <dlfcn.h>
#include <stdlib.h>
#include <string.h>

typedef void *(*dlopen_fn)(const char *, int);

static dlopen_fn real_dlopen(void) {
    static dlopen_fn p = NULL;
    if (!p) p = (dlopen_fn) dlsym(RTLD_NEXT, "dlopen");
    return p;
}

static int path_blocked(const char *path) {
    const char *block = getenv("MECHATRON_BLOCK_DLOPEN");
    if (!block || !*block || !path) return 0;
    const char *p = block;
    while (*p) {
        const char *colon = strchr(p, ':');
        size_t n = colon ? (size_t)(colon - p) : strlen(p);
        if (n > 0 && n < 256) {
            char pat[256];
            memcpy(pat, p, n);
            pat[n] = '\0';
            if (strstr(path, pat)) return 1;
        }
        if (!colon) break;
        p = colon + 1;
    }
    return 0;
}

void *dlopen(const char *path, int flag) {
    if (path_blocked(path)) return NULL;
    dlopen_fn real = real_dlopen();
    return real ? real(path, flag) : NULL;
}
