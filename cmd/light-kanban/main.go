// Command light-kanban runs the board service: REST API + SQLite + embedded UI.
package main

import (
	"flag"
	"log"
	"net"
	"net/http"
	"os/exec"
	"runtime"
	"strings"

	"light-kanban/internal/api"
	"light-kanban/internal/store"
	"light-kanban/internal/webui"
)

func main() {
	addr := flag.String("addr", ":8080", "listen address")
	dbPath := flag.String("db", "kanban.db", "SQLite database path (:memory: accepted)")
	avatarsDir := flag.String("avatars", "avatars", "directory for uploaded agent avatar images")
	noOpen := flag.Bool("no-open", false, "do not open the browser on startup")
	flag.Parse()

	s, err := store.Open(*dbPath)
	if err != nil {
		log.Fatalf("open database: %v", err)
	}
	defer s.Close()

	ln, err := net.Listen("tcp", *addr)
	if err != nil {
		log.Fatalf("listen on %s: %v", *addr, err)
	}
	url := browserURL(*addr)
	log.Printf("light-kanban listening on %s (db: %s, avatars: %s)", *addr, *dbPath, *avatarsDir)
	log.Printf("open %s in your browser", url)
	if !*noOpen {
		openBrowser(url)
	}

	handler := api.New(s, webui.FS, *avatarsDir)
	log.Fatal(http.Serve(ln, handler))
}

// browserURL converts the listen address into a URL the local browser can open.
func browserURL(addr string) string {
	if strings.HasPrefix(addr, ":") {
		return "http://localhost" + addr
	}
	return "http://" + addr
}

// openBrowser best-effort opens the default browser on the server machine so a
// double-clicked binary is immediately usable. Failures are logged, not fatal.
func openBrowser(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("cmd", "/c", "start", "", url)
	case "darwin":
		cmd = exec.Command("open", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	if err := cmd.Start(); err != nil {
		log.Printf("could not open browser automatically: %v", err)
	}
}
