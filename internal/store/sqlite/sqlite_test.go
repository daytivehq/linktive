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

func TestArchiveRecoveryAndAccountRemoval(t *testing.T) {
	ctx := context.Background()
	for _, scope := range []string{"owner_only", "shared_members"} {
		t.Run(scope, func(t *testing.T) {
			st, err := Open(ctx, ":memory:")
			if err != nil {
				t.Fatal(err)
			}
			defer st.Close()
			_, ws, err := st.CreateUserWithPersonalWorkspace(ctx, "owner@example.invalid", "owner", "hash")
			if err != nil {
				t.Fatal(err)
			}
			member, _, err := st.CreateUserWithPersonalWorkspace(ctx, "member@example.invalid", "member", "hash")
			if err != nil {
				t.Fatal(err)
			}
			if _, err := st.UpdateUserSettings(ctx, member.ID, `{"archive_share_scope":"`+scope+`"}`); err != nil {
				t.Fatal(err)
			}
			bm, err := st.CreateBookmark(ctx, store.CreateBookmarkInput{WorkspaceID: ws.ID, CreatedBy: member.ID, URL: "https://example.invalid/qa", NormalizedURL: "https://example.invalid/qa"})
			if err != nil {
				t.Fatal(err)
			}
			ar := domain.BookmarkArchive{WorkspaceID: ws.ID, BookmarkID: bm.ID, CreatedBy: member.ID, Status: "pending"}
			if err := st.UpsertBookmarkArchive(ctx, ar); err != nil {
				t.Fatal(err)
			}
			if err := st.RecoverInterruptedClips(ctx); err != nil {
				t.Fatal(err)
			}
			recovered, err := st.GetBookmarkArchive(ctx, ws.ID, bm.ID)
			if err != nil || recovered.Status != "failed" {
				t.Fatal("interrupted clip stayed pending")
			}
			ar.Status = "ready"
			ar.ContentText = "distinctive sample"
			if err := st.UpsertBookmarkArchive(ctx, ar); err != nil {
				t.Fatal(err)
			}
			if err := st.DeleteUser(ctx, member.ID); err != nil {
				t.Fatal(err)
			}
			after, err := st.GetBookmarkArchive(ctx, ws.ID, bm.ID)
			if scope == "shared_members" {
				if err != nil || after.CreatedBy != "" || after.ContentText != ar.ContentText {
					t.Fatal("shared archive inaccessible")
				}
			} else if !errors.Is(err, store.ErrNotFound) {
				t.Fatal("private archive inherited")
			}
			var indexed int
			if err := st.db.QueryRowContext(ctx, "SELECT count(*) FROM bookmark_archives_fts WHERE bookmark_id=?", bm.ID).Scan(&indexed); err != nil {
				t.Fatal(err)
			}
			if (indexed == 1) != (scope == "shared_members") {
				t.Fatal("stale archive index")
			}
		})
	}
}

func TestLegacyArchiveMoveRetriesWithoutLosingSource(t *testing.T) {
	ctx := context.Background()
	st, err := Open(ctx, ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	owner, from, err := st.CreateUserWithPersonalWorkspace(ctx, "owner@example.invalid", "owner", "hash")
	if err != nil {
		t.Fatal(err)
	}
	to, err := st.CreateSharedWorkspace(ctx, owner.ID, "new")
	if err != nil {
		t.Fatal(err)
	}
	bm, err := st.CreateBookmark(ctx, store.CreateBookmarkInput{WorkspaceID: from.ID, CreatedBy: owner.ID, URL: "https://example.invalid"})
	if err != nil {
		t.Fatal(err)
	}
	ar := domain.BookmarkArchive{WorkspaceID: from.ID, BookmarkID: bm.ID, CreatedBy: owner.ID, Status: "ready", ContentText: "preserved article"}
	if err := st.UpsertBookmarkArchive(ctx, ar); err != nil {
		t.Fatal(err)
	}
	if _, err := st.db.ExecContext(ctx, "UPDATE bookmarks SET workspace_id=? WHERE id=?", to.ID, bm.ID); err != nil {
		t.Fatal(err)
	}
	removed := false
	remove := func(ws, id string) {
		if ws != from.ID || id != bm.ID {
			t.Fatal("unexpected cleanup")
		}
		removed = true
	}
	err = st.RepairMovedArchives(ctx, func(string, string, string) error { return errors.New("disk full") }, remove)
	if err == nil || removed {
		t.Fatal("failed copy removed source")
	}
	err = st.RepairMovedArchives(ctx, func(src, dst, id string) error {
		if src != from.ID || dst != to.ID || id != bm.ID {
			t.Fatal("wrong archive")
		}
		return nil
	}, remove)
	if err != nil || !removed {
		t.Fatal("move not completed", err)
	}
	repaired, err := st.GetBookmarkArchive(ctx, to.ID, bm.ID)
	if err != nil || repaired.CreatedBy != owner.ID || repaired.ContentText != ar.ContentText {
		t.Fatal("content or ownership changed", err)
	}
	err = st.RepairMovedArchives(ctx, func(string, string, string) error { t.Fatal("duplicate repair"); return nil }, remove)
	if err != nil {
		t.Fatal(err)
	}
}
