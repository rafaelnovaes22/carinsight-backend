# Publica o estoque no banco de produção: guarda uma cópia, sincroniza a Renatinhu's Cars e
# grava o lote da Robust Car. Mostra a simulação e pede confirmação antes de gravar.
# Rodar na raiz do repositório: powershell -ExecutionPolicy Bypass -File bin\publicar-estoque.ps1
# Usa um arquivo temporário de variáveis, apagado ao final, e não altera o .env nem o .gitignore.

$ErrorActionPreference = 'Stop'
$lote = 'prisma/lotes/robust-car-2026-11-04.json'
$copia = 'D:\inovais-local\backups\carinsight-veiculos-' + (Get-Date -Format 'yyyy-MM-dd-HHmm') + '.json'
$variaveis = Join-Path $env:TEMP ('carinsight-' + [guid]::NewGuid().ToString('N') + '.env')

function Parar($mensagem) { Write-Host $mensagem -ForegroundColor Red; exit 1 }

if (Test-Path .env) { Parar 'Já existe um .env aqui. Renomeie antes de rodar, para não misturar bancos.' }

try {
    $projeto = Get-Content 'D:\marcos-ademicon-agent\.vercel\project.json' -Raw | ConvertFrom-Json
    $env:VERCEL_ORG_ID = $projeto.orgId
    $env:VERCEL_PROJECT_ID = 'prj_8rUZh24lcPg1P0ToJcuLyKACfiIE'
    npx --yes vercel@latest env pull $variaveis --yes --environment=production
    if ($LASTEXITCODE -ne 0) { Parar 'Não consegui ler as variáveis de produção. Nada foi gravado.' }
    foreach ($nome in 'DATABASE_URL', 'OPENAI_API_KEY') {
        if (-not (Select-String -Path $variaveis -Pattern "^$nome=""?[^""\s]{8,}" -Quiet)) {
            Parar "A Vercel não entregou $nome, talvez por estar marcada como sensível. Nada foi gravado."
        }
    }
    $env:DOTENV_CONFIG_PATH = $variaveis

    npx ts-node prisma/copiar-veiculos.ts $copia
    if ($LASTEXITCODE -ne 0) { Parar 'Não consegui copiar os carros. Nada foi gravado.' }

    Write-Host "=== SIMULAÇÃO: Renatinhu's Cars ===" -ForegroundColor Cyan
    npx ts-node prisma/sync-renatinhus.ts
    if ($LASTEXITCODE -ne 0) { Parar 'A simulação falhou. Nada foi gravado.' }
    Write-Host "=== SIMULAÇÃO: Robust Car ===" -ForegroundColor Cyan
    npx ts-node prisma/importar-lote.ts $lote
    if ($LASTEXITCODE -ne 0) { Parar 'A simulação falhou. Nada foi gravado.' }

    $resposta = Read-Host 'Gravar em produção? Digite SIM'
    if ($resposta -cne 'SIM') { Parar 'Cancelado. Nada foi gravado.' }

    npx ts-node prisma/sync-renatinhus.ts --apply
    if ($LASTEXITCODE -ne 0) { Parar "A sincronização da Renatinhu's falhou. Cópia anterior em $copia" }
    npx ts-node prisma/importar-lote.ts $lote --apply
    if ($LASTEXITCODE -ne 0) { Parar "A gravação da Robust Car falhou. Cópia anterior em $copia" }
    Write-Host "Publicado. Cópia anterior em $copia" -ForegroundColor Green
}
finally {
    Remove-Item $variaveis -Force -ErrorAction SilentlyContinue
}
