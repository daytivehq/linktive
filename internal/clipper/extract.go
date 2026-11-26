package clipper

import (
	"bytes"
	"net/url"
	"strings"
	"unicode/utf8"

	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

// ExtractedArticle holds cleaned readable HTML, plain text, metadata, and discovered image URLs.
type ExtractedArticle struct {
	Title       string
	Byline      string
	SiteName    string
	ContentHTML string
	ContentText string
	ImageURLs   []string
}

var blockedTags = map[string]bool{
	"script":   true,
	"style":    true,
	"noscript": true,
	"iframe":   true,
	"object":   true,
	"embed":    true,
	"form":     true,
	"input":    true,
	"button":   true,
	"select":   true,
	"textarea": true,
	"nav":      true,
	"footer":   true,
	"aside":    true,
	"svg":      true,
	"canvas":   true,
}

var allowedTags = map[string]bool{
	"article": true, "section": true, "div": true, "span": true, "p": true, "br": true, "hr": true,
	"h1": true, "h2": true, "h3": true, "h4": true, "h5": true, "h6": true,
	"blockquote": true, "pre": true, "code": true, "kbd": true, "samp": true,
	"ul": true, "ol": true, "li": true, "dl": true, "dt": true, "dd": true,
	"table": true, "thead": true, "tbody": true, "tfoot": true, "tr": true, "th": true, "td": true,
	"strong": true, "b": true, "em": true, "i": true, "u": true, "s": true, "del": true, "mark": true,
	"sub": true, "sup": true, "a": true, "img": true, "figure": true, "figcaption": true,
}

// ExtractArticle parses raw HTML, selects the primary readable content container, sanitizes markup,
// resolves relative links/images, and returns structured article text and image URLs.
func ExtractArticle(rawHTML []byte, pageURL string) ExtractedArticle {
	baseURL, _ := url.Parse(pageURL)
	doc, err := html.Parse(bytes.NewReader(rawHTML))
	if err != nil {
		return ExtractedArticle{}
	}

	var result ExtractedArticle
	extractDocumentMeta(doc, &result)

	root := findMainContentNode(doc)
	if root == nil {
		root = findTag(doc, atom.Body)
	}
	if root == nil {
		root = doc
	}

	imgSeen := make(map[string]struct{})
	cleaned := cloneAndSanitize(root, baseURL, imgSeen, &result.ImageURLs)
	if cleaned == nil {
		return result
	}

	var htmlBuf bytes.Buffer
	for c := cleaned.FirstChild; c != nil; c = c.NextSibling {
		_ = html.Render(&htmlBuf, c)
	}
	// If root itself was not an inline wrapper (e.g. a single <p>), render cleaned directly when inner is empty.
	if htmlBuf.Len() == 0 {
		_ = html.Render(&htmlBuf, cleaned)
	}

	result.ContentHTML = strings.TrimSpace(htmlBuf.String())
	var textBuf strings.Builder
	collectPlainText(cleaned, &textBuf)
	result.ContentText = normalizeWhitespace(textBuf.String())
	if result.Title == "" && baseURL != nil {
		result.Title = baseURL.Hostname()
	}
	return result
}

func extractDocumentMeta(n *html.Node, out *ExtractedArticle) {
	if n.Type == html.ElementNode {
		switch n.DataAtom {
		case atom.Title:
			if out.Title == "" {
				var b strings.Builder
				collectPlainText(n, &b)
				out.Title = normalizeWhitespace(b.String())
			}
		case atom.Meta:
			prop := strings.ToLower(getAttr(n, "property"))
			name := strings.ToLower(getAttr(n, "name"))
			content := normalizeWhitespace(getAttr(n, "content"))
			if content != "" {
				switch {
				case prop == "og:title":
					out.Title = content
				case prop == "og:site_name" && out.SiteName == "":
					out.SiteName = content
				case (name == "author" || prop == "article:author") && out.Byline == "":
					out.Byline = content
				}
			}
		case atom.H1:
			if out.Title == "" {
				var b strings.Builder
				collectPlainText(n, &b)
				if t := normalizeWhitespace(b.String()); t != "" {
					out.Title = t
				}
			}
		}
	}
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		extractDocumentMeta(c, out)
	}
}

