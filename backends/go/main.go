package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Equivalent SSE contract to backends/ts/src/server.ts:
//   GET  /health        → { ok: true, backend: "go" }
//   POST /export        → text/event-stream
//                         data: {"phase":"encode","overall":0.42,...}
//                         data: {"phase":"done","fileUrl":"/files/<id>.mp4"}
//   GET  /files/<id>.mp4 → the rendered mp4

var outputsDir = func() string {
	cwd, err := os.Getwd()
	if err != nil {
		cwd = "."
	}
	d := filepath.Join(cwd, "outputs")
	_ = os.MkdirAll(d, 0o755)
	return d
}()

var fileIDRe = regexp.MustCompile(`^[a-f0-9]{32}\.mp4$`)

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", handleHealth)
	mux.HandleFunc("/export", handleExport)
	mux.HandleFunc("/files/", handleFile)

	addr := envOr("HOST", "127.0.0.1") + ":" + envOr("PORT", "8788")
	log.Printf("aicut-backend-go listening on %s (outputs: %s)", addr, outputsDir)
	if err := http.ListenAndServe(addr, withCORS(mux)); err != nil {
		log.Fatal(err)
	}
}

func handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "backend": "go"})
}

func handleExport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req ExportRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if req.Project.Version == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing project"})
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("content-type", "text/event-stream")
	w.Header().Set("cache-control", "no-cache, no-transform")
	w.Header().Set("connection", "keep-alive")
	w.WriteHeader(http.StatusOK)

	// Serialize all writes to the response — onProgress is called from
	// the ffmpeg stdout-reading goroutine while the heartbeat ticks
	// from a separate goroutine, so naked writes would race.
	var mu sync.Mutex
	send := func(payload any) {
		b, _ := json.Marshal(payload)
		mu.Lock()
		defer mu.Unlock()
		_, _ = fmt.Fprintf(w, "data: %s\n\n", b)
		flusher.Flush()
	}

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	// Heartbeat — keep proxies / LBs from closing the connection if
	// no progress events fire for a while (small clip, slow source).
	stop := make(chan struct{})
	go func() {
		t := time.NewTicker(15 * time.Second)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-stop:
				return
			case <-t.C:
				mu.Lock()
				_, _ = fmt.Fprint(w, ": ping\n\n")
				flusher.Flush()
				mu.Unlock()
			}
		}
	}()
	defer close(stop)

	id := randomID()
	outputPath := filepath.Join(outputsDir, id+".mp4")

	// Throttle ~5/sec — ffmpeg fast preset can spit out dozens of
	// progress lines per second.
	var lastSentMs int64
	onProgress := func(e ProgressEvent) {
		if e.Phase == "encode" {
			now := time.Now().UnixMilli()
			if now-lastSentMs < 200 {
				return
			}
			lastSentMs = now
		}
		send(e)
	}

	if err := renderProject(ctx, req, outputPath, onProgress); err != nil {
		send(map[string]string{"phase": "error", "error": err.Error()})
		return
	}
	send(map[string]string{
		"phase":   "done",
		"fileUrl": "/files/" + id + ".mp4",
		"id":      id,
	})
}

func handleFile(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/files/")
	if !fileIDRe.MatchString(id) {
		http.Error(w, "bad file id", http.StatusBadRequest)
		return
	}
	p := filepath.Join(outputsDir, id)
	f, err := os.Open(p)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	defer f.Close()

	info, err := f.Stat()
	if err == nil {
		w.Header().Set("content-length", strconv.FormatInt(info.Size(), 10))
	}
	w.Header().Set("content-type", "video/mp4")
	w.Header().Set("cache-control", "no-store")
	w.WriteHeader(http.StatusOK)
	_, _ = io.Copy(w, f)
}

func randomID() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("content-type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("access-control-allow-origin", "*")
		w.Header().Set("access-control-allow-methods", "GET, POST, OPTIONS")
		w.Header().Set("access-control-allow-headers", "content-type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func envOr(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return fallback
}
