package clipper

import (
	"archive/zip"
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/linktive/linktive/internal/domain"
	"golang.org/x/net/html"
)

var localAssetRefRegex = regexp.MustCompile(`/api/v1/(?:workspaces/[^/\s)"']+/bookmarks/[^/\s)"']+|shared-collections/[^/\s)"']+/bookmarks/[^/\s)"']+)/assets/([A-Za-z0-9._-]+)`)

// BuildMarkdown renders a bookmark and its archived HTML article as an Obsidian-compatible Markdown document.
func BuildMarkdown(bm domain.Bookmark, ar domain.BookmarkArchive) string {
	var out strings.Builder

	title := strings.TrimSpace(ar.Title)
	if title == "" {
		title = bm.Title
	}

	out.WriteString("---\n")
	out.WriteString(fmt.Sprintf("title: %s\n", yamlQuote(title)))
	out.WriteString(fmt.Sprintf("url: %s\n", yamlQuote(bm.URL)))
	out.WriteString(fmt.Sprintf("domain: %s\n", yamlQuote(bm.Domain)))
	if ar.SiteName != "" {
		out.WriteString(fmt.Sprintf("site: %s\n", yamlQuote(ar.SiteName)))
	}
	if ar.Byline != "" {
		out.WriteString(fmt.Sprintf("author: %s\n", yamlQuote(ar.Byline)))
	}
	if len(bm.Tags) > 0 {
		out.WriteString("tags:\n")
		for _, tag := range bm.Tags {
			out.WriteString(fmt.Sprintf("  - %s\n", yamlQuote(tag)))
		}
	}
	out.WriteString(fmt.Sprintf("created_at: %s\n", bm.CreatedAt.Format("2006-01-02T15:04:05Z07:00")))
	if !ar.ArchivedAt.IsZero() {
		out.WriteString(fmt.Sprintf("archived_at: %s\n", ar.ArchivedAt.Format("2006-01-02T15:04:05Z07:00")))
	}
	out.WriteString("---\n\n")

	out.WriteString("# " + title + "\n\n")
	out.WriteString(fmt.Sprintf("> 원문: [%s](%s)\n\n", bm.URL, bm.URL))

	if strings.TrimSpace(bm.Note) != "" {
		out.WriteString("> [!note] 개인 메모\n")
		for _, line := range strings.Split(strings.TrimSpace(bm.Note), "\n") {
			out.WriteString("> " + line + "\n")
		}
		out.WriteString("\n")
	}

	if strings.TrimSpace(ar.ContentHTML) != "" {
		body := htmlToMarkdown(ar.ContentHTML)
		out.WriteString(strings.TrimSpace(body))
		out.WriteString("\n")
	} else if strings.TrimSpace(ar.ContentText) != "" {
		out.WriteString(strings.TrimSpace(ar.ContentText))
		out.WriteString("\n")
	} else if strings.TrimSpace(bm.Description) != "" {
		out.WriteString(strings.TrimSpace(bm.Description))
		out.WriteString("\n")
	}

	return out.String()
}

