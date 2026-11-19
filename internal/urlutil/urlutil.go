package urlutil

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/url"
	"path"
	"regexp"
	"sort"
	"strings"
	"time"
)

var (
	ErrInvalidURL = errors.New("invalid http/https url")

	titleRegex = regexp.MustCompile(`(?is)<title[^>]*>(.*?)</title>`)
	metaRegex  = regexp.MustCompile(`(?is)<meta\s+([^>]+)>`)
	attrRegex  = regexp.MustCompile(`(?is)([a-zA-Z0-9:_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')`)
)

// Metadata holds extracted web page attributes.
type Metadata struct {
	Title       string
	Description string
	FaviconURL  string
}

// Normalize validates an HTTP(S) URL and returns a canonical string for duplicate detection plus domain.
func Normalize(raw string) (normalized string, domain string, err error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", "", ErrInvalidURL
	}
	u, err := url.Parse(trimmed)
	if err != nil || u.Host == "" {
		return "", "", ErrInvalidURL
	}
	scheme := strings.ToLower(u.Scheme)
	if scheme != "http" && scheme != "https" {
		return "", "", ErrInvalidURL
	}

	host := strings.ToLower(u.Hostname())
	port := u.Port()
	if (scheme == "http" && port == "80") || (scheme == "https" && port == "443") {
		port = ""
	}
	u.Scheme = scheme
	if port != "" {
		u.Host = host + ":" + port
	} else {
		u.Host = host
	}

	u.Fragment = ""
	if u.Path != "" && u.Path != "/" {
		clean := path.Clean(u.Path)
		if clean == "." {
			clean = "/"
		}
		u.Path = clean
	} else {
		u.Path = ""
	}

	// Strip common tracking query parameters while keeping meaningful ones sorted.
	q := u.Query()
	for key := range q {
		lk := strings.ToLower(key)
		if strings.HasPrefix(lk, "utm_") || lk == "fbclid" || lk == "gclid" {
			q.Del(key)
		}
	}
	if len(q) > 0 {
		keys := make([]string, 0, len(q))
		for k := range q {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		var pairs []string
		for _, k := range keys {
			vals := q[k]
			sort.Strings(vals)
			for _, v := range vals {
				pairs = append(pairs, url.QueryEscape(k)+"="+url.QueryEscape(v))
			}
		}
		u.RawQuery = strings.Join(pairs, "&")
	} else {
		u.RawQuery = ""
	}

	return u.String(), host, nil
}

// FetchMetadata best-effort downloads page title and description with strict timeout and byte limit.
func FetchMetadata(ctx context.Context, targetURL string) Metadata {
	reqCtx, cancel := context.WithTimeout(ctx, 4*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, targetURL, nil)
	if err != nil {
		return Metadata{}
	}
	req.Header.Set("User-Agent", "linktive-bot/0.1 (+https://github.com/linktive/linktive)")
	req.Header.Set("Accept", "text/html,application/xhtml+xml")

	client := &http.Client{Timeout: 4 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return Metadata{}
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode < 200 || resp.StatusCode >= 400 {
		return Metadata{}
	}

	bodyBytes, err := io.ReadAll(io.LimitReader(resp.Body, 256*1024))
	if err != nil {
		return Metadata{}
	}
	html := string(bodyBytes)

	var meta Metadata
	if m := titleRegex.FindStringSubmatch(html); len(m) > 1 {
		meta.Title = cleanText(m[1])
	}

	for _, tag := range metaRegex.FindAllStringSubmatch(html, -1) {
		attrs := parseAttrs(tag[1])
		prop := strings.ToLower(attrs["property"])
		name := strings.ToLower(attrs["name"])
		content := cleanText(attrs["content"])
		if content == "" {
			continue
		}
		if prop == "og:title" && meta.Title == "" {
			meta.Title = content
		}
		if prop == "og:description" || (name == "description" && meta.Description == "") {
			meta.Description = content
		}
	}

	if parsed, err := url.Parse(targetURL); err == nil && parsed.Host != "" {
		meta.FaviconURL = parsed.Scheme + "://" + parsed.Host + "/favicon.ico"
	}

	return meta
}

func parseAttrs(raw string) map[string]string {
	attrs := make(map[string]string)
	for _, m := range attrRegex.FindAllStringSubmatch(raw, -1) {
		k := strings.ToLower(m[1])
		v := m[2]
		if v == "" {
			v = m[3]
		}
		attrs[k] = v
	}
	return attrs
}

func cleanText(s string) string {
	return strings.Join(strings.Fields(strings.TrimSpace(s)), " ")
}
