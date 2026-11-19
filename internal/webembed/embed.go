package webembed

import (
	"embed"
	"io/fs"
)

//go:embed dist
var embeddedFiles embed.FS

// DistFS returns the embedded static frontend filesystem rooted at dist.
func DistFS() (fs.FS, error) {
	return fs.Sub(embeddedFiles, "dist")
}
