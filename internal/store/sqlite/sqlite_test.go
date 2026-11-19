package sqlite

import (
	"context"
	"errors"
	"testing"

	"github.com/linktive/linktive/internal/domain"
	"github.com/linktive/linktive/internal/search"
	"github.com/linktive/linktive/internal/store"
)

func TestCollectionsBookmarksAndKoreanHybridSearch(t *testing.T) {
	ctx := context.Background()
	st, err := Open(ctx, ":memory:")
	if err != nil {
		t.Fatalf("Open(:memory:) failed: %v", err)
	}
	defer func() { _ = st.Close() }()

	user, ws, err := st.CreateUserWithPersonalWorkspace(ctx, "user@example.com", "테스터", "hash")
	if err != nil {
		t.Fatalf("CreateUserWithPersonalWorkspace failed: %v", err)
	}

	// Create parent + child collections and verify cycle prevention.
	rootCol, err := st.CreateCollection(ctx, store.CreateCollectionInput{
		WorkspaceID: ws.ID,
		Name:        "회계",
		Description: "세무 및 정산 사이트",
		Icon:        "receipt",
		Color:       "#0ea5e9",
	})
	if err != nil {
		t.Fatalf("CreateCollection root failed: %v", err)
	}
	childCol, err := st.CreateCollection(ctx, store.CreateCollectionInput{
		WorkspaceID: ws.ID,
		ParentID:    &rootCol.ID,
		Name:        "증빙서류",
	})
	if err != nil {
		t.Fatalf("CreateCollection child failed: %v", err)
	}
	if _, err := st.UpdateCollection(ctx, store.UpdateCollectionInput{
		WorkspaceID: ws.ID,
		ID:          rootCol.ID,
		ParentID:    &childCol.ID,
		SetParent:   true,
	}); !errors.Is(err, store.ErrInvalidParent) {
		t.Fatalf("expected ErrInvalidParent on cycle, got %v", err)
	}

	// Create bookmarks.
	bm1, err := st.CreateBookmark(ctx, store.CreateBookmarkInput{
		WorkspaceID:   ws.ID,
		CollectionID:  &rootCol.ID,
		CreatedBy:     user.ID,
		URL:           "https://example.com/invoice",
		NormalizedURL: "https://example.com/invoice",
		Domain:        "example.com",
		Title:         "거래명세서 자동 발행 사이트",
		Description:   "우리 집 사업자 정산용",
		Note:          "매월 말일 확인",
		Tags:          []string{"세금", "회계"},
		IsFavorite:    true,
	})
	if err != nil {
		t.Fatalf("CreateBookmark bm1 failed: %v", err)
	}

	// Duplicate URL check.
	if _, err := st.CreateBookmark(ctx, store.CreateBookmarkInput{
		WorkspaceID:   ws.ID,
		CreatedBy:     user.ID,
		URL:           "https://example.com/invoice",
		NormalizedURL: "https://example.com/invoice",
		Domain:        "example.com",
		Title:         "중복",
	}); !errors.Is(err, store.ErrDuplicateURL) {
		t.Fatalf("expected ErrDuplicateURL, got %v", err)
	}

	_, err = st.CreateBookmark(ctx, store.CreateBookmarkInput{
		WorkspaceID:   ws.ID,
		CollectionID:  &childCol.ID,
		CreatedBy:     user.ID,
		URL:           "https://docs.example.org/spacing",
		NormalizedURL: "https://docs.example.org/spacing",
		Domain:        "docs.example.org",
		Title:         "거래 명세서 관리 도구",
		Description:   "임시 보관",
		Tags:          []string{"임시", "세금"},
	})
	if err != nil {
		t.Fatalf("CreateBookmark bm2 failed: %v", err)
	}

	cases := []struct {
		name      string
		raw       string
		wantCount int
		wantFirst string
	}{
		{name: "3+ char Korean middle substring", raw: "래명세", wantCount: 2},
		{name: "spacing ignored query", raw: "거래명세", wantCount: 2},
		{name: "2-char Korean term", raw: "세금", wantCount: 2},
		{name: "1-char Korean term", raw: "집", wantCount: 1, wantFirst: bm1.ID},
		{name: "Korean chosung search", raw: "ㄱㄹㅁㅅ", wantCount: 2},
		{name: "Multi-word AND", raw: "거래 말일", wantCount: 1, wantFirst: bm1.ID},
		{name: "Exclude tag operator", raw: "tag:세금 -tag:임시", wantCount: 1, wantFirst: bm1.ID},
		{name: "Site and collection operators", raw: "site:example.com in:회계 is:favorite", wantCount: 1, wantFirst: bm1.ID},
	}

	// Verify include_subcollections returns bookmarks in both rootCol and childCol.
	subRes, err := st.SearchBookmarks(ctx, store.SearchQuery{
		WorkspaceID:           ws.ID,
		CollectionID:          &rootCol.ID,
		IncludeSubcollections: true,
	})
	if err != nil || subRes.Total != 2 {
		t.Fatalf("expected 2 bookmarks with IncludeSubcollections=true, got total=%d err=%v", subRes.Total, err)
	}
	directRes, err := st.SearchBookmarks(ctx, store.SearchQuery{
		WorkspaceID:           ws.ID,
		CollectionID:          &rootCol.ID,
		IncludeSubcollections: false,
	})
	if err != nil || directRes.Total != 1 {
		t.Fatalf("expected 1 bookmark with IncludeSubcollections=false, got total=%d err=%v", directRes.Total, err)
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			sq := search.ParseQuery(ws.ID, tc.raw)
			res, err := st.SearchBookmarks(ctx, sq)
			if err != nil {
				t.Fatalf("SearchBookmarks(%q) failed: %v", tc.raw, err)
			}
			if res.Total != tc.wantCount || len(res.Items) != tc.wantCount {
				t.Fatalf("query %q: expected %d results, got total=%d len=%d", tc.raw, tc.wantCount, res.Total, len(res.Items))
			}
			if tc.wantFirst != "" && res.Items[0].ID != tc.wantFirst {
				t.Fatalf("query %q: expected first %s, got %s", tc.raw, tc.wantFirst, res.Items[0].ID)
			}
		})
	}

	// Verify shared workspace creation and member invitation.
	user2, _, err := st.CreateUserWithPersonalWorkspace(ctx, "family@example.com", "가족", "hash2")
	if err != nil {
		t.Fatalf("CreateUserWithPersonalWorkspace user2 failed: %v", err)
	}
	sharedWS, err := st.CreateSharedWorkspace(ctx, user.ID, "가족 공유")
	if err != nil {
		t.Fatalf("CreateSharedWorkspace failed: %v", err)
	}
	member, err := st.AddWorkspaceMemberByEmail(ctx, sharedWS.ID, user2.Email, domain.RoleEditor)
	if err != nil {
		t.Fatalf("AddWorkspaceMemberByEmail failed: %v", err)
	}
	if member.Role != domain.RoleEditor {
		t.Fatalf("expected editor role, got %s", member.Role)
	}
}
