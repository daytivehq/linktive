package clipper

import (
	"bytes"
	"net/url"
	"regexp"
	"strings"

	"golang.org/x/net/html"
)

// ExtractedSnapshot holds sanitized full-page HTML preserving original layout/styles plus asset URLs.
type ExtractedSnapshot struct {
	SnapshotHTML  string
	ImageURLs     []string
	StylesheetURLs []string
}

var snapshotDroppedTags = map[string]bool{
	"script": true,
	"iframe": true,
	"object": true,
	"embed":  true,
	"applet": true,
	"base":   true,
}

var cssURLRegex = regexp.MustCompile(`url\(\s*(['"]?)([^)'"\s]+)(['"]?)\s*\)`)

// ExtractSnapshot sanitizes a full HTML document (stripping scripts/iframes/handlers) while keeping
// CSS links, inline styles, and structural layout intact, and resolves relative URLs against pageURL.
func ExtractSnapshot(rawHTML []byte, pageURL string) ExtractedSnapshot {
	baseURL, _ := url.Parse(pageURL)
	doc, err := html.Parse(bytes.NewReader(rawHTML))
	if err != nil {
		return ExtractedSnapshot{}
	}

	var res ExtractedSnapshot
	imgSeen := make(map[string]struct{})
	cssSeen := make(map[string]struct{})

	cleaned := cloneSnapshotNode(doc, baseURL, imgSeen, &res.ImageURLs, cssSeen, &res.StylesheetURLs)
	if cleaned == nil {
		return res
	}

	var buf bytes.Buffer
	_ = html.Render(&buf, cleaned)
	res.SnapshotHTML = strings.TrimSpace(buf.String())
	return res
}

