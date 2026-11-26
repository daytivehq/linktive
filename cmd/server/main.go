package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/linktive/linktive/internal/backup"
	"github.com/linktive/linktive/internal/clipper"
	"github.com/linktive/linktive/internal/config"
	"github.com/linktive/linktive/internal/httpapi"
	"github.com/linktive/linktive/internal/store/sqlite"
	"github.com/linktive/linktive/internal/webembed"
)

func main() {
	cfg := config.Load()

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	st, err := sqlite.Open(ctx, cfg.DBPath)
	if err != nil {
		log.Fatalf("failed to initialize database: %v", err)
	}
	defer func() {
		if err := st.Close(); err != nil {
			log.Printf("error closing database: %v", err)
		}
	}()

	backupsDir := filepath.Join(cfg.DataDir, "backups")
	backupMgr := backup.NewManager(st, backupsDir)
	if err := st.RecoverInterruptedClips(ctx); err != nil {
		log.Fatalf("recover interrupted archives: %v", err)
	}
	backupDone := make(chan struct{})

	clipMgr := clipper.NewManager(st, filepath.Join(cfg.DataDir, "assets"), cfg.DBPath, backupsDir)
	if err := st.RepairMovedArchives(ctx, clipMgr.CopyBookmarkAssets, clipMgr.DeleteBookmarkAssets); err != nil {
		log.Printf("archive move recovery: %v", err)
	}
	go func() {
		defer close(backupDone)
		backupMgr.StartScheduler(ctx)
	}()
	clipMgr.Start(ctx)

	staticFS, err := webembed.DistFS()
	if err != nil {
		log.Fatalf("failed to load embedded frontend: %v", err)
	}

	srv := &http.Server{
		Addr: cfg.Addr,
		Handler: httpapi.NewRouter(
			st,
			staticFS,
			httpapi.WithBackupManager(backupMgr),
			httpapi.WithClipper(clipMgr),
		),
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		log.Printf("linktive listening on %s (env=%s, db=%s)", cfg.Addr, cfg.Env, cfg.DBPath)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("http server error: %v", err)
		}
	}()

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("graceful shutdown error: %v", err)
		_ = srv.Close()
	}
	clipMgr.Wait()
	<-backupDone
}
