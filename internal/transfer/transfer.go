package transfer

import (
	"bytes"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"strconv"
	"strings"
	"time"

	"github.com/linktive/linktive/internal/domain"
	xhtml "golang.org/x/net/html"
)

var ErrUnsupportedFormat = errors.New("unsupported import/export format")

// ImportedCollection describes a collection extracted from an import file.
type ImportedCollection struct {
	Path        []string `json:"path"`
	Description string   `json:"description"`
	Icon        string   `json:"icon"`
	Color       string   `json:"color"`
}

// ImportedBookmark describes a bookmark extracted from an import file.
type ImportedBookmark struct {
	URL            string   `json:"url"`
	Title          string   `json:"title"`
	Description    string   `json:"description"`
	Note           string   `json:"note"`
	CollectionPath []string `json:"collection_path"`
	Tags           []string `json:"tags"`
	IsFavorite     bool     `json:"is_favorite"`
}

// ImportBundle holds normalized collections and bookmarks ready to persist.
type ImportBundle struct {
	Collections []ImportedCollection
	Bookmarks   []ImportedBookmark
}

type linktiveExportDoc struct {
	Service     string                    `json:"service"`
	Version     int                       `json:"version"`
	ExportedAt  string                    `json:"exported_at"`
	Collections []linktiveExportCollection `json:"collections"`
	Bookmarks   []linktiveExportBookmark   `json:"bookmarks"`
}

type linktiveExportCollection struct {
	ID          string  `json:"id"`
	ParentID    *string `json:"parent_id,omitempty"`
	Name        string  `json:"name"`
	Description string  `json:"description"`
	Icon        string  `json:"icon"`
	Color       string  `json:"color"`
}

type linktiveExportBookmark struct {
	URL            string   `json:"url"`
	Title          string   `json:"title"`
	Description    string   `json:"description"`
	Note           string   `json:"note"`
	CollectionPath []string `json:"collection_path,omitempty"`
	Tags           []string `json:"tags"`
	IsFavorite     bool     `json:"is_favorite"`
	CreatedAt      string   `json:"created_at"`
}

// ExportJSON serializes workspace collections and bookmarks into lossless linktive JSON.
func ExportJSON(collections []domain.Collection, bookmarks []domain.Bookmark) ([]byte, error) {
	pathByColID := buildCollectionPathMap(collections)

	doc := linktiveExportDoc{
		Service:     "linktive",
		Version:     1,
		ExportedAt:  time.Now().UTC().Format(time.RFC3339),
		Collections: make([]linktiveExportCollection, 0, len(collections)),
		Bookmarks:   make([]linktiveExportBookmark, 0, len(bookmarks)),
	}
	for _, c := range collections {
		doc.Collections = append(doc.Collections, linktiveExportCollection{
			ID:          c.ID,
			ParentID:    c.ParentID,
			Name:        c.Name,
			Description: c.Description,
			Icon:        c.Icon,
			Color:       c.Color,
		})
	}
	for _, b := range bookmarks {
		var colPath []string
		if b.CollectionID != nil {
			colPath = pathByColID[*b.CollectionID]
		}
		doc.Bookmarks = append(doc.Bookmarks, linktiveExportBookmark{
			URL:            b.URL,
			Title:          b.Title,
			Description:    b.Description,
			Note:           b.Note,
			CollectionPath: colPath,
			Tags:           b.Tags,
			IsFavorite:     b.IsFavorite,
			CreatedAt:      b.CreatedAt.UTC().Format(time.RFC3339),
		})
	}
	return json.MarshalIndent(doc, "", "  ")
}

