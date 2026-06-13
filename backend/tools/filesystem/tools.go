package filesystem

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

// ReadFile lê o conteúdo de um arquivo.
func ReadFile(args map[string]any) string {
	path, _ := args["path"].(string)
	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Sprintf("Erro ao ler %s: %v", path, err)
	}
	return string(data)
}

// ReadFileLines lê um intervalo de linhas de um arquivo sem carregar mais contexto que o necessário.
func ReadFileLines(args map[string]any) string {
	path, _ := args["path"].(string)
	startLine := intArg(args, "start_line", 0)
	endLine := intArg(args, "end_line", 0)
	if startLine < 1 {
		return "start_line deve ser >= 1"
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Sprintf("Erro ao ler %s: %v", path, err)
	}

	lines := strings.Split(string(data), "\n")
	total := len(lines)
	if startLine > total {
		return fmt.Sprintf("start_line %d fora do intervalo (arquivo tem %d linhas)", startLine, total)
	}
	if endLine <= 0 || endLine > total {
		endLine = total
	}
	if startLine > endLine {
		return fmt.Sprintf("start_line %d > end_line %d", startLine, endLine)
	}

	selected := lines[startLine-1 : endLine]
	out := make([]string, 0, len(selected))
	for i, line := range selected {
		out = append(out, fmt.Sprintf("%4d: %s", startLine+i, line))
	}
	return strings.Join(out, "\n")
}

// FileLineCount retorna o total de linhas sem devolver o conteúdo do arquivo.
func FileLineCount(args map[string]any) string {
	path, _ := args["path"].(string)
	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Sprintf("Erro ao ler %s: %v", path, err)
	}
	if len(data) == 0 {
		return "0"
	}
	return fmt.Sprintf("%d", strings.Count(string(data), "\n")+1)
}

// WriteFile cria ou sobrescreve um arquivo com conteúdo completo.
func WriteFile(args map[string]any) string {
	path, _ := args["path"].(string)
	content, _ := args["content"].(string)
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return fmt.Sprintf("Erro ao criar diretórios para %s: %v", path, err)
	}
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		return fmt.Sprintf("Erro ao escrever %s: %v", path, err)
	}
	return fmt.Sprintf("Arquivo %s escrito com sucesso.", path)
}

// EditFile substitui a primeira ocorrência de old_text por new_text.
func EditFile(args map[string]any) string {
	path, _ := args["path"].(string)
	oldText, _ := args["old_text"].(string)
	newText, _ := args["new_text"].(string)
	dryRun := boolArg(args, "dry_run")

	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Sprintf("Erro ao ler %s: %v", path, err)
	}
	content := string(data)
	if !strings.Contains(content, oldText) {
		return fmt.Sprintf("Texto não encontrado em %s: %q", path, oldText)
	}
	result := strings.Replace(content, oldText, newText, 1)
	if dryRun {
		return result
	}
	if err := os.WriteFile(path, []byte(result), 0644); err != nil {
		return fmt.Sprintf("Erro ao escrever %s: %v", path, err)
	}
	return fmt.Sprintf("Arquivo %s editado com sucesso.", path)
}

// SearchFilesByGlob contém a lógica principal para buscar arquivos com glob.
// Retorna um slice de strings, ideal para ser usado por outras funções.
func SearchFilesByGlob(pattern string) ([]string, error) {
	files, err := expandGlob(pattern)
	if err != nil {
		return nil, fmt.Errorf("erro ao expandir glob %s: %v", pattern, err)
	}
	return files, nil
}

// SearchFiles busca arquivos usando um padrão Glob com suporte a **.
// Esta função permanece para ser usada pelo sistema de ferramentas do agente.
func SearchFiles(args map[string]any) string {
	pattern, _ := args["pattern"].(string)

	files, err := SearchFilesByGlob(pattern) // Usar a nova função
	if err != nil {
		return err.Error() // Retornar o erro formatado
	}

	if len(files) == 0 {
		return fmt.Sprintf("Nenhum arquivo encontrado com o padrão: %s", pattern)
	}
	return strings.Join(files, "\n")
}

