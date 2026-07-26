#!/usr/bin/env bash
set -e

MSG="$1"

if [ -z "$MSG" ]; then
  echo "❌ Error: Debes proporcionar un mensaje de commit."
  echo "Uso: ./.agents/scripts/commit.sh 'mensaje del commit'"
  exit 1
fi

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")

echo "📦 Agregando cambios (git add .)..."
git add .

echo "📝 Creando commit con mensaje: '$MSG'..."
git commit -m "$MSG"

echo "🚀 Subiendo a GitHub (git push origin $BRANCH)..."
git push origin "$BRANCH"

echo "✅ ¡Código subido exitosamente a la rama '$BRANCH' en GitHub!"
