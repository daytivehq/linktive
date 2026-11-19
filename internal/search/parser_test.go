package search

import (
	"reflect"
	"testing"
)

func TestParseQuery(t *testing.T) {
	q := ParseQuery("ws_1", "tags:게임 -tags:임시 site:github.com in:개발 date:2026-11-19 after:2026-11-01 before:2026-11-30 is:favorite 거래 명세")

	if !reflect.DeepEqual(q.IncludeTags, []string{"게임"}) {
		t.Fatalf("unexpected IncludeTags: %#v", q.IncludeTags)
	}
	if !reflect.DeepEqual(q.ExcludeTags, []string{"임시"}) {
		t.Fatalf("unexpected ExcludeTags: %#v", q.ExcludeTags)
	}
	if !reflect.DeepEqual(q.Domains, []string{"github.com"}) {
		t.Fatalf("unexpected Domains: %#v", q.Domains)
	}
	if q.Collection != "개발" {
		t.Fatalf("unexpected Collection: %q", q.Collection)
	}
	if q.DateExact != "2026-11-19" || q.DateAfter != "2026-11-01" || q.DateBefore != "2026-11-30" {
		t.Fatalf("unexpected date filters: exact=%q after=%q before=%q", q.DateExact, q.DateAfter, q.DateBefore)
	}
	if q.OnlyFavorite == nil || !*q.OnlyFavorite {
		t.Fatalf("expected OnlyFavorite=true")
	}
	if !reflect.DeepEqual(q.Terms, []string{"거래", "명세"}) {
		t.Fatalf("unexpected Terms: %#v", q.Terms)
	}

	// Trailing comma & comma-separated operator values should parse cleanly.
	q2 := ParseQuery("ws_1", "tags:커뮤니티, is:favorite")
	if !reflect.DeepEqual(q2.IncludeTags, []string{"커뮤니티"}) {
		t.Fatalf("expected IncludeTags=[커뮤니티], got %#v", q2.IncludeTags)
	}
	if q2.OnlyFavorite == nil || !*q2.OnlyFavorite {
		t.Fatalf("expected OnlyFavorite=true")
	}

	q3 := ParseQuery("ws_1", "tags:커뮤니티,세금 is:blocked")
	if !reflect.DeepEqual(q3.IncludeTags, []string{"커뮤니티", "세금"}) {
		t.Fatalf("expected IncludeTags=[커뮤니티 세금], got %#v", q3.IncludeTags)
	}
	if q3.LinkStatus == nil || *q3.LinkStatus != "blocked" {
		t.Fatalf("expected LinkStatus=blocked, got %#v", q3.LinkStatus)
	}
}

func TestCompactText(t *testing.T) {
	got := CompactText("거래 명세서", " ", "PDF")
	if got != "거래명세서pdf" {
		t.Fatalf("expected 거래명세서pdf, got %q", got)
	}
}