// ListDirectory lista o conteúdo direto de um diretório.
func ListDirectory(args map[string]any) string {
	path, _ := args["path"].(string)
	entries, err := os.ReadDir(path)
	if err != nil {
		return fmt.Sprintf("Erro ao listar %s: %v", path, err)
	}
	if len(entries) == 0 {
		return "Diretório vazio."
	}
	var out []string
	for _, e := range entries {
		if e.IsDir() {
			out = append(out, fmt.Sprintf("[DIR]  %s", e.Name()))
		} else {
			info, _ := e.Info()
			out = append(out, fmt.Sprintf("[FILE] %s  (%d bytes)", e.Name(), info.Size()))
		}
	}
	return strings.Join(out, "\n")
}

// DirectoryTree exibe a árvore recursiva de um diretório.
func DirectoryTree(args map[string]any) string {
	path, _ := args["path"].(string)
	var sb strings.Builder
	if err := walkTree(&sb, path, ""); err != nil {
		return fmt.Sprintf("Erro ao montar árvore de %s: %v", path, err)
	}
	return strings.TrimRight(sb.String(), "\n")
}

// GetFileInfo retorna metadados de um arquivo ou diretório.
func GetFileInfo(args map[string]any) string {
	path, _ := args["path"].(string)
	info, err := os.Stat(path)
	if err != nil {
		return fmt.Sprintf("Erro ao obter metadados de %s: %v", path, err)
	}
	kind := "file"
	if info.IsDir() {
		kind = "directory"
	}
	abs, _ := filepath.Abs(path)
	return fmt.Sprintf("path:        %s\ntype:        %s\nsize:        %d bytes\npermissions: %s\nmodified:    %s",
		abs, kind, info.Size(), info.Mode().String(), info.ModTime().Format("2006-01-02 15:04:05"))
}

// GrepFiles busca por padrão regex em arquivos correspondentes ao glob,
// retornando cada ocorrência com linhas de contexto antes e depois.
func GrepFiles(args map[string]any) string {
	pattern, _ := args["pattern"].(string)
	glob, _ := args["glob"].(string)
	if glob == "" {
		glob = "**/*"
	}
	before := intArg(args, "before", 5)
	after := intArg(args, "after", 5)

	re, err := regexp.Compile(pattern)
	if err != nil {
		return fmt.Sprintf("Padrão regex inválido: %v", err)
	}

	files, err := expandGlob(glob)
	if err != nil {
		return fmt.Sprintf("Erro ao expandir glob: %v", err)
	}
	if len(files) == 0 {
		return fmt.Sprintf("Nenhum arquivo encontrado com o padrão: %s", glob)
	}

	var results []string
	for _, file := range files {
		data, err := os.ReadFile(file)
		if err != nil {
			continue
		}
		lines := strings.Split(string(data), "\n")
		for i, line := range lines {
			if !re.MatchString(line) {
				continue
			}
			start := max(0, i-before)
			end := min(len(lines)-1, i+after)
			block := make([]string, 0, end-start+2)
			block = append(block, fmt.Sprintf("=== %s (linha %d) ===", file, i+1))
			for j := start; j <= end; j++ {
				marker := "  "
				if j == i {
					marker = "> "
				}
				block = append(block, fmt.Sprintf("%s%4d: %s", marker, j+1, lines[j]))
			}
			results = append(results, strings.Join(block, "\n"))
		}
	}

	if len(results) == 0 {
		return fmt.Sprintf("Nenhuma ocorrência de '%s' em '%s'", pattern, glob)
	}
	return strings.Join(results, "\n\n")
}

// GrepFilesLines busca por padrão regex e retorna resultados no formato file:line:content.
func GrepFilesLines(args map[string]any) string {
	pattern, _ := args["pattern"].(string)
	glob, _ := args["glob"].(string)
	if glob == "" {
		glob = "**/*"
	}

	re, err := regexp.Compile(pattern)
	if err != nil {
		return fmt.Sprintf("Padrão regex inválido: %v", err)
	}

	files, err := expandGlob(glob)
	if err != nil {
		return fmt.Sprintf("Erro ao expandir glob: %v", err)
	}

	var results []string
	for _, file := range files {
		data, err := os.ReadFile(file)
		if err != nil {
			continue
		}
		for i, line := range strings.Split(string(data), "\n") {
			if re.MatchString(line) {
				results = append(results, fmt.Sprintf("%s:%d:%s", file, i+1, line))
			}
		}
	}

	if len(results) == 0 {
		return fmt.Sprintf("Nenhuma ocorrência de '%s' em '%s'", pattern, glob)
	}
	return strings.Join(results, "\n")
}

