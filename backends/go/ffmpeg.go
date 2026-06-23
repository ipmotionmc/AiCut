package main

import (
	"bytes"
	"context"
	"errors"
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

func runFfmpeg(ctx context.Context, bin string, args []string) error {
	cmd := exec.CommandContext(ctx, bin, args...)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
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
