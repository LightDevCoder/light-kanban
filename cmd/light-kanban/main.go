// Command light-kanban runs the board service: REST API + SQLite + embedded UI.
package main

import (
	"flag"
	"log"
	"net/http"

	"light-kanban/internal/api"
	"light-kanban/internal/store"
	"light-kanban/internal/webui"
)

func main() {
	addr := flag.String("addr", ":8080", "listen address")
	dbPath := flag.String("db", "kanban.db", "SQLite database path (:memory: accepted)")
	avatarsDir := flag.String("avatars", "avatars", "directory for uploaded agent avatar images")
	flag.Parse()

	s, err := store.Open(*dbPath)
	if err != nil {
		log.Fatalf("open database: %v", err)
	}
	defer s.Close()

	handler := api.New(s, webui.FS, *avatarsDir)
	log.Printf("light-kanban listening on %s (db: %s, avatars: %s)", *addr, *dbPath, *avatarsDir)
	log.Fatal(http.ListenAndServe(*addr, handler))
}
