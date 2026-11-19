package transfer

import (
	"testing"
	"time"

	"github.com/linktive/linktive/internal/domain"
)

func TestExportAndImportFormats(t *testing.T) {
	now := time.Now().UTC()
	parentID := "col_1"
	cols := []domain.Collection{
		{ID: "col_1", Name: "개발", Icon: "code", Color: "#0284c7"},
		{ID: "col_2", ParentID: &parentID, Name: "Go", Icon: "terminal", Color: "#0d9488"},
	}
	bms := []domain.Bookmark{
		{
			ID:           "bm_1",
			CollectionID: &cols[1].ID,
			URL:          "https://go.dev/doc/",
			Title:        "Go 문서",
			Description:  "공식 가이드",
			Note:         "자주 확인",
			Tags:         []string{"go", "문서"},
			IsFavorite:   true,
			CreatedAt:    now,
		},
	}

	jsonBytes, err := ExportJSON(cols, bms)
	if err != nil {
		t.Fatalf("ExportJSON failed: %v", err)
	}
	bundle, detected, err := ParseImport("auto", jsonBytes)
	if err != nil || detected != "linktive_json" {
		t.Fatalf("ParseImport linktive_json failed: detected=%q err=%v", detected, err)
	}
	if len(bundle.Collections) != 2 || len(bundle.Bookmarks) != 1 || len(bundle.Bookmarks[0].CollectionPath) != 2 {
		t.Fatalf("unexpected linktive bundle: %+v", bundle)
	}

	htmlBytes, err := ExportHTML(cols, bms)
	if err != nil {
		t.Fatalf("ExportHTML failed: %v", err)
	}
	htmlBundle, detected, err := ParseImport("auto", htmlBytes)
	if err != nil || detected != "html" {
		t.Fatalf("ParseImport html failed: detected=%q err=%v", detected, err)
	}
	if len(htmlBundle.Bookmarks) != 1 || htmlBundle.Bookmarks[0].Title != "Go 문서" {
		t.Fatalf("unexpected html bundle: %+v", htmlBundle)
	}

	csvBytes, err := ExportCSV(cols, bms)
	if err != nil {
		t.Fatalf("ExportCSV failed: %v", err)
	}
	csvBundle, detected, err := ParseImport("auto", csvBytes)
	if err != nil || detected != "raindrop_csv" {
		t.Fatalf("ParseImport csv failed: detected=%q err=%v", detected, err)
	}
	if len(csvBundle.Bookmarks) != 1 || len(csvBundle.Bookmarks[0].CollectionPath) != 2 {
		t.Fatalf("unexpected csv bundle: %+v", csvBundle)
	}

	karakeep := []byte(`{"bookmarks":[{"title":"KK 사이트","note":"메모","favourited":true,"tags":[{"name":"ai"}],"content":{"url":"https://example.com/kk","description":"설명"}}]}`)
	kkBundle, detected, err := ParseImport("auto", karakeep)
	if err != nil || detected != "karakeep_json" || len(kkBundle.Bookmarks) != 1 {
		t.Fatalf("karakeep import failed: detected=%q err=%v bundle=%+v", detected, err, kkBundle)
	}

	linkwarden := []byte(`{"collections":[{"id":1,"name":"LW폴더","links":[{"name":"LW 링크","url":"https://example.com/lw","description":"설명","tags":[{"name":"ref"}]}]}]}`)
	lwBundle, detected, err := ParseImport("auto", linkwarden)
	if err != nil || detected != "linkwarden_json" || len(lwBundle.Bookmarks) != 1 {
		t.Fatalf("linkwarden import failed: detected=%q err=%v bundle=%+v", detected, err, lwBundle)
	}
}
