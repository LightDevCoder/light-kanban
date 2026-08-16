package main

import "testing"

// The SPEC (v1.0.3, Fix 1) makes the listen-address default a contract:
// the board must bind loopback-only by default, while an explicit -addr
// still allows LAN access. These tests pin that contract and the
// startup-URL derivation.

func TestDefaultAddrIsLoopback(t *testing.T) {
	if defaultAddr != "127.0.0.1:8641" {
		t.Fatalf("default listen address must be loopback-only, got %q", defaultAddr)
	}
}

func TestBrowserURL(t *testing.T) {
	cases := []struct {
		addr string
		want string
	}{
		{":8641", "http://localhost:8641"},          // explicit LAN: any interface
		{"127.0.0.1:8641", "http://127.0.0.1:8641"}, // loopback default
		{"0.0.0.0:8641", "http://localhost:8641"},   // bind all interfaces, open on this machine
		{"localhost:8641", "http://localhost:8641"},
	}
	for _, c := range cases {
		if got := browserURL(c.addr); got != c.want {
			t.Errorf("browserURL(%q) = %q, want %q", c.addr, got, c.want)
		}
	}
}
