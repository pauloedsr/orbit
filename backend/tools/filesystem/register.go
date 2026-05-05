package filesystem

import (
	"github.com/pauloedsr/orbit/backend/providers"
	"github.com/pauloedsr/orbit/backend/tools"
)

// Register adiciona todas as ferramentas de sistema de arquivos ao registry.
func Register(r *tools.Registry) {
	r.Register(providers.Tool{
		Name:        "read_file",
		Description: "Lê o conteúdo de um arquivo. Suporta batch via campo 'items': [{\"path\":\"...\"}].",
		Parameters: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"path": map[string]any{"type": "string", "description": "Caminho do arquivo a ser lido"},
			},
			"required": []string{"path"},
		},
	}, ReadFile)

	r.Register(providers.Tool{
		Name:        "read_file_lines",
		Description: "Lê um intervalo específico de linhas de um arquivo, evitando carregar o conteúdo completo. Útil para economizar tokens em arquivos grandes. Suporta batch via 'items'.",
		Parameters: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"path":       map[string]any{"type": "string", "description": "Caminho do arquivo"},
				"start_line": map[string]any{"type": "integer", "description": "Linha inicial (1-indexed, inclusiva)"},
				"end_line":   map[string]any{"type": "integer", "description": "Linha final (1-indexed, inclusiva). Use 0 para ler até o fim."},
			},
			"required": []string{"path", "start_line"},
		},
	}, ReadFileLines)

	r.Register(providers.Tool{
		Name:        "file_line_count",
		Description: "Retorna o número total de linhas de um arquivo sem devolver seu conteúdo. Útil antes de usar read_file_lines.",
		Parameters: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"path": map[string]any{"type": "string", "description": "Caminho do arquivo"},
			},
			"required": []string{"path"},
		},
	}, FileLineCount)

	r.Register(providers.Tool{
		Name:        "write_file",
		Description: "Cria ou sobrescreve um arquivo com conteúdo completo. Cria diretórios intermediários se necessário. Suporta batch via 'items'.",
		Parameters: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"path":    map[string]any{"type": "string", "description": "Caminho do arquivo"},
				"content": map[string]any{"type": "string", "description": "Conteúdo completo do arquivo"},
			},
			"required": []string{"path", "content"},
		},
	}, WriteFile)

	r.Register(providers.Tool{
		Name:        "edit_file",
		Description: "Edita um arquivo substituindo a primeira ocorrência de old_text por new_text. Opcionalmente pode fazer dry_run para visualizar sem gravar. Suporta batch via 'items'.",
		Parameters: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"path":     map[string]any{"type": "string", "description": "Caminho do arquivo"},
				"old_text": map[string]any{"type": "string", "description": "Texto exato a ser substituído"},
				"new_text": map[string]any{"type": "string", "description": "Novo texto"},
				"dry_run":  map[string]any{"type": "boolean", "description": "Se true, mostra o resultado sem gravar"},
			},
			"required": []string{"path", "old_text", "new_text"},
		},
	}, EditFile)

	r.Register(providers.Tool{
		Name:        "edit_file_lines",
		Description: "Substitui um range de linhas (1-indexed) de um arquivo por novo conteúdo. Opcionalmente pode fazer dry_run para visualizar sem gravar. Suporta batch via 'items'.",
		Parameters: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"path":        map[string]any{"type": "string", "description": "Caminho do arquivo"},
				"start_line":  map[string]any{"type": "integer", "description": "Linha inicial (1-indexed)"},
				"end_line":    map[string]any{"type": "integer", "description": "Linha final inclusive (1-indexed); se omitido, substitui só a start_line"},
				"new_content": map[string]any{"type": "string", "description": "Conteúdo substituto"},
				"dry_run":     map[string]any{"type": "boolean", "description": "Se true, mostra o resultado sem gravar"},
			},
			"required": []string{"path", "start_line", "new_content"},
		},
	}, EditFileLines)

	r.Register(providers.Tool{
		Name:        "append_file",
		Description: "Adiciona conteúdo ao final de um arquivo. Cria o arquivo se não existir. Suporta batch via 'items'.",
		Parameters: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"path":    map[string]any{"type": "string", "description": "Caminho do arquivo"},
				"content": map[string]any{"type": "string", "description": "Conteúdo a adicionar"},
			},
			"required": []string{"path", "content"},
		},
	}, AppendFile)

	r.Register(providers.Tool{
		Name:        "tail_file",
		Description: "Retorna as últimas N linhas de um arquivo com números de linha. Suporta batch via 'items'.",
		Parameters: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"path":  map[string]any{"type": "string", "description": "Caminho do arquivo"},
				"lines": map[string]any{"type": "integer", "description": "Número de linhas a retornar (padrão: 15)"},
			},
			"required": []string{"path"},
		},
	}, TailFile)

	r.Register(providers.Tool{
		Name:        "move_file",
		Description: "Move ou renomeia um arquivo ou diretório. Cria diretórios de destino se necessário. Suporta batch via 'items'.",
		Parameters: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"from": map[string]any{"type": "string", "description": "Caminho de origem"},
				"to":   map[string]any{"type": "string", "description": "Caminho de destino"},
			},
			"required": []string{"from", "to"},
		},
	}, MoveFile)

	r.Register(providers.Tool{
		Name:        "list_directory",
		Description: "Lista o conteúdo direto de um diretório, indicando [FILE] e [DIR]. Mais barato que árvore recursiva para inspeção rápida. Suporta batch via 'items'.",
		Parameters: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"path": map[string]any{"type": "string", "description": "Caminho do diretório"},
			},
			"required": []string{"path"},
		},
	}, ListDirectory)

	r.Register(providers.Tool{
		Name:        "directory_tree",
		Description: "Exibe a árvore recursiva de arquivos e diretórios a partir de um caminho raiz. Suporta batch via 'items'.",
		Parameters: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"path": map[string]any{"type": "string", "description": "Caminho raiz da árvore"},
			},
			"required": []string{"path"},
		},
	}, DirectoryTree)

	r.Register(providers.Tool{
		Name:        "get_file_info",
		Description: "Retorna metadados de um arquivo ou diretório: tipo, tamanho, permissões e modificação. Suporta batch via 'items'.",
		Parameters: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"path": map[string]any{"type": "string", "description": "Caminho do arquivo ou diretório"},
			},
			"required": []string{"path"},
		},
	}, GetFileInfo)

	r.Register(providers.Tool{
		Name:        "search_files",
		Description: "Busca arquivos usando padrão Glob com suporte a ** (ex: src/**/*.go). Retorna lista de caminhos. Suporta batch via 'items'.",
		Parameters: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"pattern": map[string]any{"type": "string", "description": "Padrão Glob (ex: *.go, src/**/*.ts)"},
			},
			"required": []string{"pattern"},
		},
	}, SearchFiles)

	r.Register(providers.Tool{
		Name:        "grep_files",
		Description: "Busca por padrão regex em arquivos correspondentes ao glob, retornando cada ocorrência com linhas de contexto antes e depois. Suporta batch via 'items'.",
		Parameters: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"pattern": map[string]any{"type": "string", "description": "Padrão regex a buscar"},
				"glob":    map[string]any{"type": "string", "description": "Padrão Glob dos arquivos (ex: **/*.go). Padrão: **/*"},
				"before":  map[string]any{"type": "integer", "description": "Linhas de contexto antes de cada ocorrência (padrão: 5)"},
				"after":   map[string]any{"type": "integer", "description": "Linhas de contexto depois de cada ocorrência (padrão: 5)"},
			},
			"required": []string{"pattern"},
		},
	}, GrepFiles)

	r.Register(providers.Tool{
		Name:        "grep_files_lines",
		Description: "Busca por padrão regex em arquivos e retorna resultados no formato file:linha:conteúdo. Ideal para localizar símbolos rapidamente. Suporta batch via 'items'.",
		Parameters: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"pattern": map[string]any{"type": "string", "description": "Padrão regex a buscar"},
				"glob":    map[string]any{"type": "string", "description": "Padrão Glob dos arquivos (ex: **/*.go). Padrão: **/*"},
			},
			"required": []string{"pattern"},
		},
	}, GrepFilesLines)

	r.Register(providers.Tool{
		Name:        "grep_read_file",
		Description: "Busca um padrão em um arquivo e devolve blocos numerados com contexto antes e depois de cada match, combinando grep + leitura contextual em uma chamada. Suporta batch via 'items'.",
		Parameters: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"path":         map[string]any{"type": "string", "description": "Caminho do arquivo"},
				"pattern":      map[string]any{"type": "string", "description": "Padrão regex a buscar"},
				"lines_before": map[string]any{"type": "integer", "description": "Linhas a incluir antes de cada match (padrão: 0)"},
				"lines_after":  map[string]any{"type": "integer", "description": "Linhas a incluir depois de cada match (padrão: 0)"},
				"literal":      map[string]any{"type": "boolean", "description": "Se true, trata pattern como texto literal"},
			},
			"required": []string{"path", "pattern"},
		},
	}, GrepReadFile)

	r.Register(providers.Tool{
		Name:        "diff_file",
		Description: "Gera um diff unificado estilo git entre o conteúdo atual de um arquivo e um novo conteúdo proposto. Útil para pré-visualizar mudanças antes de aplicar. Suporta batch via 'items'.",
		Parameters: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"path":        map[string]any{"type": "string", "description": "Caminho do arquivo existente"},
				"new_content": map[string]any{"type": "string", "description": "Novo conteúdo proposto para comparação"},
			},
			"required": []string{"path", "new_content"},
		},
	}, DiffFile)
}
