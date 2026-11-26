package urlutil

import (
	"net/netip"
	"testing"
)

func TestPublicAddress(t *testing.T) {
	for _, address := range []string{"127.0.0.1", "10.1.2.3", "169.254.1.1", "::ffff:192.168.1.1", "::1", "100.64.0.1", "64:ff9b::1"} {
		if publicAddress(netip.MustParseAddr(address)) {
			t.Errorf("non-public address accepted: %s", address)
		}
	}
	if !publicAddress(netip.MustParseAddr("1.1.1.1")) {
		t.Error("public address rejected")
	}
}
