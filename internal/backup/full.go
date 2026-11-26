package backup

import (
	"archive/zip"
	"context"
	"errors"
	"io"
	"io/fs"
	"os"
	"path"
	"path/filepath"
)

const databaseName = "linktive.db"
const assetsName = "assets"

func (m *Manager) writeFullBackup(ctx context.Context, stage, dest string) error {
	dbPath := filepath.Join(stage, databaseName)
	file, err := os.OpenFile(dest, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return err
	}
	defer file.Close()
	archive := zip.NewWriter(file)

	// Archive changes publish database rows and asset files under the same lock.
	// Compress the database snapshot after releasing it to limit the write pause.
	err = func() error {
		unlock := m.assets.LockAssets()
		defer unlock()
		if err := m.store.BackupTo(ctx, dbPath); err != nil {
			return err
		}
		return writeAssets(ctx, archive, m.assets.AssetsDir())
	}()
	if err != nil {
		return err
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := writeZipFile(archive, databaseName, dbPath, zip.Deflate); err != nil {
		return err
	}
	if err := archive.Close(); err != nil {
		return err
	}
	return file.Sync()
}

func writeAssets(ctx context.Context, archive *zip.Writer, root string) error {
	dir := &zip.FileHeader{Name: assetsName + "/"}
	dir.SetMode(fs.ModeDir | 0o700)
	if _, err := archive.CreateHeader(dir); err != nil {
		return err
	}
	info, err := os.Lstat(root)
	if errors.Is(err, os.ErrNotExist) {
		return nil // A server that has never archived a page has no assets directory.
	}
	if err != nil {
		return err
	}
	if !info.IsDir() {
		return errors.New("archive asset path must be a directory")
	}
	return filepath.WalkDir(root, func(name string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if err := ctx.Err(); err != nil {
			return err
		}
		if entry.IsDir() {
			return nil // Member paths carry directory names.
		}
		if !entry.Type().IsRegular() {
			return errors.New("archive asset is not a regular file")
		}
		relative, err := filepath.Rel(root, name)
		if err != nil {
			return err
		}
		// Most images are compressed already. Store assets directly to keep the lock short.
		return writeZipFile(archive, path.Join(assetsName, filepath.ToSlash(relative)), name, zip.Store)
	})
}

func writeZipFile(archive *zip.Writer, name, filename string, method uint16) error {
	file, err := os.Open(filename)
	if err != nil {
		return err
	}
	defer file.Close()
	header := &zip.FileHeader{Name: name, Method: method}
	header.SetMode(0o600)
	member, err := archive.CreateHeader(header)
	if err != nil {
		return err
	}
	_, err = io.Copy(member, file)
	return err
}
