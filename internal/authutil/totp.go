package authutil

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"crypto/subtle"
	"encoding/base32"
	"encoding/binary"
	"fmt"
	"net/url"
	"strings"
	"time"
)

const totpPeriodSeconds = 30

// GenerateTOTPSecret generates a random 20-byte base32-encoded secret without padding.
func GenerateTOTPSecret() (string, error) {
	buf := make([]byte, 20)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(buf), nil
}

// BuildOTPAuthURL builds a standard otpauth:// URI for authenticator apps (1Password, Google Auth, etc.).
func BuildOTPAuthURL(issuer, account, secret string) string {
	label := url.PathEscape(issuer + ":" + account)
	q := url.Values{}
	q.Set("secret", secret)
	q.Set("issuer", issuer)
	q.Set("algorithm", "SHA1")
	q.Set("digits", "6")
	q.Set("period", "30")
	return fmt.Sprintf("otpauth://totp/%s?%s", label, q.Encode())
}

// GenerateTOTPCode computes the 6-digit RFC 6238 TOTP code for secret at time t.
func GenerateTOTPCode(secret string, t time.Time) (string, error) {
	clean := strings.ToUpper(strings.ReplaceAll(strings.TrimSpace(secret), " ", ""))
	key, err := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(clean)
	if err != nil {
		return "", err
	}

	counter := uint64(t.Unix() / totpPeriodSeconds)
	var msg [8]byte
	binary.BigEndian.PutUint64(msg[:], counter)

	mac := hmac.New(sha1.New, key)
	mac.Write(msg[:])
	sum := mac.Sum(nil)

	offset := sum[len(sum)-1] & 0x0f
	codeInt := (uint32(sum[offset])&0x7f)<<24 |
		(uint32(sum[offset+1])&0xff)<<16 |
		(uint32(sum[offset+2])&0xff)<<8 |
		(uint32(sum[offset+3]) & 0xff)

	return fmt.Sprintf("%06d", codeInt%1_000_000), nil
}

// VerifyTOTPCode validates a 6-digit code allowing +/- 1 time step (30s) for clock drift.
func VerifyTOTPCode(secret, code string, now time.Time) bool {
	trimmed := strings.TrimSpace(code)
	if len(trimmed) != 6 {
		return false
	}
	for _, offset := range []int{-1, 0, 1} {
		candidate, err := GenerateTOTPCode(secret, now.Add(time.Duration(offset*totpPeriodSeconds)*time.Second))
		if err != nil {
			return false
		}
		if subtle.ConstantTimeCompare([]byte(candidate), []byte(trimmed)) == 1 {
			return true
		}
	}
	return false
}
