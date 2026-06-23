package main

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
)

// resolveFfmpeg picks an ffmpeg binary in the same order as the TS
// backend: AICUT_FFMPEG env var → ./ffmpeg-bin/ffmpeg next to the
// binary → system PATH `ffmpeg`.
func resolveFfmpeg() string {
	if env := os.Getenv("AICUT_FFMPEG"); env != "" {
		if isExecutable(env) {
			return env
		}
	}
	exe, err := os.Executable()
	if err == nil {
		bundled := filepath.Join(filepath.Dir(exe), "ffmpeg-bin", "ffmpeg")
		if isExecutable(bundled) {
			return bundled
		}
	}
	if cwd, err := os.Getwd(); err == nil {
		bundled := filepath.Join(cwd, "ffmpeg-bin", "ffmpeg")
		if isExecutable(bundled) {
			return bundled
		}
	}
	return "ffmpeg"
}

func isExecutable(p string) bool {
	info, err := os.Stat(p)
	if err != nil {
		return false
	}
	if info.IsDir() {
		return false
	}
	return info.Mode().Perm()&0o111 != 0
}

// runFfmpeg invokes ffmpeg with the given args. When onStdoutLine is
// non-nil we pipe and consume ffmpeg's STDOUT line-by-line — that's
// how `-progress pipe:1` reports `key=value` events.
func runFfmpeg(ctx context.Context, bin string, args []string, onStdoutLine func(string)) error {
	cmd := exec.CommandContext(ctx, bin, args...)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	var stdout io.ReadCloser
	if onStdoutLine != nil {
		pipe, err := cmd.StdoutPipe()
		if err != nil {
			return err
		}
		stdout = pipe
	}

	if err := cmd.Start(); err != nil {
		return errors.New(err.Error() + ": " + tailString(stderr.String(), 2000))
	}

	// Drain stdout in this goroutine so we don't block the ffmpeg
	// process on a full pipe buffer.
	if stdout != nil {
		scanner := bufio.NewScanner(stdout)
		// Progress lines are short (`out_time_us=12345678`); the bigger
		// buffer is paranoia against unexpected -progress formats.
		scanner.Buffer(make([]byte, 0, 4096), 64*1024)
		for scanner.Scan() {
			onStdoutLine(scanner.Text())
		}
	}

	if err := cmd.Wait(); err != nil {
		return errors.New(err.Error() + ": " + tailString(stderr.String(), 2000))
	}
	return nil
}

func tailString(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[len(s)-n:]
}
