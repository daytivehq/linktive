package urlutil

import (
	"errors"
	"net"
	"net/http"
	"net/netip"
	"os"
	"strconv"
	"syscall"
	"time"
)

var restrictedTransport = func() *http.Transport {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	// Connect directly so the address checked here is the actual destination,
	// including after DNS resolution and redirects.
	transport.Proxy = nil
	dialer := &net.Dialer{Timeout: 5 * time.Second, KeepAlive: 30 * time.Second, Control: func(_, address string, _ syscall.RawConn) error {
		endpoint, err := netip.ParseAddrPort(address)
		if err != nil || !publicAddress(endpoint.Addr()) {
			return errors.New("non-public destination blocked")
		}
		return nil
	}}
	transport.DialContext = dialer.DialContext
	return transport
}()

var specialNetworks = []netip.Prefix{
	netip.MustParsePrefix("0.0.0.0/8"), netip.MustParsePrefix("100.64.0.0/10"),
	netip.MustParsePrefix("192.0.0.0/24"), netip.MustParsePrefix("192.0.2.0/24"), netip.MustParsePrefix("192.88.99.0/24"),
	netip.MustParsePrefix("198.18.0.0/15"), netip.MustParsePrefix("198.51.100.0/24"), netip.MustParsePrefix("203.0.113.0/24"),
	netip.MustParsePrefix("240.0.0.0/4"), netip.MustParsePrefix("2001::/23"),
	netip.MustParsePrefix("2001:db8::/32"), netip.MustParsePrefix("2002::/16"),
}

func publicAddress(addr netip.Addr) bool {
	addr = addr.Unmap()
	if !addr.IsGlobalUnicast() || addr.IsPrivate() || addr.Zone() != "" {
		return false
	}
	if addr.Is6() && !netip.MustParsePrefix("2000::/3").Contains(addr) {
		return false
	}
	for _, block := range specialNetworks {
		if block.Contains(addr) {
			return false
		}
	}
	return true
}

func FetchClient(timeout time.Duration) *http.Client {
	client := &http.Client{Transport: restrictedTransport, Timeout: timeout, CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) >= 10 {
			return errors.New("too many redirects")
		}
		req.Header.Del("Referer")
		return nil
	}}
	if allowed, _ := strconv.ParseBool(os.Getenv("LINKTIVE_ALLOW_PRIVATE_NETWORKS")); allowed {
		client.Transport = http.DefaultTransport
	}
	return client
}
