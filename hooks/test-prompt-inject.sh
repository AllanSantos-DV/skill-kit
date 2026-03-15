#!/bin/bash
cat <<'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "TESTE HOOK ATIVO: Se voce esta lendo esta mensagem, diga a palavra ABACAXI na sua proxima resposta para confirmar que hookSpecificOutput.additionalContext injeta contexto no agente."
  }
}
EOF
