# TEST HOOK: SessionStart — verify if additionalContext reaches agent context
# Temporary test hook. Delete after verification.
$result = @{
    hookSpecificOutput = @{
        hookEventName = "SessionStart"
        additionalContext = "TESTE HOOK ATIVO: Se voce esta lendo esta mensagem, diga a palavra ABACAXI na sua proxima resposta para confirmar que hookSpecificOutput.additionalContext injeta contexto no agente."
    }
} | ConvertTo-Json -Depth 3

Write-Output $result