// ExportHTML writes bookmarks in standard Netscape-Bookmark-file-1 HTML format.
func ExportHTML(collections []domain.Collection, bookmarks []domain.Bookmark) ([]byte, error) {
	var buf bytes.Buffer
	buf.WriteString("<!DOCTYPE NETSCAPE-Bookmark-file-1>\n")
	buf.WriteString("<META HTTP-EQUIV=\"Content-Type\" CONTENT=\"text/html; charset=UTF-8\">\n")
	buf.WriteString("<TITLE>linktive Bookmarks</TITLE>\n")
	buf.WriteString("<H1>linktive Bookmarks</H1>\n<DL><p>\n")

	childrenByParent := make(map[string][]domain.Collection)
	for _, c := range collections {
		p := ""
		if c.ParentID != nil {
			p = *c.ParentID
		}
		childrenByParent[p] = append(childrenByParent[p], c)
	}

	bmsByCol := make(map[string][]domain.Bookmark)
	for _, b := range bookmarks {
		cid := ""
		if b.CollectionID != nil {
			cid = *b.CollectionID
		}
		bmsByCol[cid] = append(bmsByCol[cid], b)
	}

	var writeBookmark func(b domain.Bookmark, indent string)
	writeBookmark = func(b domain.Bookmark, indent string) {
		tagsAttr := ""
		if len(b.Tags) > 0 {
			tagsAttr = fmt.Sprintf(` TAGS="%s"`, html.EscapeString(strings.Join(b.Tags, ",")))
		}
		buf.WriteString(fmt.Sprintf(`%s<DT><A HREF="%s" ADD_DATE="%d"%s>%s</A>`+"\n",
			indent,
			html.EscapeString(b.URL),
			b.CreatedAt.Unix(),
			tagsAttr,
			html.EscapeString(b.Title),
		))
		desc := strings.TrimSpace(b.Description)
		if b.Note != "" {
			if desc != "" {
				desc += " — " + b.Note
			} else {
				desc = b.Note
			}
		}
		if desc != "" {
			buf.WriteString(fmt.Sprintf("%s<DD>%s\n", indent, html.EscapeString(desc)))
		}
	}

	var writeFolder func(parentID, indent string)
	writeFolder = func(parentID, indent string) {
		for _, c := range childrenByParent[parentID] {
			buf.WriteString(fmt.Sprintf("%s<DT><H3>%s</H3>\n%s<DL><p>\n", indent, html.EscapeString(c.Name), indent))
			for _, b := range bmsByCol[c.ID] {
				writeBookmark(b, indent+"    ")
			}
			writeFolder(c.ID, indent+"    ")
			buf.WriteString(fmt.Sprintf("%s</DL><p>\n", indent))
		}
	}

	writeFolder("", "    ")
	for _, b := range bmsByCol[""] {
		writeBookmark(b, "    ")
	}
	buf.WriteString("</DL><p>\n")
	return buf.Bytes(), nil
}

// ExportCSV serializes bookmarks in Raindrop-friendly CSV with UTF-8 BOM for Excel compatibility.
func ExportCSV(collections []domain.Collection, bookmarks []domain.Bookmark) ([]byte, error) {
	pathByColID := buildCollectionPathMap(collections)
	var buf bytes.Buffer
	buf.Write([]byte{0xEF, 0xBB, 0xBF})

	w := csv.NewWriter(&buf)
	_ = w.Write([]string{"title", "url", "description", "note", "folder", "tags", "favorite", "created_at"})
	for _, b := range bookmarks {
		folder := ""
		if b.CollectionID != nil {
			folder = strings.Join(pathByColID[*b.CollectionID], " / ")
		}
		fav := "false"
		if b.IsFavorite {
			fav = "true"
		}
		_ = w.Write([]string{
			b.Title,
			b.URL,
			b.Description,
			b.Note,
			folder,
			strings.Join(b.Tags, ", "),
			fav,
			b.CreatedAt.UTC().Format(time.RFC3339),
		})
	}
	w.Flush()
	return buf.Bytes(), w.Error()
}

