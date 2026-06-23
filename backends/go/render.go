package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

type RenderResult struct {
	OutputPath string
	Cleanup    func()
}

// renderProject mirrors backends/ts/src/render.ts — per-clip ffmpeg
// re-encode to a normalized H.264/AAC segment, then concat-demuxer
// stream-copy. See that file for the rationale on re-encoding.
func renderProject(ctx context.Context, req ExportRequest) (*RenderResult, error) {
	bin := resolveFfmpeg()

	work, err := os.MkdirTemp("", "aicut-*")
	if err != nil {
		return nil, err
	}
	cleanup := func() { _ = os.RemoveAll(work) }

	track, ok := findVideoTrack(req.Project)
	if !ok || len(track.Clips) == 0 {
		cleanup()
		return nil, errors.New("project has no video clips to export")
	}

	sourcesByID := make(map[string]MediaSource, len(req.Project.Sources))
	for _, s := range req.Project.Sources {
		sourcesByID[s.ID] = s
	}

	segments := make([]string, 0, len(track.Clips))
	for i, clip := range track.Clips {
		src, ok := sourcesByID[clip.SourceID]
		if !ok {
			cleanup()
			return nil, fmt.Errorf("missing source %s", clip.SourceID)
		}
		segPath := filepath.Join(work, fmt.Sprintf("seg-%d.mp4", i))
		args := []string{
			"-y",
			"-ss", msToSec(clip.In),
			"-i", src.URL,
			"-t", msToSec(clip.Out - clip.In),
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
		args = append(args, segPath)
		if err := runFfmpeg(ctx, bin, args); err != nil {
			cleanup()
			return nil, fmt.Errorf("ffmpeg segment %d failed: %w", i, err)
		}
		segments = append(segments, segPath)
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
		cleanup()
		return nil, err
	}

	outputPath := filepath.Join(work, "output.mp4")
	concatArgs := []string{
		"-y",
		"-f", "concat",
		"-safe", "0",
		"-i", listPath,
		"-c", "copy",
		"-movflags", "+faststart",
		outputPath,
	}
	if err := runFfmpeg(ctx, bin, concatArgs); err != nil {
		cleanup()
		return nil, fmt.Errorf("ffmpeg concat failed: %w", err)
	}

	return &RenderResult{OutputPath: outputPath, Cleanup: cleanup}, nil
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
