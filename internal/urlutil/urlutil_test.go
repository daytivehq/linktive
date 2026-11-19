package urlutil

import "testing"

func TestNormalizeAndEnsureScheme(t *testing.T) {
	norm, dom, err := Normalize("naver.com/news?utm_source=test&id=1")
	if err != nil {
		t.Fatalf("Normalize without scheme failed: %v", err)
	}
	if dom != "naver.com" {
		t.Fatalf("expected domain naver.com, got %q", dom)
	}
	if norm != "https://naver.com/news?id=1" {
		t.Fatalf("expected https://naver.com/news?id=1, got %q", norm)
	}

	if _, _, err := Normalize("javascript:alert(1)"); err == nil {
		t.Fatalf("expected error for javascript: URL")
	}

	href := extractFaviconHref(`<html><head><link rel="shortcut icon" href="/assets/fav.png"></head></html>`)
	if href != "/assets/fav.png" {
		t.Fatalf("expected /assets/fav.png, got %q", href)
	}
}
