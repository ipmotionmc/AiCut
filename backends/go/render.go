package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// ProgressEvent matches the SSE wire format the demo consumes. Stays
// in lockstep with backends/ts/src/render.ts ProgressEvent.
type ProgressEvent struct {
	Phase      string  `json:"phase"`               // "encode" | "concat"
	Overall    float64 `json:"overall"`             // 0..1
	ClipIndex  *int    `json:"clipIndex,omitempty"` // encode phase only
	TotalClips int     `json:"totalClips,omitempty"`
}

// renderProject re-encodes each clip then concat-demuxes them into a
// single mp4 at outputPath. onProgress (optional) is called for each
// progress sample we receive from ffmpeg — the server is responsible
// for throttling before writing to SSE.
func renderProject(ctx context.Context, req ExportRequest, outputPath string, onProgress func(ProgressEvent)) error {
	bin := resolveFfmpeg()

	work, err := os.MkdirTemp("", "aicut-*")
	if err != nil {
		return err
	}
	defer os.RemoveAll(work)

	track, ok := findVideoTrack(req.Project)
	if !ok || len(track.Clips) == 0 {
		return errors.New("project has no video clips to export")
	}

	sourcesByID := make(map[string]MediaSource, len(req.Project.Sources))
	for _, s := range req.Project.Sources {
		sourcesByID[s.ID] = s
	}

	// Keyframe transforms (X / Y / scale) are a preview-only feature
	// in v0.6 — the ffmpeg filtergraph below applies a single static
	// scale=W:H,pad= per clip and ignores per-frame transforms.
	// Compiling piecewise-linear expressions into ffmpeg syntax is
	// tracked for v0.7.
	for _, clip := range track.Clips {
		if n := len(clip.Keyframes); n > 0 {
			log.Printf("[render] clip %s: ignoring %d keyframe(s) — preview-only in v0.6", clip.ID, n)
		}
	}

	// Total project duration in ms — denominator for the overall
	// progress fraction across clips.
	var totalMs int64
	for _, c := range track.Clips {
		totalMs += c.Out - c.In
	}
	totalClips := len(track.Clips)
	var accumDoneMs int64

	segments := make([]string, 0, len(track.Clips))
	for i, clip := range track.Clips {
		src, ok := sourcesByID[clip.SourceID]
		if !ok {
			return fmt.Errorf("missing source %s", clip.SourceID)
		}
		segPath := filepath.Join(work, fmt.Sprintf("seg-%d.mp4", i))
		durMs := clip.Out - clip.In
		args := []string{
			"-y",
			"-ss", msToSec(clip.In),
			"-i", src.URL,
			"-t", msToSec(durMs),
			"-c:v", "libx264",
			"-preset", "veryfast",
			"-c:a", "aac",
			"-movflags", "+faststart",
		}
		if req.Output != nil && req.Output.Width > 0 && req.Output.Height > 0 {
			w := strconv.Itoa(req.Output.Width)
			h := strconv.Itoa(req.Output.Height)
			args = append(args, "-vf",
				fmt.Sprintf("scale=%s:%s:force_original_aspect_ratio=decrease,pad=%s:%s:(ow-iw)/2:(oh-ih)/2", w, h, w, h),
			)
		}
		if req.Output != nil && req.Output.FPS > 0 {
			args = append(args, "-r", strconv.Itoa(req.Output.FPS))
		}
		args = append(args, "-nostats", "-progress", "pipe:1", segPath)

		localI := i
		onLine := func(line string) {
			us, ok := parseOutTimeUs(line)
			if !ok {
				return
			}
			clipMs := int64(us / 1000)
			if clipMs > durMs {
				clipMs = durMs
			}
			var overall float64
			if totalMs > 0 {
				overall = float64(accumDoneMs+clipMs) / float64(totalMs)
				overall = math.Min(overall, 0.99)
			}
			if onProgress != nil {
				onProgress(ProgressEvent{
					Phase:      "encode",
					Overall:    overall,
					ClipIndex:  &localI,
					TotalClips: totalClips,
				})
			}
		}
		if err := runFfmpeg(ctx, bin, args, onLine); err != nil {
			return fmt.Errorf("ffmpeg segment %d failed: %w", i, err)
		}
		accumDoneMs += durMs
		segments = append(segments, segPath)
	}

	if onProgress != nil {
		onProgress(ProgressEvent{Phase: "concat", Overall: 0.99, TotalClips: totalClips})
	}

	listPath := filepath.Join(work, "concat.txt")
	var lb strings.Builder
	for _, p := range segments {
		// concat-demuxer escapes single quotes by closing + escaping +
		// reopening the quoted string.
		escaped := strings.ReplaceAll(p, "'", `'\''`)
		lb.WriteString("file '")
		lb.WriteString(escaped)
		lb.WriteString("'\n")
	}
	if err := os.WriteFile(listPath, []byte(lb.String()), 0o644); err != nil {
		return err
	}

	tmpOut := filepath.Join(work, "output.mp4")
	concatArgs := []string{
		"-y",
		"-f", "concat",
		"-safe", "0",
		"-i", listPath,
		"-c", "copy",
		"-movflags", "+faststart",
		tmpOut,
	}
	if err := runFfmpeg(ctx, bin, concatArgs, nil); err != nil {
		return fmt.Errorf("ffmpeg concat failed: %w", err)
	}
	// rename works in-FS; fall back to copy for cross-FS (tmpdir vs
	// outputs dir on different mounts).
	if err := os.Rename(tmpOut, outputPath); err != nil {
		if err := copyFile(tmpOut, outputPath); err != nil {
			return err
		}
		_ = os.Remove(tmpOut)
	}
	if onProgress != nil {
		onProgress(ProgressEvent{Phase: "concat", Overall: 1, TotalClips: totalClips})
	}
	return nil
}

func findVideoTrack(p Project) (Track, bool) {
	for _, t := range p.Tracks {
		if t.Kind == "video" {
			return t, true
		}
	}
	return Track{}, false
}

func msToSec(ms int64) string {
	return strconv.FormatFloat(float64(ms)/1000.0, 'f', -1, 64)
}

// parseOutTimeUs extracts microseconds from an ffmpeg -progress line
// `out_time_us=12345678`. We avoid `out_time_ms` because the field's
// unit has varied between ms and us across ffmpeg releases.
func parseOutTimeUs(line string) (int64, bool) {
	const prefix = "out_time_us="
	if !strings.HasPrefix(line, prefix) {
		return 0, false
	}
	v, err := strconv.ParseInt(strings.TrimSpace(line[len(prefix):]), 10, 64)
	if err != nil {
		return 0, false
	}
	return v, true
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, in)
	return err
}
