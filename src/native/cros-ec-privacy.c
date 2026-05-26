/*
 * cros-ec-privacy — reads Framework EC privacy switch state via /dev/cros_ec
 *
 * Strategy:
 *   1. Try EC_CMD_PRIVACY_SWITCHES_CHECK (0x013b) — newer EC firmware only.
 *      If the EC returns a non-zero result code the command is not supported.
 *   2. Fall back to EC_CMD_GPIO_GET (0x0093) for MIC_SW and CAM_SW GPIOs,
 *      which is what ectool uses and works on all Framework EC firmware.
 *
 * Output: "mic=N cam=N\n"
 *   N=0  switch released (device live — privacy mode inactive)
 *   N=1  switch engaged  (device killed — privacy mode active)
 *
 * Exit: 0 success, 2 permission denied, 3 device not found, 1 other error
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
#define EC_CMD_GPIO_GET               0x0093
#define GPIO_NAME_MAX                 32
#define EC_RESP_GPIO_GET_SIZE         4  /* struct ec_response_gpio_get: uint32_t val */

/* Kernel UAPI: _IOWR(0xEC, 0, struct cros_ec_command) where sizeof header = 20 */
#define CROS_EC_DEV_IOCXCMD \
    (((unsigned long)3 << 30) | (20UL << 16) | (0xECUL << 8) | 0)

/*
 * The data[] field must be large enough for whichever command needs the most
 * space: GPIO_GET sends 32-byte name params, receives 4-byte int response.
 * The kernel copies outsize bytes OUT of data[] and insize bytes back IN.
 */
struct cros_ec_command {
    uint32_t version;
    uint32_t command;
    uint32_t outsize;
    uint32_t insize;
    uint32_t result;
    uint8_t  data[GPIO_NAME_MAX];
};

/* Returns switch value (0=not engaged/live, 1=engaged/killed), or -1 on error. */
static int gpio_get(int fd, const char *name)
{
    struct cros_ec_command cmd;
    memset(&cmd, 0, sizeof(cmd));
    cmd.command = EC_CMD_GPIO_GET;
    cmd.outsize = GPIO_NAME_MAX;
    cmd.insize  = EC_RESP_GPIO_GET_SIZE;
    strncpy((char *)cmd.data, name, GPIO_NAME_MAX - 1);

    if (ioctl(fd, CROS_EC_DEV_IOCXCMD, &cmd) < 0 || cmd.result != 0)
        return -1;

    /* EC writes ec_response_gpio_get (uint32_t val) into data[]. */
    uint32_t val;
    memcpy(&val, cmd.data, sizeof(val));
    return val != 0 ? 1 : 0;
}

int main(void)
{
    int fd = open(CROS_EC_DEV, O_RDWR);
    if (fd < 0) {
        fprintf(stderr, "cros-ec-privacy: cannot open " CROS_EC_DEV ": %s\n", strerror(errno));
        return errno == EACCES ? 2 : 3;
    }

    /* --- attempt 1: EC_CMD_PRIVACY_SWITCHES_CHECK --- */
    {
        struct cros_ec_command cmd;
        memset(&cmd, 0, sizeof(cmd));
        cmd.command = EC_CMD_PRIVACY_SWITCHES_CHECK;
        cmd.insize  = 2; /* response: data[0]=mic, data[1]=cam */

        if (ioctl(fd, CROS_EC_DEV_IOCXCMD, &cmd) == 0 && cmd.result == 0) {
            printf("mic=%d cam=%d\n", (int)cmd.data[0], (int)cmd.data[1]);
            close(fd);
            return 0;
        }
    }

    /* --- attempt 2: EC_CMD_GPIO_GET for MIC_SW / CAM_SW --- */
    int mic = gpio_get(fd, "MIC_SW");
    int cam = gpio_get(fd, "CAM_SW");
    close(fd);

    if (mic < 0) fprintf(stderr, "cros-ec-privacy: MIC_SW gpio_get failed\n");
    if (cam < 0) fprintf(stderr, "cros-ec-privacy: CAM_SW gpio_get failed\n");
    if (mic < 0 || cam < 0) {
        fprintf(stderr, "cros-ec-privacy: privacy switch detection failed (no supported EC command)\n");
        return 1;
    }

    printf("mic=%d cam=%d\n", mic, cam);
    return 0;
}
