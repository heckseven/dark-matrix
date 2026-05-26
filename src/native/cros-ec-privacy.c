/*
 * cros-ec-privacy — reads Framework EC privacy switch state via /dev/cros_ec
 * Output: "mic=N cam=N\n"  (N = 0 muted, 1 unmuted)
 * Exit:   0 success, 2 permission denied, 3 device not found, 1 other error
 *
 * Requires /dev/cros_ec to be user-accessible (set up via `dark-matrix install --ec-access`).
 */
#include <errno.h>
#include <fcntl.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ioctl.h>
#include <unistd.h>

#define CROS_EC_DEV "/dev/cros_ec"
#define EC_CMD_PRIVACY_SWITCHES_CHECK 0x013b

/* Kernel UAPI: _IOWR(0xEC, 0, struct cros_ec_command) */
#define CROS_EC_DEV_IOCXCMD \
    (((unsigned long)3 << 30) | (20UL << 16) | (0xECUL << 8) | 0)

struct cros_ec_command {
    uint32_t version;
    uint32_t command;
    uint32_t outsize;
    uint32_t insize;
    uint32_t result;
    uint8_t  data[2]; /* response: data[0]=mic, data[1]=cam */
};

int main(void) {
    int fd = open(CROS_EC_DEV, O_RDWR);
    if (fd < 0) {
        fprintf(stderr, "cros-ec-privacy: cannot open " CROS_EC_DEV ": %s\n", strerror(errno));
        return errno == EACCES ? 2 : 3;
    }

    struct cros_ec_command cmd;
    memset(&cmd, 0, sizeof(cmd));
    cmd.command = EC_CMD_PRIVACY_SWITCHES_CHECK;
    cmd.insize  = 2;

    if (ioctl(fd, CROS_EC_DEV_IOCXCMD, &cmd) < 0) {
        fprintf(stderr, "cros-ec-privacy: ioctl failed: %s\n", strerror(errno));
        close(fd);
        return 1;
    }
    close(fd);

    printf("mic=%d cam=%d\n", (int)cmd.data[0], (int)cmd.data[1]);
    return 0;
}
