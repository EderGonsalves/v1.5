# Arquivos e Diretórios Incluídos na Imagem Docker

Este documento lista todos os arquivos e diretórios que fazem parte da imagem Docker final.

## Estrutura da Imagem

```
/app/
├── .next/
│   ├── standalone/
│   │   ├── server.js              # Servidor Next.js
│   │   ├── package.json           # Dependências mínimas
│   │   └── node_modules/          # Dependências de produção
│   └── static/                    # Assets estáticos compilados
│       ├── chunks/                # JavaScript chunks
│       ├── css/                   # CSS compilado
│       └── media/                 # Imagens otimizadas
├── public/                        # Arquivos públicos
│   ├── favicon.ico
│   ├── file.svg
│   ├── globe.svg
│   ├── next.svg
│   ├── vercel.svg
│   ├── window.svg
│   └── rag-uploads/               # Montado como volume (não incluído na imagem)
├── package.json                   # Informações do pacote
└── node_modules/                  # Dependências de produção (se necessário)
```

## Arquivos Incluídos

### 1. Build do Next.js (.next/)

#### .next/standalone/
- **server.js**: Servidor Node.js standalone do Next.js
- **package.json**: Dependências mínimas necessárias para rodar
- **node_modules/**: Apenas dependências de produção necessárias

#### .next/static/
- **chunks/**: JavaScript chunks otimizados e code-split
- **css/**: CSS compilado e otimizado
- **media/**: Imagens otimizadas pelo Next.js Image Optimization

### 2. Arquivos Públicos (public/)

#### Ícones e Imagens SVG
- `favicon.ico` - Favicon da aplicação
- `file.svg` - Ícone de arquivo
- `globe.svg` - Ícone de globo
- `next.svg` - Logo Next.js
- `vercel.svg` - Logo Vercel
- `window.svg` - Ícone de janela

#### Diretório de Uploads
- `rag-uploads/` - **NOTA**: Este diretório é montado como volume no Docker Swarm e não está incluído na imagem

### 3. Configuração

- `package.json` - Metadados do pacote (versão, nome, etc.)

## Arquivos Excluídos da Imagem

Os seguintes arquivos são **excluídos** da imagem via `.dockerignore`:

### Desenvolvimento
- `node_modules/` (recriado no build)
- `.next/` (recriado no build)
- `dev-server.err`, `dev-server.log`
- Arquivos de teste (`*.test.ts`, `*.spec.ts`)
- `vitest.config.ts`, `vitest.setup.ts`

### Configuração e Documentação
- `Dockerfile`, `.dockerignore`
- `docker-compose*.yml`, `stack.yml`
- `README.md`, `*.md`
- `.git/`, `.gitignore`

### IDE e Temporários
- `.vscode/`, `.idea/`
- `*.swp`, `*.swo`, `*~`
- `.DS_Store`
- `tmp/`, `temp/`, `*.tmp`

### Logs e Database
- `logs/`, `*.log`
- `db/`, `*.db`, `*.sqlite`

## Tamanho Estimado da Imagem

- **Base (Node.js Alpine)**: ~50MB
- **Dependências de produção**: ~150-200MB
- **Build do Next.js**: ~50-100MB
- **Total estimado**: ~250-350MB

## Verificação

Para verificar o conteúdo da imagem:

```bash
# Criar container temporário
docker create --name temp-container onboarding-app:latest

# Listar arquivos
docker cp temp-container:/app - | tar -tzf - | head -20

# Remover container
docker rm temp-container
```

## Otimizações

A imagem usa as seguintes otimizações:

1. **Multi-stage build**: Reduz tamanho final
2. **Alpine Linux**: Base mínima
3. **Standalone output**: Apenas arquivos necessários
4. **Produção apenas**: Sem devDependencies
5. **Usuário não-root**: Segurança

