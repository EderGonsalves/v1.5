# Troubleshooting Docker Swarm - Task Not Scheduled

## Erro: "task has not been scheduled"

Este erro indica que o Docker Swarm não conseguiu agendar a execução do container. Vamos diagnosticar e resolver.

## Diagnóstico Passo a Passo

### 1. Verificar se a Imagem Existe

```bash
# Verificar imagens disponíveis no node
docker images | grep onboarding-app

# Se não existir, você precisa:
# - Fazer build da imagem
# - Importar a imagem
# - Ou usar um registry
```

**Solução**: Certifique-se de que a imagem `onboarding-app:latest` existe em todos os nodes do Swarm.

### 2. Verificar Constraints de Placement

O stack.yml tem:
```yaml
placement:
  constraints:
    - node.role == worker
```

**Verificar nodes disponíveis:**
```bash
docker node ls
```

**Solução**: 
- Se não houver nodes com role `worker`, remova ou ajuste a constraint
- Ou adicione a constraint correta baseada nos seus nodes

### 3. Verificar se a Rede Existe

```bash
# Verificar se a rede existe
docker network ls | grep minha_rede

# Se não existir, criar:
docker network create --driver overlay --attachable minha_rede
```

**Solução**: Certifique-se de que a rede `minha_rede` existe como overlay network no Swarm.

### 4. Verificar Logs Detalhados do Serviço

```bash
# Verificar status do serviço
docker service ps onboarding-app_onboarding-app --no-trunc

# Ver logs detalhados
docker service logs onboarding-app_onboarding-app
```

### 5. Verificar Recursos Disponíveis

```bash
# Verificar uso de recursos
docker stats

# Verificar informações do node
docker node inspect <node-id> --pretty
```

## Soluções Rápidas

### Solução 1: Remover Constraints (Teste)

Se você não tem nodes com role `worker`, remova temporariamente a constraint:

```yaml
deploy:
  replicas: 2
  # placement:
  #   constraints:
  #     - node.role == worker
```

### Solução 2: Usar Registry em vez de Imagem Local

Se a imagem não está disponível em todos os nodes, use um registry:

```yaml
services:
  onboarding-app:
    image: seu-registry.com/onboarding-app:latest
    # ... resto da config
```

### Solução 3: Garantir que a Rede Existe

```bash
# Criar rede se não existir
docker network create --driver overlay --attachable minha_rede

# Verificar se foi criada
docker network inspect minha_rede
```

### Solução 4: Verificar se o Swarm está Ativo

```bash
# Verificar status do Swarm
docker info | grep Swarm

# Se não estiver ativo, inicializar:
docker swarm init
```

## Stack.yml Corrigido (Versão Simplificada para Teste)

Crie uma versão simplificada para testar:

```yaml
version: "3.8"

services:
  onboarding-app:
    image: onboarding-app:latest
    deploy:
      replicas: 1
      restart_policy:
        condition: on-failure
    environment:
      - NODE_ENV=production
      - NEXT_TELEMETRY_DISABLED=1
    networks:
      - minha_rede
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode===200?0:1)})"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s

networks:
  minha_rede:
    external: true
```

## Checklist Antes de Deploy

- [ ] Imagem `onboarding-app:latest` existe no node
- [ ] Rede `minha_rede` existe como overlay network
- [ ] Docker Swarm está ativo (`docker info | grep Swarm`)
- [ ] Há nodes disponíveis com role adequada
- [ ] Recursos suficientes (CPU/memória) disponíveis
- [ ] Portas não estão em conflito

## Comandos Úteis para Diagnóstico

```bash
# Ver todos os serviços
docker service ls

# Ver detalhes de um serviço específico
docker service inspect onboarding-app_onboarding-app --pretty

# Ver tasks do serviço
docker service ps onboarding-app_onboarding-app

# Ver eventos do Swarm
docker events

# Ver informações do Swarm
docker info

# Ver nodes disponíveis
docker node ls

# Verificar se a rede está acessível
docker network inspect minha_rede
```

## Erros Comuns e Soluções

### Erro: "no suitable node"
**Causa**: Constraints não podem ser satisfeitas
**Solução**: Remova ou ajuste as constraints

### Erro: "network not found"
**Causa**: Rede não existe ou não é overlay
**Solução**: Crie a rede como overlay: `docker network create --driver overlay minha_rede`

### Erro: "image not found"
**Causa**: Imagem não existe no node
**Solução**: 
- Faça pull da imagem: `docker pull onboarding-app:latest`
- Ou use registry
- Ou exporte/importe a imagem em todos os nodes

### Erro: "port already allocated"
**Causa**: Porta já está em uso
**Solução**: Remova o mapeamento de porta ou use outra porta

## Próximos Passos

1. Execute os comandos de diagnóstico acima
2. Identifique qual é o problema específico
3. Aplique a solução correspondente
4. Tente fazer deploy novamente
5. Se persistir, use a versão simplificada do stack.yml para isolar o problema

