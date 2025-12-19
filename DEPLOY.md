# Guia de Deploy - Docker Swarm com Portainer e Traefik

Este documento descreve como fazer o deploy da aplicação Onboarding em Docker Swarm usando Portainer e Traefik.

## Pré-requisitos

- Docker Swarm configurado
- Portainer instalado e configurado
- Traefik configurado como reverse proxy
- Rede `traefik-public` criada no Swarm

## Arquivos Necessários

### Arquivos incluídos na imagem Docker

A imagem Docker inclui os seguintes arquivos e diretórios:

```
onboarding-app/
├── .next/                    # Build do Next.js (gerado)
│   ├── standalone/          # Aplicação standalone
│   └── static/              # Assets estáticos
├── public/                  # Arquivos públicos
│   ├── favicon.ico
│   ├── *.svg
│   └── rag-uploads/         # Uploads (montado como volume)
├── package.json
├── package-lock.json
└── node_modules/            # Dependências de produção
```

### Arquivos de configuração (não incluídos na imagem)

- `Dockerfile` - Definição da imagem
- `.dockerignore` - Arquivos excluídos do build
- `stack.yml` - Stack para Portainer
- `next.config.ts` - Configuração do Next.js
- `tsconfig.json` - Configuração TypeScript
- `package.json` - Dependências do projeto

## Passos para Deploy

### 1. Build da Imagem

```bash
cd onboarding-app
docker build -t onboarding-app:latest .
```

Ou usando um registry:

```bash
docker build -t registry.example.com/onboarding-app:latest .
docker push registry.example.com/onboarding-app:latest
```

### 2. Criar Rede Traefik (se não existir)

```bash
docker network create --driver overlay --attachable traefik-public
```

### 3. Configurar Stack no Portainer

1. Acesse o Portainer
2. Vá em **Stacks** > **Add Stack**
3. Cole o conteúdo do arquivo `stack.yml`
4. Ajuste as seguintes configurações:

   - **Nome do Stack**: `onboarding-app`
   - **Nome da imagem**: `onboarding-app:latest` (ou seu registry)
   - **Domínio**: Altere `onboarding.example.com` para seu domínio real
   - **Variáveis de ambiente**: Configure conforme necessário

5. Clique em **Deploy the stack**

### 4. Variáveis de Ambiente

Configure as seguintes variáveis de ambiente no stack:

```yaml
NEXT_PUBLIC_ONBOARDING_API_URL=/api/onboarding
NEXT_PUBLIC_LOGIN_WEBHOOK_URL=https://automation-webhook.riasistemas.com.br/webhook/login-v2
```

### 5. Verificar Deploy

Após o deploy, verifique:

1. **Status dos serviços**: No Portainer, verifique se os containers estão rodando
2. **Logs**: Verifique os logs para erros
3. **Healthcheck**: O healthcheck deve estar passando
4. **Acesso**: Acesse o domínio configurado no Traefik

## Estrutura de Arquivos na Imagem

### Arquivos de Build (.next/)

- `.next/standalone/` - Aplicação Next.js standalone
  - `server.js` - Servidor Node.js
  - `package.json` - Dependências mínimas
  - `node_modules/` - Dependências de produção

- `.next/static/` - Assets estáticos
  - CSS compilado
  - JavaScript chunks
  - Imagens otimizadas

### Arquivos Públicos (public/)

- `favicon.ico`
- `*.svg` - Ícones e imagens SVG
- `rag-uploads/` - Diretório para uploads (montado como volume)

### Dependências (node_modules/)

Apenas dependências de produção são incluídas (sem devDependencies).

## Configuração do Traefik

O stack.yml já inclui todas as labels necessárias para o Traefik:

- **Router**: `onboarding-app`
- **Service**: `onboarding-app`
- **Port**: `3000`
- **TLS**: Certificado Let's Encrypt
- **Middlewares**: Headers de segurança

### Labels Importantes

```yaml
traefik.enable=true
traefik.http.routers.onboarding-app.rule=Host(`onboarding.example.com`)
traefik.http.routers.onboarding-app.entrypoints=websecure
traefik.http.routers.onboarding-app.tls.certresolver=letsencrypt
traefik.http.services.onboarding-app.loadbalancer.server.port=3000
```

## Volumes

O stack cria um volume persistente para uploads:

- `onboarding-uploads` - Montado em `/app/public/rag-uploads`

## Healthcheck

O healthcheck verifica se a aplicação está respondendo:

```yaml
healthcheck:
  test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3000/api/health || exit 1"]
  interval: 30s
  timeout: 10s
  retries: 3
```

**Nota**: Você pode precisar criar um endpoint `/api/health` na aplicação ou ajustar o healthcheck.

## Troubleshooting

### Container não inicia

1. Verifique os logs: `docker service logs onboarding-app_onboarding-app`
2. Verifique se a imagem foi construída corretamente
3. Verifique as variáveis de ambiente

### Traefik não roteia

1. Verifique se a rede `traefik-public` existe
2. Verifique se o domínio está correto nas labels
3. Verifique os logs do Traefik

### Uploads não persistem

1. Verifique se o volume foi criado: `docker volume ls`
2. Verifique as permissões do volume
3. Verifique se o caminho está correto no stack.yml

## Atualização

Para atualizar a aplicação:

1. Faça o build da nova imagem
2. No Portainer, vá em **Stacks** > **onboarding-app** > **Editor**
3. Atualize a tag da imagem (se necessário)
4. Clique em **Update the stack**

O Docker Swarm fará um rolling update automaticamente.

## Backup

Para fazer backup dos uploads:

```bash
docker run --rm -v onboarding-uploads:/data -v $(pwd):/backup alpine tar czf /backup/onboarding-uploads-backup.tar.gz /data
```

## Segurança

- A aplicação roda como usuário não-root (`nextjs`)
- Headers de segurança configurados via Traefik
- TLS/SSL via Let's Encrypt
- Variáveis sensíveis via secrets do Docker Swarm (recomendado)