// ParseImport detects or parses linktive JSON, Karakeep JSON, Linkwarden JSON, Raindrop CSV, or Netscape HTML.
func ParseImport(format string, data []byte) (ImportBundle, string, error) {
	trimmed := bytes.TrimSpace(bytes.TrimPrefix(data, []byte{0xEF, 0xBB, 0xBF}))
	if len(trimmed) == 0 {
		return ImportBundle{}, "", errors.New("empty import file")
	}

	f := strings.ToLower(strings.TrimSpace(format))
	if f == "" || f == "auto" {
		f = detectFormat(trimmed)
	}

	var (
		bundle ImportBundle
		err    error
	)
	switch f {
	case "linktive_json":
		bundle, err = parseLinktiveJSON(trimmed)
	case "karakeep_json":
		bundle, err = parseKarakeepJSON(trimmed)
	case "linkwarden_json":
		bundle, err = parseLinkwardenJSON(trimmed)
	case "html":
		bundle, err = parseHTMLBookmarks(trimmed)
	case "raindrop_csv", "csv":
		f = "raindrop_csv"
		bundle, err = parseCSV(trimmed)
	default:
		return ImportBundle{}, "", ErrUnsupportedFormat
	}
	return bundle, f, err
}

func detectFormat(trimmed []byte) string {
	lowerPrefix := strings.ToLower(string(trimmed[:min(len(trimmed), 256)]))
	if strings.HasPrefix(lowerPrefix, "<") || strings.Contains(lowerPrefix, "netscape-bookmark-file") {
		return "html"
	}
	if strings.HasPrefix(lowerPrefix, "{") || strings.HasPrefix(lowerPrefix, "[") {
		var probe map[string]json.RawMessage
		if json.Unmarshal(trimmed, &probe) == nil {
			if svcRaw, ok := probe["service"]; ok && strings.Contains(string(svcRaw), "linktive") {
				return "linktive_json"
			}
			if bmsRaw, ok := probe["bookmarks"]; ok {
				if bytes.Contains(bmsRaw, []byte(`"content"`)) {
					return "karakeep_json"
				}
				return "linktive_json"
			}
			if _, ok := probe["links"]; ok {
				return "linkwarden_json"
			}
			if _, ok := probe["collections"]; ok {
				return "linkwarden_json"
			}
		}
		if bytes.Contains(trimmed[:min(len(trimmed), 1024)], []byte(`"content"`)) {
			return "karakeep_json"
		}
		return "linkwarden_json"
	}
	return "raindrop_csv"
}

func parseLinktiveJSON(data []byte) (ImportBundle, error) {
	var doc linktiveExportDoc
	if err := json.Unmarshal(data, &doc); err != nil {
		return ImportBundle{}, err
	}

	colByID := make(map[string]linktiveExportCollection, len(doc.Collections))
	for _, c := range doc.Collections {
		colByID[c.ID] = c
	}

	var resolvePath func(id string, depth int) []string
	resolvePath = func(id string, depth int) []string {
		if depth > 32 {
			return nil
		}
		c, ok := colByID[id]
		if !ok {
			return nil
		}
		if c.ParentID != nil && *c.ParentID != "" {
			return append(resolvePath(*c.ParentID, depth+1), c.Name)
		}
		return []string{c.Name}
	}

	var bundle ImportBundle
	for _, c := range doc.Collections {
		if strings.TrimSpace(c.Name) == "" {
			continue
		}
		bundle.Collections = append(bundle.Collections, ImportedCollection{
			Path:        resolvePath(c.ID, 0),
			Description: c.Description,
			Icon:        c.Icon,
			Color:       c.Color,
		})
	}
	for _, b := range doc.Bookmarks {
		if strings.TrimSpace(b.URL) == "" {
			continue
		}
		bundle.Bookmarks = append(bundle.Bookmarks, ImportedBookmark{
			URL:            b.URL,
			Title:          b.Title,
			Description:    b.Description,
			Note:           b.Note,
			CollectionPath: b.CollectionPath,
			Tags:           b.Tags,
			IsFavorite:     b.IsFavorite,
		})
	}
	return bundle, nil
}

