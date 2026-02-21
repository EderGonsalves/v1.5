# Guia de Deploy no Portainer - Resolução de Erros

## Erro: "Unexpected token 'B', "[Bad Gateway]" is not valid JSON"

Este erro geralmente ocorre quando o Portainer tenta processar uma resposta que não é JSON válido. Pode acontecer em diferentes etapas do processo.

## Possíveis Causas

### 1. Imagem não foi construída corretamente
### 2. Problema ao fazer pull/load da imagem
### 3. Formato incorreto da imagem
### 4. Problema de rede/conectividade

## Soluções Passo a Passo

### Opção 1: Build e Push para Registry (Recomendado)

#### 1. Build da Imagem Localmente

```bash
cd onboarding-app
docker build -t onboarding-app:latest .
```

#### 2. Testar a Imagem Localmente

```bash
docker run -d -p 3000:3000 --name test-onboarding onboarding-app:latest
docker logs test-onboarding
docker stop test-onboarding && docker rm test-onboarding
```

#### 3. Tag para Registry

```bash
# Substitua pelo seu registry
docker tag onboarding-app:latest seu-registry.com/onboarding-app:latest
```

#### 4. Push para Registry

```bash
docker push seu-registry.com/onboarding-app:latest
```

#### 5. No Portainer - Usar Imagem do Registry

No `stack.yml`, use:

```yaml
services:
  onboarding-app:
    image: seu-registry.com/onboarding-app:latest
    # ... resto da configuração
```

### Opção 2: Export/Import da Imagem

#### 1. Exportar Imagem

```bash
docker save onboarding-app:latest -o onboarding-app.tar
```

#### 2. No Portainer

1. Vá em **Images**
2. Clique em **Import image**
3. Faça upload do arquivo `onboarding-app.tar`
4. Aguarde o processo completar

#### 3. Verificar se a Imagem foi Carregada

```bash
# No node do Swarm
docker images | grep onboarding-app
```

### Opção 3: Build Direto no Portainer (Build via Git)

#### 1. Preparar Repositório Git

Certifique-se de que o código está em um repositório Git acessível.

#### 2. No Portainer

1. Vá em **Stacks** > **Add Stack**
2. Selecione **Build method**: **Repository**
3. Configure:
   - **Repository URL**: URL do seu repositório
   - **Compose path**: `onboarding-app/stack.yml` (ou ajuste conforme necessário)
   - **Dockerfile path**: `onboarding-app/Dockerfile`
   - **Build context**: `onboarding-app/`

### Opção 4: Build via Dockerfile no Portainer

1. Vá em **Images**
2. Clique em **Build image**
3. Configure:
   - **Build method**: **Upload**
   - Faça upload do `Dockerfile` e arquivos necessários
   - Ou use **Repository** para build a partir de Git

## Verificações Importantes

### 1. Verificar se o Build Funciona

```bash
cd onboarding-app
docker build --no-cache -t onboarding-app:test .
```

Se houver erros, corrija antes de continuar.

### 2. Verificar Estrutura da Imagem

```bash
docker run --rm onboarding-app:latest ls -la /app
docker run --rm onboarding-app:latest ls -la /app/.next
```

### 3. Verificar se o Servidor Inicia

```bash
docker run --rm -p 3000:3000 onboarding-app:latest
```

Acesse `http://localhost:3000/api/health` e verifique se retorna JSON.

### 4. Verificar Logs do Portainer

No Portainer:
1. Vá em **Containers** ou **Services**
2. Verifique os logs do container
3. Procure por erros de inicialização

## Problemas Comuns e Soluções

### Problema: Imagem muito grande

**Solução**: Use multi-stage build (já implementado) e considere usar `.dockerignore`.

### Problema: Permissões incorretas

**Solução**: O Dockerfile já cria usuário não-root. Verifique se não há problemas de permissão nos volumes.

### Problema: Arquivos faltando no standalone

**Solução**: Verifique se o `next.config.ts` tem `output: "standalone"` e se o build gerou `.next/standalone`.

### Problema: Portainer não consegue fazer pull

**Solução**: 
1. Verifique conectividade de rede
2. Verifique credenciais do registry
3. Tente fazer pull manualmente: `docker pull sua-imagem`

## Comandos Úteis para Diagnóstico

```bash
# Verificar tamanho da imagem
docker images onboarding-app

# Inspecionar imagem
docker inspect onboarding-app:latest

# Verificar layers
docker history onboarding-app:latest

# Testar healthcheck
docker run --rm onboarding-app:latest node -e "require('http').get('http://localhost:3000/api/health', (r) => {let data='';r.on('data',(c)=>{data+=c});r.on('end',()=>{console.log(data);process.exit(r.statusCode===200?0:1)})})"

# Verificar variáveis de ambiente
docker run --rm onboarding-app:latest env
```

## Checklist Antes de Deploy

- [ ] Build da imagem funciona sem erros
- [ ] Imagem testada localmente
- [ ] Healthcheck funciona
- [ ] Imagem está no registry ou foi importada no Portainer
- [ ] Stack.yml configurado corretamente
- [ ] Variáveis de ambiente configuradas
- [ ] Rede traefik-public existe
- [ ] Domínio configurado no Traefik

## Próximos Passos Após Resolver

1. Deploy do stack no Portainer
2. Verificar logs do serviço
3. Testar acesso via domínio configurado
4. Verificar healthcheck no Portainer

