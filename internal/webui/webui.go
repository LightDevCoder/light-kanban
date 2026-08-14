// Package webui embeds the static web frontend served by the binary.
package webui

import "embed"

//go:embed index.html app.js style.css
var FS embed.FS
