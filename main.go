package main

import (
	"embed"
	"log"
	"os"
	"path/filepath"

	"github.com/pauloedsr/orbit/backend/config"
	"github.com/pauloedsr/orbit/backend/db"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	database, err := db.Open(cfg.DataDir)
	if err != nil {
		log.Fatalf("db: %v", err)
	}
	defer database.Close()

	app := NewApp(database, cfg)

	userDataPath := filepath.Join(os.TempDir(), "meu-app-wails", "webview-data")

	if err := wails.Run(&options.App{
		Title:     "Orbit",
		Width:     1280,
		Height:    800,
		MinWidth:  800,
		MinHeight: 600,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 18, G: 18, B: 18, A: 1},
		OnStartup:        app.startup,
		OnShutdown:       app.shutdown,
		Bind: []interface{}{
			app,
		},
		Windows: &windows.Options{
			WebviewUserDataPath: userDataPath,
		},
	}); err != nil {
		log.Fatalf("wails: %v", err)
	}
}
