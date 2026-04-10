/* Cross-process memory test helper.
 *
 * Purpose: stand in for the real-world "game trainer" scenario where a
 * mechatron caller attaches to a foreign target process.  Because Node.js
 * ships with the hardened runtime on macOS, it makes a bad target without
 * custom entitlements; a plain compiled binary does not enable hardened
 * runtime by default, so mechatron's Memory API can attach to it as long
 * as the caller is the same user (the exact same rule that applies when
 * a user has fully disabled SIP or enabled Developer Mode to allow
 * debugging third-party apps).
 *
 * Protocol:
 *   argv    (none)
 *   stdin   Each newline triggers a fresh hex dump on stdout.  EOF or
 *           a closed pipe causes the helper to exit cleanly.
 *   stdout  For every newline received on stdin, prints the current
 *           hex dump of the helper's internal 64-byte buffer as a
 *           single line.  The parent uses the first dump both as the
 *           readiness signal and to learn the initial buffer contents,
 *           so it can locate the buffer in the helper's address space
 *           via Memory.find().
 *
 * The buffer is accessed through a `volatile const unsigned char *` on
 * every dump, which is the standard C idiom for prohibiting the
 * compiler from hoisting or caching the reads — the parent writes to
 * this memory from a different process, which is invisible to the
 * optimizer.
 *
 * The initial buffer contents are generated from a time+pid seed.  Not
 * cryptographic, but plenty for a test needle.
 *
 * No external dependencies — builds with any C99 compiler, e.g.:
 *   clang -O2 test/memory-child.c -o test/memory-child
 */

#include <stdio.h>
#include <stdlib.h>
#include <time.h>

#ifdef _WIN32
# include <process.h>
# define getpid _getpid
#else
# include <unistd.h>
#endif

#define BUFLEN 64

static unsigned char buf[BUFLEN];

static void dump(void) {
    /* The `volatile` qualifier forces the compiler to re-read each byte
     * from memory on every access, so writes that other processes poke
     * into `buf` are observed rather than hoisted out of the loop. */
    volatile const unsigned char *p = buf;
    for (int i = 0; i < BUFLEN; i++) {
        printf("%02x", p[i]);
    }
    putchar('\n');
    fflush(stdout);
}

int main(void) {
    srand((unsigned)time(NULL) ^ (unsigned)getpid());
    for (int i = 0; i < BUFLEN; i++) {
        buf[i] = (unsigned char)(rand() & 0xff);
    }

    /* Any line on stdin triggers a fresh dump. */
    char line[16];
    while (fgets(line, sizeof line, stdin) != NULL) {
        dump();
    }

    return 0;
}