func parseKarakeepJSON(data []byte) (ImportBundle, error) {
	type rawTag struct {
		Name string `json:"name"`
	}
	type rawContent struct {
		URL         string `json:"url"`
		Title       string `json:"title"`
		Description string `json:"description"`
	}
	type rawBookmark struct {
		Title      string          `json:"title"`
		Note       string          `json:"note"`
		Favourited bool            `json:"favourited"`
		URL        string          `json:"url"`
		Content    *rawContent     `json:"content"`
		Tags       json.RawMessage `json:"tags"`
	}

	var items []rawBookmark
	var wrapper struct {
		Bookmarks []rawBookmark `json:"bookmarks"`
	}
	if err := json.Unmarshal(data, &wrapper); err == nil && len(wrapper.Bookmarks) > 0 {
		items = wrapper.Bookmarks
	} else if err := json.Unmarshal(data, &items); err != nil {
		return ImportBundle{}, err
	}

	var bundle ImportBundle
	for _, item := range items {
		u := strings.TrimSpace(item.URL)
		title := strings.TrimSpace(item.Title)
		desc := ""
		if item.Content != nil {
			if u == "" {
				u = strings.TrimSpace(item.Content.URL)
			}
			if title == "" {
				title = strings.TrimSpace(item.Content.Title)
			}
			desc = strings.TrimSpace(item.Content.Description)
		}
		if u == "" {
			continue
		}

		var tags []string
		var objTags []rawTag
		if json.Unmarshal(item.Tags, &objTags) == nil && len(objTags) > 0 {
			for _, t := range objTags {
				if t.Name != "" {
					tags = append(tags, t.Name)
				}
			}
		} else {
			var strTags []string
			if json.Unmarshal(item.Tags, &strTags) == nil {
				tags = strTags
			}
		}

		bundle.Bookmarks = append(bundle.Bookmarks, ImportedBookmark{
			URL:         u,
			Title:       title,
			Description: desc,
			Note:        strings.TrimSpace(item.Note),
			Tags:        tags,
			IsFavorite:  item.Favourited,
		})
	}
	return bundle, nil
}

func parseLinkwardenJSON(data []byte) (ImportBundle, error) {
	type lwTag struct {
		Name string `json:"name"`
	}
	type lwLink struct {
		Name         string          `json:"name"`
		Title        string          `json:"title"`
		URL          string          `json:"url"`
		Description  string          `json:"description"`
		Note         string          `json:"note"`
		CollectionID any             `json:"collectionId"`
		Collection   *struct {
			Name string `json:"name"`
		} `json:"collection"`
		Tags json.RawMessage `json:"tags"`
	}
	type lwCollection struct {
		ID          any      `json:"id"`
		Name        string   `json:"name"`
		Description string   `json:"description"`
		Links       []lwLink `json:"links"`
	}

	var doc struct {
		Collections []lwCollection `json:"collections"`
		Links       []lwLink       `json:"links"`
	}
	var flatLinks []lwLink
	if err := json.Unmarshal(data, &doc); err != nil {
		if err2 := json.Unmarshal(data, &flatLinks); err2 != nil {
			return ImportBundle{}, err
		}
		doc.Links = flatLinks
	}

	colNames := make(map[string]string)
	var bundle ImportBundle

	extractTags := func(raw json.RawMessage) []string {
		var obj []lwTag
		if json.Unmarshal(raw, &obj) == nil && len(obj) > 0 {
			out := make([]string, 0, len(obj))
			for _, t := range obj {
				if t.Name != "" {
					out = append(out, t.Name)
				}
			}
			return out
		}
		var strs []string
		_ = json.Unmarshal(raw, &strs)
		return strs
	}

	addLink := func(l lwLink, defaultCol string) {
		u := strings.TrimSpace(l.URL)
		if u == "" {
			return
		}
		title := strings.TrimSpace(l.Name)
		if title == "" {
			title = strings.TrimSpace(l.Title)
		}
		colName := defaultCol
		if colName == "" && l.Collection != nil {
			colName = strings.TrimSpace(l.Collection.Name)
		}
		if colName == "" && l.CollectionID != nil {
			colName = colNames[fmt.Sprint(l.CollectionID)]
		}
		var colPath []string
		if colName != "" {
			colPath = []string{colName}
		}
		bundle.Bookmarks = append(bundle.Bookmarks, ImportedBookmark{
			URL:            u,
			Title:          title,
			Description:    strings.TrimSpace(l.Description),
			Note:           strings.TrimSpace(l.Note),
			CollectionPath: colPath,
			Tags:           extractTags(l.Tags),
		})
	}

	for _, c := range doc.Collections {
		name := strings.TrimSpace(c.Name)
		if name != "" {
			colNames[fmt.Sprint(c.ID)] = name
			bundle.Collections = append(bundle.Collections, ImportedCollection{
				Path:        []string{name},
				Description: strings.TrimSpace(c.Description),
			})
		}
		for _, l := range c.Links {
			addLink(l, name)
		}
	}
	for _, l := range doc.Links {
		addLink(l, "")
	}
	return bundle, nil
}