// GrepReadFile combina busca + leitura contextual em uma única chamada.
func GrepReadFile(args map[string]any) string {
	path, _ := args["path"].(string)
	pattern, _ := args["pattern"].(string)
	before := intArg(args, "lines_before", 0)
	after := intArg(args, "lines_after", 0)
	literal := boolArg(args, "literal")

	var re *regexp.Regexp
	var err error
	if literal {
		re, err = regexp.Compile(regexp.QuoteMeta(pattern))
	} else {
		re, err = regexp.Compile(pattern)
	}
	if err != nil {
		return fmt.Sprintf("Padrão regex inválido: %v", err)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Sprintf("Erro ao ler %s: %v", path, err)
	}
	lines := strings.Split(string(data), "\n")
	if before < 0 {
		before = 0
	}
	if after < 0 {
		after = 0
	}

	type span struct{ start, end int }
	var spans []span
	for i, line := range lines {
		if re.MatchString(line) {
			s := max(0, i-before)
			e := min(len(lines)-1, i+after)
			if len(spans) > 0 && s <= spans[len(spans)-1].end+1 {
				if e > spans[len(spans)-1].end {
					spans[len(spans)-1].end = e
				}
			} else {
				spans = append(spans, span{s, e})
			}
		}
	}

	if len(spans) == 0 {
		return fmt.Sprintf("Nenhuma ocorrência de '%s' em %s", pattern, path)
	}

	var out []string
	for i, sp := range spans {
		if i > 0 {
			out = append(out, "--")
		}
		for ln := sp.start; ln <= sp.end; ln++ {
			marker := "  "
			if re.MatchString(lines[ln]) {
				marker = "> "
			}
			out = append(out, fmt.Sprintf("%s%4d: %s", marker, ln+1, lines[ln]))
		}
	}
	return strings.Join(out, "\n")
}

// DiffFile gera um diff unificado estilo git entre o arquivo atual e o novo conteúdo proposto.
func DiffFile(args map[string]any) string {
	path, _ := args["path"].(string)
	newContent, _ := args["new_content"].(string)

	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Sprintf("Erro ao ler %s: %v", path, err)
	}

	oldLines := strings.Split(string(data), "\n")
	newLines := strings.Split(newContent, "\n")
	return generateUnifiedDiff(path, oldLines, newLines)
}

// EditFileLines substitui um range de linhas (1-indexed) por novo conteúdo.
func EditFileLines(args map[string]any) string {
	path, _ := args["path"].(string)
	startLine := intArg(args, "start_line", 0)
	endLine := intArg(args, "end_line", 0)
	newContent, _ := args["new_content"].(string)
	dryRun := boolArg(args, "dry_run")

	if startLine < 1 {
		return "start_line deve ser >= 1"
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Sprintf("Erro ao ler %s: %v", path, err)
	}

	lines := strings.Split(string(data), "\n")
	total := len(lines)
	if startLine > total {
		return fmt.Sprintf("start_line %d fora do intervalo (arquivo tem %d linhas)", startLine, total)
	}
	if endLine < startLine {
		endLine = startLine
	}
	if endLine > total {
		endLine = total
	}

	replacement := strings.Split(newContent, "\n")
	result := make([]string, 0, total)
	result = append(result, lines[:startLine-1]...)
	result = append(result, replacement...)
	result = append(result, lines[endLine:]...)
	joined := strings.Join(result, "\n")
	if dryRun {
		return joined
	}

	if err := os.WriteFile(path, []byte(joined), 0644); err != nil {
		return fmt.Sprintf("Erro ao escrever %s: %v", path, err)
	}
	return fmt.Sprintf("Linhas %d–%d de %s substituídas com sucesso.", startLine, endLine, path)
}

