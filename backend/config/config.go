package config

import (
	"os"
	"path/filepath"

	"github.com/BurntSushi/toml"
)

type Config struct {
	DataDir         string          `toml:"-"` // derivado, não salvo no arquivo
	DefaultModel    string          `toml:"default_model"`
	DefaultProvider string          `toml:"default_provider"`
	Theme           string          `toml:"theme"`
	Gateway         GatewayConfig   `toml:"gateway"`
	Providers       ProvidersConfig `toml:"providers"`
}

type GatewayConfig struct {
	Port    int  `toml:"port"`
	Enabled bool `toml:"enabled"`
}

type ProvidersConfig struct {
	Anthropic ProviderEntry `toml:"anthropic"`
	OpenAI    ProviderEntry `toml:"openai"`
}

type ProviderEntry struct {
	APIKey  string `toml:"api_key"`
	BaseURL string `toml:"base_url"`
}

func defaults() Config {
	return Config{
		DefaultModel:    "claude-sonnet-4-20250514",
		DefaultProvider: "anthropic",
		Theme:           "dark",
		Gateway: GatewayConfig{
			Port:    8090,
			Enabled: false,
		},
	}
}

// Load lê ~/.config/orbit/config.toml ou cria com defaults.
func Load() (*Config, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		configDir = filepath.Join(os.Getenv("HOME"), ".config")
	}

	orbitDir := filepath.Join(configDir, "orbit")
	if err := os.MkdirAll(orbitDir, 0o755); err != nil {
		return nil, err
	}

	cfg := defaults()
	cfg.DataDir = filepath.Join(orbitDir, "data")

	configPath := filepath.Join(orbitDir, "config.toml")
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		// Cria arquivo default
		f, err := os.Create(configPath)
		if err != nil {
			return nil, err
		}
		defer f.Close()
		if err := toml.NewEncoder(f).Encode(cfg); err != nil {
			return nil, err
		}
	} else {
		// Lê existente
		if _, err := toml.DecodeFile(configPath, &cfg); err != nil {
			return nil, err
		}
		cfg.DataDir = filepath.Join(orbitDir, "data")
	}

	return &cfg, nil
}

// ConfigDir retorna o path do diretório de configuração.
func ConfigDir() string {
	configDir, err := os.UserConfigDir()
	if err != nil {
		configDir = filepath.Join(os.Getenv("HOME"), ".config")
	}
	return filepath.Join(configDir, "orbit")
}