func cloneSnapshotNode(
	n *html.Node,
	baseURL *url.URL,
	imgSeen map[string]struct{},
	imgList *[]string,
	cssSeen map[string]struct{},
	cssList *[]string,
) *html.Node {
	switch n.Type {
	case html.DocumentNode:
		out := &html.Node{Type: html.DocumentNode}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			if child := cloneSnapshotNode(c, baseURL, imgSeen, imgList, cssSeen, cssList); child != nil {
				out.AppendChild(child)
			}
		}
		return out
	case html.DoctypeNode:
		return &html.Node{Type: html.DoctypeNode, Data: n.Data, Attr: append([]html.Attribute(nil), n.Attr...)}
	case html.TextNode:
		return &html.Node{Type: html.TextNode, Data: n.Data}
	case html.ElementNode:
		tag := strings.ToLower(n.Data)
		if snapshotDroppedTags[tag] {
			return nil
		}
		if tag == "meta" && strings.EqualFold(getAttr(n, "http-equiv"), "refresh") {
			return nil
		}

		out := &html.Node{
			Type:     html.ElementNode,
			Data:     n.Data,
			DataAtom: n.DataAtom,
		}

		if tag == "img" {
			bestSrc := pickBestImageSrc(n)
			resolved := resolveSafeURL(bestSrc, baseURL)
			hadLazyAttr := strings.TrimSpace(getAttr(n, "data-src")) != "" ||
				strings.TrimSpace(getAttr(n, "data-original")) != "" ||
				strings.TrimSpace(getAttr(n, "data-lazy-src")) != ""
			for _, a := range n.Attr {
				key := strings.ToLower(a.Key)
				if strings.HasPrefix(key, "on") || key == "src" || key == "srcset" || key == "data-src" || key == "data-original" || key == "data-lazy-src" {
					continue
				}
				if key == "class" {
					cleanedClass := stripLazyHideClasses(a.Val)
					if cleanedClass != "" {
						out.Attr = append(out.Attr, html.Attribute{Key: a.Key, Val: cleanedClass})
					}
					continue
				}
				if key == "style" && (hadLazyAttr || resolved != "") {
					cleanedStyle := stripHiddenImageStyle(a.Val)
					if cleanedStyle != "" {
						out.Attr = append(out.Attr, html.Attribute{Key: a.Key, Val: cleanedStyle})
					}
					continue
				}
				out.Attr = append(out.Attr, a)
			}
			if resolved != "" {
				out.Attr = append(out.Attr, html.Attribute{Key: "src", Val: resolved})
				if _, ok := imgSeen[resolved]; !ok {
					imgSeen[resolved] = struct{}{}
					*imgList = append(*imgList, resolved)
				}
			}
			return out
		}

		if tag == "source" {
			// Skip remote srcset on <picture>/<source> when rendering localized snapshot images.
			if srcset := strings.TrimSpace(getAttr(n, "srcset")); srcset != "" {
				first := strings.TrimSpace(strings.Split(srcset, ",")[0])
				if fields := strings.Fields(first); len(fields) > 0 {
					if resolved := resolveSafeURL(fields[0], baseURL); resolved != "" {
						out.Attr = append(out.Attr, html.Attribute{Key: "srcset", Val: resolved})
						if _, ok := imgSeen[resolved]; !ok {
							imgSeen[resolved] = struct{}{}
							*imgList = append(*imgList, resolved)
						}
					}
				}
			}
			for _, a := range n.Attr {
				key := strings.ToLower(a.Key)
				if strings.HasPrefix(key, "on") || key == "srcset" {
					continue
				}
				if key == "src" {
					if resolved := resolveSafeURL(a.Val, baseURL); resolved != "" {
						out.Attr = append(out.Attr, html.Attribute{Key: "src", Val: resolved})
						if _, ok := imgSeen[resolved]; !ok {
							imgSeen[resolved] = struct{}{}
							*imgList = append(*imgList, resolved)
						}
					}
					continue
				}
				out.Attr = append(out.Attr, a)
			}
			return out
		}

		isStylesheetLink := tag == "link" && containsWord(strings.ToLower(getAttr(n, "rel")), "stylesheet")
		isIconLink := tag == "link" && containsWord(strings.ToLower(getAttr(n, "rel")), "icon")

		for _, a := range n.Attr {
			key := strings.ToLower(a.Key)
			if strings.HasPrefix(key, "on") {
				continue
			}
			// Drop preload/modulepreload/integrity/nonce so rewritten local CSS isn't blocked by SRI.
			if tag == "link" && (key == "integrity" || key == "crossorigin" || key == "nonce") {
				continue
			}

			val := a.Val
			switch key {
			case "href":
				if tag == "a" || tag == "area" {
					if safe := resolveLinkHref(val, baseURL); safe != "" {
						val = safe
					} else {
						continue
					}
				} else if isStylesheetLink {
					if resolved := resolveSafeURL(val, baseURL); resolved != "" {
						val = resolved
						if _, ok := cssSeen[resolved]; !ok {
							cssSeen[resolved] = struct{}{}
							*cssList = append(*cssList, resolved)
						}
					} else {
						continue
					}
				} else if isIconLink {
					if resolved := resolveSafeURL(val, baseURL); resolved != "" {
						val = resolved
						if _, ok := imgSeen[resolved]; !ok {
							imgSeen[resolved] = struct{}{}
							*imgList = append(*imgList, resolved)
						}
					} else {
						continue
					}
				} else if resolved := resolveSafeURL(val, baseURL); resolved != "" {
					val = resolved
				} else if strings.HasPrefix(strings.ToLower(strings.TrimSpace(val)), "javascript:") || strings.HasPrefix(strings.ToLower(strings.TrimSpace(val)), "vbscript:") {
					continue
				}
			case "src", "poster":
				if resolved := resolveSafeURL(val, baseURL); resolved != "" {
					val = resolved
					if key == "poster" {
						if _, ok := imgSeen[resolved]; !ok {
							imgSeen[resolved] = struct{}{}
							*imgList = append(*imgList, resolved)
						}
					}
				} else {
					continue
				}
			case "action", "formaction":
				if safe := resolveLinkHref(val, baseURL); safe != "" {
					val = safe
				} else {
					continue
				}
			}

			out.Attr = append(out.Attr, html.Attribute{Key: a.Key, Val: val})
		}

		if tag == "a" && getAttr(out, "href") != "" && getAttr(out, "target") == "" {
			out.Attr = append(out.Attr,
				html.Attribute{Key: "target", Val: "_blank"},
				html.Attribute{Key: "rel", Val: "noopener noreferrer"},
			)
		}

		if tag == "style" {
			var cssBuf strings.Builder
			for c := n.FirstChild; c != nil; c = c.NextSibling {
				if c.Type == html.TextNode {
					cssBuf.WriteString(c.Data)
				}
			}
			if cssBuf.Len() > 0 {
				baseStr := ""
				if baseURL != nil {
					baseStr = baseURL.String()
				}
				rewritten := RewriteCSSURLs(cssBuf.String(), baseStr)
				out.AppendChild(&html.Node{Type: html.TextNode, Data: rewritten})
			}
			return out
		}

		for c := n.FirstChild; c != nil; c = c.NextSibling {
			if child := cloneSnapshotNode(c, baseURL, imgSeen, imgList, cssSeen, cssList); child != nil {
				out.AppendChild(child)
			}
		}
		return out
	default:
		return nil
	}
}

