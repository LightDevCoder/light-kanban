// Package webui embeds the built React frontend. `make frontend-build`
// compiles frontend/ (React + TypeScript + Vite) and copies the output into
// internal/webui/dist, which is committed so a fresh clone builds and tests
// without npm. See docs/adr/0002-react-frontend.md.
package webui

import (
	"embed"
	"io/fs"
)

//go:embed all:dist
var dist embed.FS

// FS is the built frontend rooted at the dist directory.
var FS = func() fs.FS {
	sub, err := fs.Sub(dist, "dist")
	if err != nil {
		panic(err)
	}
	return sub
}()