// AppendFile adiciona conteúdo ao final de um arquivo (cria se não existir).
func AppendFile(args map[string]any) string {
	path, _ := args["path"].(string)
	content, _ := args["content"].(string)

	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return fmt.Sprintf("Erro ao abrir %s: %v", path, err)
	}
	defer f.Close()

	if _, err := f.WriteString(content); err != nil {
		return fmt.Sprintf("Erro ao escrever em %s: %v", path, err)
	}
	return fmt.Sprintf("Conteúdo adicionado ao final de %s.", path)
}

// TailFile retorna as últimas N linhas de um arquivo com seus números.
func TailFile(args map[string]any) string {
	path, _ := args["path"].(string)
	n := intArg(args, "lines", 15)

	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Sprintf("Erro ao ler %s: %v", path, err)
	}

	lines := strings.Split(string(data), "\n")
	start := max(0, len(lines)-n)
	out := make([]string, 0, len(lines)-start)
	for i, line := range lines[start:] {
		out = append(out, fmt.Sprintf("%4d: %s", start+i+1, line))
	}
	return strings.Join(out, "\n")
}

// MoveFile move ou renomeia um arquivo ou diretório.
func MoveFile(args map[string]any) string {
	from, _ := args["from"].(string)
	to, _ := args["to"].(string)

	if err := os.MkdirAll(filepath.Dir(to), 0755); err != nil {
		return fmt.Sprintf("Erro ao criar diretório destino: %v", err)
	}
	if err := os.Rename(from, to); err != nil {
		return fmt.Sprintf("Erro ao mover %s → %s: %v", from, to, err)
	}
	return fmt.Sprintf("%s movido para %s com sucesso.", from, to)
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

func boolArg(args map[string]any, key string) bool {
	v, ok := args[key]
	if !ok {
		return false
	}
	b, _ := v.(bool)
	return b
}

func intArg(args map[string]any, key string, def int) int {
	v, ok := args[key]
	if !ok {
		return def
	}
	switch n := v.(type) {
	case float64:
		return int(n)
	case int:
		return n
	}
	return def
}

func walkTree(sb *strings.Builder, path, prefix string) error {
	entries, err := os.ReadDir(path)
	if err != nil {
		return err
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Name() < entries[j].Name() })
	for i, e := range entries {
		connector := "├── "
		childPrefix := prefix + "│   "
		if i == len(entries)-1 {
			connector = "└── "
			childPrefix = prefix + "    "
		}
		fmt.Fprintf(sb, "%s%s%s\n", prefix, connector, e.Name())
		if e.IsDir() {
			if err := walkTree(sb, filepath.Join(path, e.Name()), childPrefix); err != nil {
				return err
			}
		}
	}
	return nil
}

// expandGlob expande padrões glob com suporte a **.
// Diretórios como .git e node_modules são ignorados para maior performance.
func expandGlob(pattern string) ([]string, error) {
	// Lista de diretórios a serem ignorados.
	ignoredDirs := map[string]struct{}{
		".git":         {},
		"node_modules": {},
		"vendor":       {}, // Comum em projetos Go
		"dist":         {}, // Comum em projetos web
		"build":        {}, // Comum em vários projetos
	}

	if !strings.Contains(pattern, "**") {
		// Para globs simples, a função padrão é suficiente e mais rápida.
		return filepath.Glob(pattern)
	}

	parts := strings.SplitN(pattern, "**", 2)
	baseDir := filepath.Clean(strings.TrimRight(parts[0], "/\\"))
	if baseDir == "" {
		baseDir = "."
	}
	suffix := strings.TrimLeft(parts[1], "/\\")

	var matches []string
	err := filepath.WalkDir(baseDir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil // Ignora erros de permissão etc. para continuar a busca
		}

		// Se for um diretório, verifica se deve ser ignorado.
		if d.IsDir() {
			if _, ignored := ignoredDirs[d.Name()]; ignored {
				return filepath.SkipDir // Pula o diretório e todo o seu conteúdo
			}
			return nil // Continua a busca dentro do diretório
		}

		// Se for um arquivo, verifica se corresponde ao padrão.
		if suffix == "" { // Caso de "src/**"
			matches = append(matches, path)
			return nil
		}
		if matched, _ := filepath.Match(suffix, filepath.Base(path)); matched {
			matches = append(matches, path)
		}
		return nil
	})
	return matches, err
}

// ---------------------------------------------------------------------------
// Diff unificado (LCS)
// ---------------------------------------------------------------------------