func resolveLinkHref(raw string, baseURL *url.URL) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return ""
	}
	if strings.HasPrefix(trimmed, "#") {
		return trimmed
	}
	lower := strings.ToLower(trimmed)
	if strings.HasPrefix(lower, "javascript:") || strings.HasPrefix(lower, "vbscript:") || strings.HasPrefix(lower, "data:") {
		return ""
	}
	return resolveSafeURL(trimmed, baseURL)
}

func containsWord(haystack, needle string) bool {
	for _, w := range strings.Fields(haystack) {
		if w == needle {
			return true
		}
	}
	return false
}

var (
	lazyHideStylePropRegex = regexp.MustCompile(`(?i)(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:\.0+)?)\s*(?:!important)?\s*;?`)
)

func stripHiddenImageStyle(style string) string {
	cleaned := lazyHideStylePropRegex.ReplaceAllString(style, ";")
	cleaned = strings.Trim(cleaned, " \t\n\r;")
	return cleaned
}

func stripLazyHideClasses(cls string) string {
	var kept []string
	for _, token := range strings.Fields(cls) {
		switch token {
		case "_LAZY_LOADING_INIT_HIDE", "_LAZY_LOADING_ERROR_HIDE":
			continue
		default:
			kept = append(kept, token)
		}
	}
	return strings.Join(kept, " ")
}

// RewriteCSSURLs resolves relative url(...) references inside CSS stylesheets against cssBaseURL.
func RewriteCSSURLs(cssText, cssBaseURL string) string {
	base, err := url.Parse(cssBaseURL)
	if err != nil || base == nil {
		return cssText
	}
	return cssURLRegex.ReplaceAllStringFunc(cssText, func(match string) string {
		sub := cssURLRegex.FindStringSubmatch(match)
		if len(sub) < 4 {
			return match
		}
		rawURL := strings.TrimSpace(sub[2])
		lower := strings.ToLower(rawURL)
		if rawURL == "" || strings.HasPrefix(rawURL, "#") || strings.HasPrefix(lower, "data:") || strings.HasPrefix(lower, "javascript:") {
			return match
		}
		ref, pErr := url.Parse(rawURL)
		if pErr != nil {
			return match
		}
		resolved := base.ResolveReference(ref)
		if resolved.Scheme != "http" && resolved.Scheme != "https" {
			return match
		}
		quote := sub[1]
		if quote == "" {
			quote = `"`
		}
		return "url(" + quote + resolved.String() + quote + ")"
	})
}