// BuildMarkdownBundle generates Markdown and, when local image assets are referenced in the article,
// rewrites their links to relative ./assets/<filename> paths and packages a self-contained ZIP archive.
func BuildMarkdownBundle(bm domain.Bookmark, ar domain.BookmarkArchive, assetsDir, mdBaseName string) (zipBytes []byte, mdContent string, assetCount int, err error) {
	md := BuildMarkdown(bm, ar)
	if assetsDir == "" || ar.WorkspaceID == "" || ar.BookmarkID == "" {
		return nil, md, 0, nil
	}

	matches := localAssetRefRegex.FindAllStringSubmatch(md, -1)
	if len(matches) == 0 {
		return nil, md, 0, nil
	}

	type bundledAsset struct {
		filename string
		data     []byte
	}
	seen := make(map[string]struct{})
	var assets []bundledAsset
	replacerPairs := make([]string, 0, len(matches)*2)

	for _, m := range matches {
		if len(m) < 2 {
			continue
		}
		fullRef := m[0]
		filename := m[1]
		if filepath.Base(filename) != filename || strings.Contains(filename, "..") {
			continue
		}
		if _, ok := seen[filename]; !ok {
			diskPath := filepath.Join(assetsDir, ar.WorkspaceID, ar.BookmarkID, filename)
			data, rErr := os.ReadFile(diskPath)
			if rErr != nil {
				continue
			}
			seen[filename] = struct{}{}
			assets = append(assets, bundledAsset{filename: filename, data: data})
		}
		replacerPairs = append(replacerPairs, fullRef, "assets/"+filename)
	}

	if len(assets) == 0 {
		return nil, md, 0, nil
	}

	rewrittenMD := strings.NewReplacer(replacerPairs...).Replace(md)
	if strings.TrimSpace(mdBaseName) == "" {
		mdBaseName = bm.ID
	}

	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	mdFile, err := zw.Create(mdBaseName + ".md")
	if err != nil {
		return nil, "", 0, err
	}
	if _, err := mdFile.Write([]byte(rewrittenMD)); err != nil {
		return nil, "", 0, err
	}
	for _, a := range assets {
		af, err := zw.Create("assets/" + a.filename)
		if err != nil {
			return nil, "", 0, err
		}
		if _, err := af.Write(a.data); err != nil {
			return nil, "", 0, err
		}
	}
	if err := zw.Close(); err != nil {
		return nil, "", 0, err
	}
	return buf.Bytes(), rewrittenMD, len(assets), nil
}

func htmlToMarkdown(rawHTML string) string {
	doc, err := html.Parse(strings.NewReader(rawHTML))
	if err != nil {
		return ""
	}
	var b strings.Builder
	renderMarkdownNode(doc, &b, 0, false)
	lines := strings.Split(b.String(), "\n")
	cleaned := make([]string, 0, len(lines))
	emptyRun := 0
	for _, line := range lines {
		trimmedRight := strings.TrimRight(line, " \t")
		if trimmedRight == "" {
			emptyRun++
			if emptyRun > 2 {
				continue
			}
		} else {
			emptyRun = 0
		}
		cleaned = append(cleaned, trimmedRight)
	}
	return strings.TrimSpace(strings.Join(cleaned, "\n"))
}