func parseCSV(data []byte) (ImportBundle, error) {
	r := csv.NewReader(bytes.NewReader(data))
	r.FieldsPerRecord = -1
	rows, err := r.ReadAll()
	if err != nil {
		return ImportBundle{}, err
	}
	if len(rows) < 2 {
		return ImportBundle{}, nil
	}

	header := make(map[string]int, len(rows[0]))
	for i, col := range rows[0] {
		header[strings.ToLower(strings.TrimSpace(col))] = i
	}
	colVal := func(row []string, names ...string) string {
		for _, name := range names {
			if idx, ok := header[name]; ok && idx < len(row) {
				return strings.TrimSpace(row[idx])
			}
		}
		return ""
	}

	var bundle ImportBundle
	seenPaths := make(map[string]struct{})
	for _, row := range rows[1:] {
		u := colVal(row, "url", "link", "href")
		if u == "" {
			continue
		}
		folderRaw := colVal(row, "folder", "collection")
		var colPath []string
		if folderRaw != "" {
			for _, part := range strings.Split(folderRaw, "/") {
				if p := strings.TrimSpace(part); p != "" {
					colPath = append(colPath, p)
				}
			}
			if len(colPath) > 0 {
				key := strings.Join(colPath, "/")
				if _, ok := seenPaths[key]; !ok {
					seenPaths[key] = struct{}{}
					bundle.Collections = append(bundle.Collections, ImportedCollection{Path: colPath})
				}
			}
		}

		var tags []string
		for _, t := range strings.Split(colVal(row, "tags"), ",") {
			if clean := strings.TrimSpace(t); clean != "" {
				tags = append(tags, clean)
			}
		}

		favRaw := strings.ToLower(colVal(row, "favorite", "is_favorite", "starred"))
		isFav := favRaw == "true" || favRaw == "1" || favRaw == "yes"

		bundle.Bookmarks = append(bundle.Bookmarks, ImportedBookmark{
			URL:            u,
			Title:          colVal(row, "title", "name"),
			Description:    colVal(row, "description", "excerpt"),
			Note:           colVal(row, "note", "notes"),
			CollectionPath: colPath,
			Tags:           tags,
			IsFavorite:     isFav,
		})
	}
	return bundle, nil
}

