// fm-api is currently a C1 transport probe, not the C2 match API.
package main

import (
	"flag"
	"log"
	"net/http"

	jsonadapter "github.com/resoul/fm-core/internal/adapters/json"
	matchconfig "github.com/resoul/fm-core/internal/match/config"
	websockettransport "github.com/resoul/fm-core/internal/transport/websocket"
)

func main() {
	listen := flag.String("listen", "127.0.0.1:8090", "local address for the C1 smoke WebSocket")
	inputPath := flag.String("input", "fixtures/match/equal.json", "match input JSON")
	configPath := flag.String("config", "configs/short_test.json", "resolved config overrides JSON")
	seed := flag.Int64("seed", 4, "deterministic match seed")
	speed := flag.String("speed", "realtime", "match pacing: fast or realtime")
	flag.Parse()

	input, err := jsonadapter.LoadMatchInputFromFile(*inputPath)
	if err != nil {
		log.Fatalf("load input: %v", err)
	}
	cfg, err := jsonadapter.LoadResolvedConfigFromFile(*configPath, matchconfig.DefaultConfig())
	if err != nil {
		log.Fatalf("load config: %v", err)
	}
	if *speed != "fast" && *speed != "realtime" {
		log.Fatalf("unsupported speed %q", *speed)
	}

	http.Handle("/v1/smoke", websockettransport.MatchHandler(input, cfg, *seed, *speed))
	log.Printf("C1 smoke WebSocket listening on ws://%s/v1/smoke", *listen)
	if err := http.ListenAndServe(*listen, nil); err != nil {
		log.Fatal(err)
	}
}
