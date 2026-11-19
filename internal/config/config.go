package config

import (
	"os"
	"path/filepath"
)

// Config holds runtime configuration loaded from environment variables.
type Config struct {
	Addr     string
	DBPath   string
	DataDir  string
	Env      string
	LogLevel string
}

// Load reads configuration from environment variables with safe local defaults.
func Load() Config {
	dataDir := getEnv("LINKTIVE_DATA_DIR", "./data")
	dbPath := getEnv("LINKTIVE_DB_PATH", filepath.Join(dataDir, "linktive.db"))

	return Config{
		Addr:     getEnv("LINKTIVE_ADDR", ":8080"),
		DBPath:   dbPath,
		DataDir:  dataDir,
		Env:      getEnv("LINKTIVE_ENV", "development"),
		LogLevel: getEnv("LINKTIVE_LOG_LEVEL", "info"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
