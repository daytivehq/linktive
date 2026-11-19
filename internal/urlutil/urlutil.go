package urlutil

import (
	"context"
	"errors"
	"html"
	"io"
	"net/http"
	"net/url"
	"path"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/linktive/linktive/internal/domain"
)

var (
	ErrInvalidURL = errors.New("invalid http/https url")

	titleRegex = regexp.MustCompile(`(?is)<title[^>]*>(.*?)</title>`)
	metaRegex  = regexp.MustCompile(`(?is)<meta\s+([^>]+)>`)
	linkRegex  = regexp.MustCompile(`(?is)<link\s+([^>]+)>`)
	attrRegex  = regexp.MustCompile(`(?is)([a-zA-Z0-9:_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')`)
)

// Metadata holds extracted web page attributes.
type Metadata struct {
	Title       string
	Description string
	FaviconURL  string
}

// EnsureScheme prepends https:// when the input lacks a URL scheme.
func EnsureScheme(raw string) (string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", ErrInvalidURL
	}
	lower := strings.ToLower(trimmed)
	if strings.HasPrefix(lower, "javascript:") || strings.HasPrefix(lower, "data:") || strings.HasPrefix(lower, "file:") {
		return "", ErrInvalidURL
	}
	if !strings.Contains(trimmed, "://") {
		trimmed = "https://" + trimmed
	}
	return trimmed, nil
}

// Normalize validates an HTTP(S) URL (prepending https:// if missing) and returns
// the canonical URL for duplicate detection plus host domain.
func Normalize(raw string) (normalized string, domain string, err error) {
	withScheme, err := EnsureScheme(raw)
	if err != nil {
		return "", "", err
	}

	u, err := url.Parse(withScheme)
	if err != nil || u.Host == "" {
		return "", "", ErrInvalidURL
	}
	scheme := strings.ToLower(u.Scheme)
	if scheme != "http" && scheme != "https" {
		return "", "", ErrInvalidURL
	}

	host := strings.ToLower(u.Hostname())
	if host == "" {
		return "", "", ErrInvalidURL
	}
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

// FetchMetadata best-effort downloads page title, description, and favicon URL.
func FetchMetadata(ctx context.Context, targetURL string) Metadata {
	var meta Metadata
	baseURL, err := url.Parse(targetURL)
	if err == nil && baseURL.Host != "" {
		meta.FaviconURL = baseURL.Scheme + "://" + baseURL.Host + "/favicon.ico"
	}

	reqCtx, cancel := context.WithTimeout(ctx, 4*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, targetURL, nil)
	if err != nil {
		return meta
	}
	req.Header.Set("User-Agent", "linktive-bot/0.1 (+https://github.com/linktive/linktive)")
	req.Header.Set("Accept", "text/html,application/xhtml+xml")

	client := &http.Client{Timeout: 4 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return meta
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.Request != nil && resp.Request.URL != nil {
		baseURL = resp.Request.URL
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 400 {
		return meta
	}

	bodyBytes, err := io.ReadAll(io.LimitReader(resp.Body, 256*1024))
	if err != nil {
		return meta
	}
	pageHTML := string(bodyBytes)

	if m := titleRegex.FindStringSubmatch(pageHTML); len(m) > 1 {
		meta.Title = cleanText(html.UnescapeString(m[1]))
	}

	for _, tag := range metaRegex.FindAllStringSubmatch(pageHTML, -1) {
		attrs := parseAttrs(tag[1])
		prop := strings.ToLower(attrs["property"])
		name := strings.ToLower(attrs["name"])
		content := cleanText(html.UnescapeString(attrs["content"]))
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

	if iconHref := extractFaviconHref(pageHTML); iconHref != "" && baseURL != nil {
		if ref, err := url.Parse(iconHref); err == nil {
			meta.FaviconURL = baseURL.ResolveReference(ref).String()
		}
	}

	return meta
}

func extractFaviconHref(pageHTML string) string {
	var fallback string
	for _, tag := range linkRegex.FindAllStringSubmatch(pageHTML, -1) {
		attrs := parseAttrs(tag[1])
		rel := strings.ToLower(attrs["rel"])
		href := strings.TrimSpace(html.UnescapeString(attrs["href"]))
		if href == "" {
			continue
		}
		if rel == "icon" || rel == "shortcut icon" {
			return href
		}
		if strings.Contains(rel, "icon") && fallback == "" {
			fallback = href
		}
	}
	return fallback
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

// CheckURL verifies whether an HTTP(S) bookmark URL is reachable and classifies its link status.
func CheckURL(ctx context.Context, targetURL string) domain.LinkStatus {
	normalized, err := EnsureScheme(targetURL)
	if err != nil {
		return domain.LinkStatusBroken
	}
	u, err := url.Parse(normalized)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return domain.LinkStatusBroken
	}

	reqCtx, cancel := context.WithTimeout(ctx, 6*time.Second)
	defer cancel()

	client := &http.Client{Timeout: 6 * time.Second}
	doCheck := func(method string) (int, error) {
		req, rErr := http.NewRequestWithContext(reqCtx, method, normalized, nil)
		if rErr != nil {
			return 0, rErr
		}
		req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; linktive-linkcheck/0.2)")
		req.Header.Set("Accept", "text/html,application/xhtml+xml,*/*;q=0.8")
		resp, dErr := client.Do(req)
		if dErr != nil {
			return 0, dErr
		}
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
		_ = resp.Body.Close()
		return resp.StatusCode, nil
	}

	status, err := doCheck(http.MethodHead)
	if err != nil || status == http.StatusMethodNotAllowed || status == http.StatusNotImplemented || status == http.StatusForbidden {
		getStatus, getErr := doCheck(http.MethodGet)
		if getErr == nil {
			status = getStatus
			err = nil
		}
	}

	if err != nil {
		return domain.LinkStatusBroken
	}
	switch {
	case status >= 200 && status < 400:
		return domain.LinkStatusOK
	case status == http.StatusUnauthorized || status == http.StatusForbidden || status == http.StatusTooManyRequests:
		return domain.LinkStatusBlocked
	default:
		return domain.LinkStatusBroken
	}
}
