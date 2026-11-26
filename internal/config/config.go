package config

import (
	"fmt"
	"net/netip"
	"os"
	"path/filepath"
	"strings"
)

// Config holds runtime configuration loaded from environment variables.
type Config struct {
	TrustedProxyIPs []netip.Addr
	SetupToken      string
	Addr            string
	DBPath          string
	DataDir         string
	Env             string
	LogLevel        string
}

// Load reads configuration from environment variables with safe local defaults.
func Load() (Config, error) {
	var proxyIPs []netip.Addr
	for raw := range strings.SplitSeq(os.Getenv("LINKTIVE_TRUSTED_PROXY_IPS"), ",") {
		if strings.TrimSpace(raw) == "" {
			continue
		}
		ip, err := netip.ParseAddr(strings.TrimSpace(raw))
		if err != nil || ip.Zone() != "" {
			return Config{}, fmt.Errorf("invalid address in LINKTIVE_TRUSTED_PROXY_IPS: %q", raw)
		}
		proxyIPs = append(proxyIPs, ip)
	}
	dataDir := getEnv("LINKTIVE_DATA_DIR", "./data")
	dbPath := getEnv("LINKTIVE_DB_PATH", filepath.Join(dataDir, "linktive.db"))

	return Config{
		TrustedProxyIPs: proxyIPs,
		SetupToken:      os.Getenv("LINKTIVE_SETUP_TOKEN"),
		Addr:            getEnv("LINKTIVE_ADDR", ":8080"),
		DBPath:          dbPath,
		DataDir:         dataDir,
		Env:             getEnv("LINKTIVE_ENV", "development"),
		LogLevel:        getEnv("LINKTIVE_LOG_LEVEL", "info"),
	}, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
