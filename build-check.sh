#!/bin/sh
# Script para verificar se o build está correto

set -e

echo "🔍 Verificando estrutura do projeto..."
test -f package.json || (echo "❌ package.json não encontrado" && exit 1)
test -f next.config.ts || (echo "❌ next.config.ts não encontrado" && exit 1)
test -f Dockerfile || (echo "❌ Dockerfile não encontrado" && exit 1)

echo "✅ Estrutura básica OK"

echo "🔨 Fazendo build da imagem..."
docker build -t onboarding-app:test .

echo "✅ Build concluído"

echo "🔍 Verificando estrutura da imagem..."
docker run --rm onboarding-app:test test -f server.js || (echo "❌ server.js não encontrado na imagem" && exit 1)
docker run --rm onboarding-app:test test -d .next/static || (echo "❌ .next/static não encontrado" && exit 1)
docker run --rm onboarding-app:test test -d public || (echo "❌ public não encontrado" && exit 1)

echo "✅ Estrutura da imagem OK"

echo "🚀 Testando inicialização do servidor..."
CONTAINER_ID=$(docker run -d -p 3000:3000 onboarding-app:test)
sleep 5

echo "🔍 Verificando healthcheck..."
HEALTH_RESPONSE=$(curl -s http://localhost:3000/api/health || echo "ERROR")
if echo "$HEALTH_RESPONSE" | grep -q "status"; then
  echo "✅ Healthcheck OK"
else
  echo "❌ Healthcheck falhou: $HEALTH_RESPONSE"
  docker logs $CONTAINER_ID
  docker stop $CONTAINER_ID && docker rm $CONTAINER_ID
  exit 1
fi

docker stop $CONTAINER_ID && docker rm $CONTAINER_ID

echo "✅ Todos os testes passaram!"
echo "📦 Imagem pronta para deploy: onboarding-app:test"
echo "💡 Para usar no Portainer, faça:"
echo "   docker tag onboarding-app:test onboarding-app:latest"
echo "   docker save onboarding-app:latest -o onboarding-app.tar"