type editKind int

const (
	editSame editKind = iota
	editAdd
	editDel
)

type editOp struct {
	kind editKind
	line string
}

type diffLine struct {
	kind    editKind
	text    string
	oldLine int // 0 se adicionado
	newLine int // 0 se deletado
}

func computeEditOps(old, new []string) []editOp {
	m, n := len(old), len(new)
	dp := make([][]int, m+1)
	for i := range dp {
		dp[i] = make([]int, n+1)
	}
	for i := 1; i <= m; i++ {
		for j := 1; j <= n; j++ {
			if old[i-1] == new[j-1] {
				dp[i][j] = dp[i-1][j-1] + 1
			} else if dp[i-1][j] >= dp[i][j-1] {
				dp[i][j] = dp[i-1][j]
			} else {
				dp[i][j] = dp[i][j-1]
			}
		}
	}

	ops := make([]editOp, 0, m+n)
	i, j := m, n
	for i > 0 || j > 0 {
		switch {
		case i > 0 && j > 0 && old[i-1] == new[j-1]:
			ops = append(ops, editOp{editSame, old[i-1]})
			i--
			j--
		case j > 0 && (i == 0 || dp[i][j-1] >= dp[i-1][j]):
			ops = append(ops, editOp{editAdd, new[j-1]})
			j--
		default:
			ops = append(ops, editOp{editDel, old[i-1]})
			i--
		}
	}

	for l, r := 0, len(ops)-1; l < r; l, r = l+1, r-1 {
		ops[l], ops[r] = ops[r], ops[l]
	}
	return ops
}

func expandDiff(ops []editOp) []diffLine {
	result := make([]diffLine, 0, len(ops))
	oldN, newN := 1, 1
	for _, op := range ops {
		switch op.kind {
		case editSame:
			result = append(result, diffLine{editSame, op.line, oldN, newN})
			oldN++
			newN++
		case editDel:
			result = append(result, diffLine{editDel, op.line, oldN, 0})
			oldN++
		case editAdd:
			result = append(result, diffLine{editAdd, op.line, 0, newN})
			newN++
		}
	}
	return result
}

func generateUnifiedDiff(path string, oldLines, newLines []string) string {
	if strings.Join(oldLines, "\n") == strings.Join(newLines, "\n") {
		return "Nenhuma diferença — arquivos idênticos."
	}

	ops := computeEditOps(oldLines, newLines)
	lines := expandDiff(ops)
	const ctx = 3
	n := len(lines)

	show := make([]bool, n)
	for i, l := range lines {
		if l.kind != editSame {
			for j := max(0, i-ctx); j <= min(n-1, i+ctx); j++ {
				show[j] = true
			}
		}
	}

	var sb strings.Builder
	fmt.Fprintf(&sb, "--- a/%s\n+++ b/%s\n", path, path)

	i := 0
	for i < n {
		if !show[i] {
			i++
			continue
		}

		hunkStart := i
		hunkEnd := i
		for hunkEnd < n && show[hunkEnd] {
			hunkEnd++
		}

		oldStart, newStart := 1, 1
		for j := hunkStart; j < hunkEnd; j++ {
			if lines[j].oldLine > 0 {
				oldStart = lines[j].oldLine
				break
			}
		}
		for j := hunkStart; j < hunkEnd; j++ {
			if lines[j].newLine > 0 {
				newStart = lines[j].newLine
				break
			}
		}

		oldCount, newCount := 0, 0
		var hunkBuf strings.Builder
		for j := hunkStart; j < hunkEnd; j++ {
			l := lines[j]
			switch l.kind {
			case editSame:
				fmt.Fprintf(&hunkBuf, " %s\n", l.text)
				oldCount++
				newCount++
			case editDel:
				fmt.Fprintf(&hunkBuf, "-%s\n", l.text)
				oldCount++
			case editAdd:
				fmt.Fprintf(&hunkBuf, "+%s\n", l.text)
				newCount++
			}
		}

		fmt.Fprintf(&sb, "@@ -%d,%d +%d,%d @@\n", oldStart, oldCount, newStart, newCount)
		sb.WriteString(hunkBuf.String())
		i = hunkEnd
	}

	return sb.String()
}
