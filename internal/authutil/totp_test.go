package authutil

import (
	"strings"
	"testing"
	"time"
)

func TestTOTPGenerateAndVerify(t *testing.T) {
	secret, err := GenerateTOTPSecret()
	if err != nil || len(secret) < 16 {
		t.Fatalf("GenerateTOTPSecret failed: secret=%q err=%v", secret, err)
	}

	uri := BuildOTPAuthURL("linktive", "user@example.com", secret)
	if !strings.HasPrefix(uri, "otpauth://totp/") || !strings.Contains(uri, "secret="+secret) {
		t.Fatalf("unexpected otpauth url: %s", uri)
	}

	now := time.Unix(1700000000, 0)
	code, err := GenerateTOTPCode(secret, now)
	if err != nil || len(code) != 6 {
		t.Fatalf("GenerateTOTPCode failed: code=%q err=%v", code, err)
	}
	if !VerifyTOTPCode(secret, code, now) {
		t.Fatalf("expected valid TOTP code")
	}
	if !VerifyTOTPCode(secret, code, now.Add(25*time.Second)) {
		t.Fatalf("expected +/-1 step drift tolerance")
	}
	if VerifyTOTPCode(secret, "000000", now) && code != "000000" {
		t.Fatalf("expected invalid code to fail")
	}
}
