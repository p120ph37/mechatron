/* Cross-process memory test helper for mechatron.
 *
 * A deliberately plain compiled binary that stands in for a real-world
 * debug target (e.g. a game).  Because it isn't built with the macOS
 * hardened runtime that Node ships with, mechatron can attach to it as
 * any same-user process — the same as targeting a non-hardened binary
 * with SIP disabled or Developer Mode enabled.
 *
 * Protocol:
 *   stdin   Any line triggers a fresh hex dump on stdout.  EOF exits.
 *   stdout  64 bytes of `buf` as lowercase hex followed by a newline.
 *
 * `buf` is `volatile` so the compiler cannot hoist or cache its reads
 * across the dump loop — another process writes to it, which is
 * invisible to the optimizer.
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

static volatile unsigned char buf[BUFLEN];

int main(void) {
    srand((unsigned)time(NULL) ^ (unsigned)getpid());
    for (int i = 0; i < BUFLEN; i++) {
        buf[i] = (unsigned char)(rand() & 0xff);
    }

    char line[16];
    while (fgets(line, sizeof line, stdin) != NULL) {
        for (int i = 0; i < BUFLEN; i++) {
            printf("%02x", buf[i]);
        }
        putchar('\n');
        fflush(stdout);
    }

    return 0;
}
