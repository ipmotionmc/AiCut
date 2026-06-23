package main

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
)

// Equivalent API contract to backends/ts/src/server.ts.
//   GET  /health  → { "ok": true }
//   POST /export  → application/json body { project, output? }
//                  responds with video/mp4 attachment

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", handleHealth)
	mux.HandleFunc("/export", handleExport)

	addr := envOr("HOST", "127.0.0.1") + ":" + envOr("PORT", "8788")
	log.Printf("aicut-backend-go listening on %s", addr)
	if err := http.ListenAndServe(addr, withCORS(mux)); err != nil {
		log.Fatal(err)
	}
}

func handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
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

	res, err := renderProject(r.Context(), req)
	if err != nil {
		log.Printf("export failed: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	defer res.Cleanup()

	f, err := os.Open(res.OutputPath)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	defer f.Close()

	info, err := f.Stat()
	if err == nil {
		w.Header().Set("content-length", strconv.FormatInt(info.Size(), 10))
	}
	w.Header().Set("content-type", "video/mp4")
	w.Header().Set("content-disposition", `attachment; filename="aicut.mp4"`)
	w.WriteHeader(http.StatusOK)
	_, _ = io.Copy(w, f)
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
