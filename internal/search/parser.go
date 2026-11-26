package search

import (
	"strings"
	"unicode"

	"github.com/linktive/linktive/internal/domain"
	"github.com/linktive/linktive/internal/store"
)

var hangulChosung = [19]rune{
	'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ',
	'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
}

// ParseQuery splits a search string into free-text terms and filter operators
// (e.g. tag:게임, -tag:임시, site:github.com, in:개발, is:favorite, is:broken).
func ParseQuery(workspaceID, raw string) store.SearchQuery {
	q := store.SearchQuery{
		WorkspaceID: workspaceID,
		Raw:         strings.TrimSpace(raw),
		Sort:        "newest",
		Limit:       50,
	}
	if q.Raw == "" {
		return q
	}

	for _, rawToken := range strings.Fields(q.Raw) {
		token := strings.TrimRight(rawToken, ",")
		if token == "" {
			continue
		}
		lower := strings.ToLower(token)
		switch {
		case strings.HasPrefix(lower, "tags:") && len(token) > 5:
			q.IncludeTags = append(q.IncludeTags, splitOperatorValues(token[5:], true)...)
		case strings.HasPrefix(lower, "tag:") && len(token) > 4:
			q.IncludeTags = append(q.IncludeTags, splitOperatorValues(token[4:], true)...)
		case strings.HasPrefix(lower, "-tags:") && len(token) > 6:
			q.ExcludeTags = append(q.ExcludeTags, splitOperatorValues(token[6:], true)...)
		case strings.HasPrefix(lower, "-tag:") && len(token) > 5:
			q.ExcludeTags = append(q.ExcludeTags, splitOperatorValues(token[5:], true)...)
		case strings.HasPrefix(lower, "site:") && len(token) > 5:
			q.Domains = append(q.Domains, splitOperatorValues(token[5:], true)...)
		case strings.HasPrefix(lower, "in:") && len(token) > 3:
			q.Collection = strings.Trim(token[3:], ",")
		case strings.HasPrefix(lower, "date:") && len(token) > 5:
			q.DateExact = strings.Trim(token[5:], ",")
		case strings.HasPrefix(lower, "after:") && len(token) > 6:
			q.DateAfter = strings.Trim(token[6:], ",")
		case strings.HasPrefix(lower, "before:") && len(token) > 7:
			q.DateBefore = strings.Trim(token[7:], ",")
		case lower == "is:archived" || lower == "-is:archived":
			archived := lower == "is:archived"
			q.HasArchive = &archived
		case lower == "is:favorite":
			t := true
			q.OnlyFavorite = &t
		case lower == "is:broken":
			s := domain.LinkStatusBroken
			q.LinkStatus = &s
		case lower == "is:blocked":
			s := domain.LinkStatusBlocked
			q.LinkStatus = &s
		default:
			q.Terms = append(q.Terms, token)
		}
	}
	return q
}

func splitOperatorValues(raw string, lowercase bool) []string {
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		clean := strings.TrimSpace(p)
		if clean == "" {
			continue
		}
		if lowercase {
			clean = strings.ToLower(clean)
		}
		out = append(out, clean)
	}
	return out
}

// CompactText normalizes text by stripping whitespace and lowercasing
// so Korean substring queries match regardless of spacing.
func CompactText(parts ...string) string {
	var b strings.Builder
	for _, p := range parts {
		for _, r := range strings.ToLower(p) {
			if unicode.IsSpace(r) {
				continue
			}
			b.WriteRune(r)
		}
	}
	return b.String()
}

// ExtractChosung converts Hangul syllables into compatibility Jamo initial consonants
// while keeping ASCII alphanumeric characters lowercase and stripping whitespace.
func ExtractChosung(parts ...string) string {
	var b strings.Builder
	for _, p := range parts {
		for _, r := range strings.ToLower(p) {
			if unicode.IsSpace(r) {
				continue
			}
			if r >= 0xAC00 && r <= 0xD7A3 {
				idx := int(r-0xAC00) / (21 * 28)
				b.WriteRune(hangulChosung[idx])
				continue
			}
			b.WriteRune(r)
		}
	}
	return b.String()
}

// IsChosungOnly reports whether s consists exclusively of Korean initial consonant runes.
func IsChosungOnly(s string) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		matched := false
		for _, c := range hangulChosung {
			if r == c {
				matched = true
				break
			}
		}
		if !matched {
			return false
		}
	}
	return true
}

// QuoteFTS5Literal wraps a substring safely for SQLite FTS5 trigram MATCH expressions.
func QuoteFTS5Literal(s string) string {
	return `"` + strings.ReplaceAll(s, `"`, `""`) + `"`
}