func findMainContentNode(doc *html.Node) *html.Node {
	// Prefer explicit semantic containers if they contain meaningful text.
	for _, selectorTag := range []atom.Atom{atom.Article, atom.Main} {
		if node := findTag(doc, selectorTag); node != nil && textRuneLen(node) >= 120 {
			return node
		}
	}

	body := findTag(doc, atom.Body)
	if body == nil {
		return nil
	}

	var bestNode *html.Node
	bestScore := -1
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type != html.ElementNode {
			return
		}
		tag := strings.ToLower(n.Data)
		if blockedTags[tag] || looksLikeChrome(n) {
			return
		}
		if tag == "div" || tag == "section" || tag == "article" || tag == "main" {
			score := scoreContentCandidate(n)
			if score > bestScore {
				bestScore = score
				bestNode = n
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(body)
	if bestScore > 60 && bestNode != nil {
		return bestNode
	}
	return body
}

func scoreContentCandidate(n *html.Node) int {
	pCount := 0
	pRunes := 0
	linkRunes := 0
	imgCount := 0

	var inspect func(*html.Node, bool)
	inspect = func(cur *html.Node, insideLink bool) {
		if cur.Type == html.TextNode {
			r := utf8.RuneCountInString(strings.TrimSpace(cur.Data))
			if insideLink {
				linkRunes += r
			}
			return
		}
		if cur.Type != html.ElementNode {
			return
		}
		tag := strings.ToLower(cur.Data)
		if blockedTags[tag] {
			return
		}
		if tag == "p" || tag == "pre" || tag == "blockquote" || tag == "li" {
			pCount++
			pRunes += textRuneLen(cur)
		}
		if tag == "img" {
			imgCount++
		}
		isLink := insideLink || tag == "a"
		for c := cur.FirstChild; c != nil; c = c.NextSibling {
			inspect(c, isLink)
		}
	}
	inspect(n, false)

	score := pRunes + pCount*15 + imgCount*20 - linkRunes
	hint := strings.ToLower(getAttr(n, "id") + " " + getAttr(n, "class"))
	for _, good := range []string{"article", "post", "entry", "content", "markdown", "viewer", "se-main"} {
		if strings.Contains(hint, good) {
			score += 120
		}
	}
	if strings.Contains(hint, "comment") || strings.Contains(hint, "sidebar") || strings.Contains(hint, "recommend") {
		score -= 200
	}
	return score
}

func looksLikeChrome(n *html.Node) bool {
	if strings.EqualFold(getAttr(n, "role"), "navigation") || strings.EqualFold(getAttr(n, "aria-hidden"), "true") {
		return true
	}
	hint := strings.ToLower(getAttr(n, "id") + " " + getAttr(n, "class"))
	for _, bad := range []string{"nav", "sidebar", "footer", "cookie", "banner", "popup", "modal", "advertisement", "ad-", "share-buttons"} {
		if strings.Contains(hint, bad) && !strings.Contains(hint, "content") && !strings.Contains(hint, "article") {
			return true
		}
	}
	return false
}

func cloneAndSanitize(n *html.Node, baseURL *url.URL, imgSeen map[string]struct{}, imgList *[]string) *html.Node {
	switch n.Type {
	case html.TextNode:
		return &html.Node{Type: html.TextNode, Data: n.Data}
	case html.ElementNode:
		tag := strings.ToLower(n.Data)
		if blockedTags[tag] || looksLikeChrome(n) {
			return nil
		}
		if !allowedTags[tag] {
			tag = "div"
		}
		out := &html.Node{Type: html.ElementNode, Data: tag}
		switch tag {
		case "a":
			if href := resolveSafeURL(getAttr(n, "href"), baseURL); href != "" {
				out.Attr = append(out.Attr,
					html.Attribute{Key: "href", Val: href},
					html.Attribute{Key: "target", Val: "_blank"},
					html.Attribute{Key: "rel", Val: "noopener noreferrer"},
				)
			}
		case "img":
			rawSrc := pickBestImageSrc(n)
			resolved := resolveSafeURL(rawSrc, baseURL)
			if resolved == "" {
				return nil
			}
			out.Attr = append(out.Attr, html.Attribute{Key: "src", Val: resolved})
			if alt := strings.TrimSpace(getAttr(n, "alt")); alt != "" {
				out.Attr = append(out.Attr, html.Attribute{Key: "alt", Val: alt})
			}
			if _, exists := imgSeen[resolved]; !exists {
				imgSeen[resolved] = struct{}{}
				*imgList = append(*imgList, resolved)
			}
			return out
		case "th", "td":
			if cs := getAttr(n, "colspan"); cs != "" {
				out.Attr = append(out.Attr, html.Attribute{Key: "colspan", Val: cs})
			}
			if rs := getAttr(n, "rowspan"); rs != "" {
				out.Attr = append(out.Attr, html.Attribute{Key: "rowspan", Val: rs})
			}
		}

		for c := n.FirstChild; c != nil; c = c.NextSibling {
			if child := cloneAndSanitize(c, baseURL, imgSeen, imgList); child != nil {
				out.AppendChild(child)
			}
		}
		return out
	default:
		return nil
	}
}

func pickBestImageSrc(n *html.Node) string {
	for _, key := range []string{"data-src", "data-original", "data-lazy-src", "src"} {
		if v := strings.TrimSpace(getAttr(n, key)); v != "" && !strings.HasPrefix(strings.ToLower(v), "data:image/gif;base64,r0lgod") {
			return v
		}
	}
	if srcset := strings.TrimSpace(getAttr(n, "srcset")); srcset != "" {
		first := strings.TrimSpace(strings.Split(srcset, ",")[0])
		if fields := strings.Fields(first); len(fields) > 0 {
			return fields[0]
		}
	}
	return ""
}

func resolveSafeURL(raw string, baseURL *url.URL) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" || strings.HasPrefix(trimmed, "#") {
		return ""
	}
	lower := strings.ToLower(trimmed)
	if strings.HasPrefix(lower, "javascript:") || strings.HasPrefix(lower, "vbscript:") {
		return ""
	}
	if strings.HasPrefix(lower, "data:") {
		if strings.HasPrefix(lower, "data:image/png") || strings.HasPrefix(lower, "data:image/jpeg") || strings.HasPrefix(lower, "data:image/webp") {
			return trimmed
		}
		return ""
	}
	ref, err := url.Parse(trimmed)
	if err != nil {
		return ""
	}
	if baseURL != nil {
		ref = baseURL.ResolveReference(ref)
	}
	scheme := strings.ToLower(ref.Scheme)
	if scheme != "http" && scheme != "https" {
		return ""
	}
	return ref.String()
}

func findTag(n *html.Node, a atom.Atom) *html.Node {
	if n.Type == html.ElementNode && n.DataAtom == a {
		return n
	}
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		if hit := findTag(c, a); hit != nil {
			return hit
		}
	}
	return nil
}

func getAttr(n *html.Node, key string) string {
	for _, a := range n.Attr {
		if strings.EqualFold(a.Key, key) {
			return a.Val
		}
	}
	return ""
}

func textRuneLen(n *html.Node) int {
	var b strings.Builder
	collectPlainText(n, &b)
	return utf8.RuneCountInString(normalizeWhitespace(b.String()))
}

func collectPlainText(n *html.Node, b *strings.Builder) {
	if n.Type == html.TextNode {
		b.WriteString(n.Data)
		b.WriteByte(' ')
		return
	}
	if n.Type == html.ElementNode && blockedTags[strings.ToLower(n.Data)] {
		return
	}
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		collectPlainText(c, b)
	}
}

func normalizeWhitespace(s string) string {
	return strings.Join(strings.Fields(strings.TrimSpace(s)), " ")
}