func parseHTMLBookmarks(data []byte) (ImportBundle, error) {
	z := xhtml.NewTokenizer(bytes.NewReader(data))
	var (
		bundle        ImportBundle
		folderStack   []string
		pendingFolder string
		inH3          bool
		inA           bool
		inDD          bool
		curLink       *ImportedBookmark
		textBuf       strings.Builder
	)

	seenFolders := make(map[string]struct{})

	flushDD := func() {
		if inDD && curLink != nil {
			desc := strings.TrimSpace(textBuf.String())
			if desc != "" && curLink.Description == "" {
				curLink.Description = desc
			}
			inDD = false
			textBuf.Reset()
		}
	}

	for {
		tt := z.Next()
		switch tt {
		case xhtml.ErrorToken:
			flushDD()
			if curLink != nil && curLink.URL != "" {
				bundle.Bookmarks = append(bundle.Bookmarks, *curLink)
			}
			if errors.Is(z.Err(), io.EOF) {
				return bundle, nil
			}
			return ImportBundle{}, z.Err()
		case xhtml.StartTagToken:
			tok := z.Token()
			name := strings.ToLower(tok.Data)
			switch name {
			case "h3":
				flushDD()
				inH3 = true
				textBuf.Reset()
			case "dl":
				flushDD()
				if pendingFolder != "" {
					folderStack = append(folderStack, pendingFolder)
					pendingFolder = ""
					key := strings.Join(folderStack, "/")
					if _, ok := seenFolders[key]; !ok {
						seenFolders[key] = struct{}{}
						pathCopy := append([]string(nil), folderStack...)
						bundle.Collections = append(bundle.Collections, ImportedCollection{Path: pathCopy})
					}
				}
			case "a":
				flushDD()
				if curLink != nil && curLink.URL != "" {
					bundle.Bookmarks = append(bundle.Bookmarks, *curLink)
				}
				var href string
				var tags []string
				for _, attr := range tok.Attr {
					k := strings.ToLower(attr.Key)
					if k == "href" {
						href = strings.TrimSpace(attr.Val)
					} else if k == "tags" {
						for _, t := range strings.Split(attr.Val, ",") {
							if clean := strings.TrimSpace(t); clean != "" {
								tags = append(tags, clean)
							}
						}
					}
				}
				pathCopy := append([]string(nil), folderStack...)
				curLink = &ImportedBookmark{
					URL:            href,
					CollectionPath: pathCopy,
					Tags:           tags,
				}
				inA = true
				textBuf.Reset()
			case "dd":
				inDD = true
				textBuf.Reset()
			case "dt":
				flushDD()
			}
		case xhtml.EndTagToken:
			name := strings.ToLower(z.Token().Data)
			switch name {
			case "h3":
				if inH3 {
					pendingFolder = strings.TrimSpace(textBuf.String())
					inH3 = false
					textBuf.Reset()
				}
			case "a":
				if inA && curLink != nil {
					curLink.Title = strings.TrimSpace(textBuf.String())
					inA = false
					textBuf.Reset()
				}
			case "dl":
				flushDD()
				if len(folderStack) > 0 {
					folderStack = folderStack[:len(folderStack)-1]
				}
			}
		case xhtml.TextToken:
			if inH3 || inA || inDD {
				textBuf.WriteString(z.Token().Data)
			}
		}
	}
}

func buildCollectionPathMap(collections []domain.Collection) map[string][]string {
	byID := make(map[string]domain.Collection, len(collections))
	for _, c := range collections {
		byID[c.ID] = c
	}
	var resolve func(id string, depth int) []string
	resolve = func(id string, depth int) []string {
		if depth > 32 {
			return nil
		}
		c, ok := byID[id]
		if !ok {
			return nil
		}
		if c.ParentID != nil && *c.ParentID != "" {
			return append(resolve(*c.ParentID, depth+1), c.Name)
		}
		return []string{c.Name}
	}
	out := make(map[string][]string, len(collections))
	for _, c := range collections {
		out[c.ID] = resolve(c.ID, 0)
	}
	return out
}

// ParseBoolQuery helper for HTTP handlers.
func ParseBoolDefault(raw string, fallback bool) bool {
	if raw == "" {
		return fallback
	}
	v, err := strconv.ParseBool(raw)
	if err != nil {
		return fallback
	}
	return v
}
