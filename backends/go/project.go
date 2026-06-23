package main

// Project mirrors the @aicut/core Project JSON shape. Keep this in
// sync with packages/core/src/types.ts.

type MediaSource struct {
	ID       string `json:"id"`
	URL      string `json:"url"`
	Kind     string `json:"kind"`
	Duration int64  `json:"duration,omitempty"`
	Name     string `json:"name,omitempty"`
}

type Clip struct {
	ID       string `json:"id"`
	SourceID string `json:"sourceId"`
	In       int64  `json:"in"`
	Out      int64  `json:"out"`
	Start    int64  `json:"start"`
}

type Track struct {
	ID    string `json:"id"`
	Kind  string `json:"kind"`
	Clips []Clip `json:"clips"`
}

type Project struct {
	Version int           `json:"version"`
	Sources []MediaSource `json:"sources"`
	Tracks  []Track       `json:"tracks"`
}

type OutputOptions struct {
	Width  int `json:"width,omitempty"`
	Height int `json:"height,omitempty"`
	FPS    int `json:"fps,omitempty"`
}

type ExportRequest struct {
	Project Project        `json:"project"`
	Output  *OutputOptions `json:"output,omitempty"`
}