func renderMarkdownNode(n *html.Node, b *strings.Builder, listDepth int, inPre bool) {
	if n.Type == html.TextNode {
		if inPre {
			b.WriteString(n.Data)
		} else {
			text := strings.ReplaceAll(n.Data, "\n", " ")
			text = strings.Join(strings.Fields(text), " ")
			if text != "" {
				if b.Len() > 0 {
					last := b.String()[b.Len()-1]
					if last != '\n' && last != ' ' && last != '(' && last != '[' && last != '>' && last != '*' && last != '`' {
						b.WriteByte(' ')
					}
				}
				b.WriteString(text)
			}
		}
		return
	}
	if n.Type != html.ElementNode && n.Type != html.DocumentNode {
		return
	}

	tag := strings.ToLower(n.Data)
	switch tag {
	case "h1", "h2", "h3", "h4", "h5", "h6":
		level := int(tag[1] - '0')
		ensureBlankLine(b)
		b.WriteString(strings.Repeat("#", level) + " ")
		renderChildren(n, b, listDepth, false)
		b.WriteString("\n\n")
	case "p", "div", "section", "article", "figure":
		if tag == "p" {
			ensureBlankLine(b)
		}
		renderChildren(n, b, listDepth, inPre)
		if tag == "p" || tag == "figure" {
			b.WriteString("\n\n")
		}
	case "br":
		b.WriteString("  \n")
	case "hr":
		ensureBlankLine(b)
		b.WriteString("---\n\n")
	case "blockquote":
		ensureBlankLine(b)
		var sub strings.Builder
		renderChildren(n, &sub, listDepth, false)
		for _, line := range strings.Split(strings.TrimSpace(sub.String()), "\n") {
			b.WriteString("> " + line + "\n")
		}
		b.WriteByte('\n')
	case "pre":
		ensureBlankLine(b)
		b.WriteString("```\n")
		var code strings.Builder
		collectPreText(n, &code)
		b.WriteString(strings.TrimRight(code.String(), "\n"))
		b.WriteString("\n```\n\n")
	case "code":
		if inPre {
			renderChildren(n, b, listDepth, true)
			return
		}
		b.WriteByte('`')
		renderChildren(n, b, listDepth, false)
		b.WriteByte('`')
	case "strong", "b":
		b.WriteString("**")
		renderChildren(n, b, listDepth, inPre)
		b.WriteString("**")
	case "em", "i":
		b.WriteByte('*')
		renderChildren(n, b, listDepth, inPre)
		b.WriteByte('*')
	case "del", "s":
		b.WriteString("~~")
		renderChildren(n, b, listDepth, inPre)
		b.WriteString("~~")
	case "a":
		href := getAttr(n, "href")
		var label strings.Builder
		renderChildren(n, &label, listDepth, false)
		txt := strings.TrimSpace(label.String())
		if txt == "" {
			txt = href
		}
		if href != "" {
			b.WriteString(fmt.Sprintf("[%s](%s)", txt, href))
		} else {
			b.WriteString(txt)
		}
	case "img":
		src := getAttr(n, "src")
		alt := strings.TrimSpace(getAttr(n, "alt"))
		if src != "" {
			ensureBlankLine(b)
			b.WriteString(fmt.Sprintf("![%s](%s)\n\n", alt, src))
		}
	case "ul", "ol":
		ensureBlankLine(b)
		idx := 1
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			if c.Type == html.ElementNode && strings.EqualFold(c.Data, "li") {
				prefix := strings.Repeat("  ", listDepth) + "- "
				if tag == "ol" {
					prefix = fmt.Sprintf("%s%d. ", strings.Repeat("  ", listDepth), idx)
					idx++
				}
				b.WriteString(prefix)
				renderChildren(c, b, listDepth+1, false)
				b.WriteByte('\n')
			}
		}
		b.WriteByte('\n')
	case "figcaption":
		ensureBlankLine(b)
		b.WriteByte('*')
		renderChildren(n, b, listDepth, false)
		b.WriteString("*\n\n")
	case "tr":
		var cells []string
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			if c.Type == html.ElementNode && (strings.EqualFold(c.Data, "td") || strings.EqualFold(c.Data, "th")) {
				var cellBuf strings.Builder
				renderChildren(c, &cellBuf, listDepth, false)
				cells = append(cells, strings.TrimSpace(cellBuf.String()))
			}
		}
		if len(cells) > 0 {
			b.WriteString("| " + strings.Join(cells, " | ") + " |\n")
		}
	default:
		renderChildren(n, b, listDepth, inPre)
	}
}

func renderChildren(n *html.Node, b *strings.Builder, listDepth int, inPre bool) {
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		renderMarkdownNode(c, b, listDepth, inPre)
	}
}

func collectPreText(n *html.Node, b *strings.Builder) {
	if n.Type == html.TextNode {
		b.WriteString(n.Data)
		return
	}
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		collectPreText(c, b)
	}
}

func ensureBlankLine(b *strings.Builder) {
	s := b.String()
	if s == "" || strings.HasSuffix(s, "\n\n") {
		return
	}
	if strings.HasSuffix(s, "\n") {
		b.WriteByte('\n')
		return
	}
	b.WriteString("\n\n")
}

func yamlQuote(s string) string {
	escaped := strings.ReplaceAll(s, `\`, `\\`)
	escaped = strings.ReplaceAll(escaped, `"`, `\"`)
	escaped = strings.ReplaceAll(escaped, "\n", " ")
	return `"` + escaped + `"`
}
