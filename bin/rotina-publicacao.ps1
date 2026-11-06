# Publica o estoque pela rotina temporária do backend, em quatro etapas, nesta ordem:
#   powershell -ExecutionPolicy Bypass -File bin\rotina-publicacao.ps1 subir     cria a senha e publica o backend
#   powershell -ExecutionPolicy Bypass -File bin\rotina-publicacao.ps1 simular   guarda a cópia e mostra o plano
#   powershell -ExecutionPolicy Bypass -File bin\rotina-publicacao.ps1 gravar    grava, depois de digitar SIM
#   powershell -ExecutionPolicy Bypass -File bin\rotina-publicacao.ps1 remover   apaga a senha e desliga a rota
# A senha fica só em D:\inovais-local\segredos e na Vercel: não aparece na tela nem vai para o Git.

param([ValidateSet('subir', 'simular', 'gravar', 'remover')][Parameter(Mandatory = $true)][string]$etapa)

$ErrorActionPreference = 'Stop'
$pasta = 'D:\inovais-local\segredos'
$senha = Join-Path $pasta 'publicacao-token.txt'

function Parar($mensagem) { Write-Host $mensagem -ForegroundColor Red; exit 1 }

function Ligar-Projeto {
    $projeto = Get-Content 'D:\marcos-ademicon-agent\.vercel\project.json' -Raw | ConvertFrom-Json
    $env:VERCEL_ORG_ID = $projeto.orgId
    $env:VERCEL_PROJECT_ID = 'prj_8rUZh24lcPg1P0ToJcuLyKACfiIE'
}

function Publicar-Backend {
    npx --yes vercel@latest deploy --prod --yes
    if ($LASTEXITCODE -ne 0) { Parar 'O deploy falhou. O site segue na versão anterior.' }
    $saude = (Invoke-WebRequest 'https://api.carinsight.com.br/health' -UseBasicParsing).StatusCode
    Write-Host "API no ar: $saude" -ForegroundColor Green
}

switch ($etapa) {
    'subir' {
        if (git status --short) { Parar 'Há alterações sem commit neste repositório. Nada foi publicado.' }
        New-Item -ItemType Directory -Force $pasta | Out-Null
        $bytes = New-Object byte[] 32
        [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
        # Sem quebra de linha no fim: ela iria junto para a Vercel e a senha não bateria.
        [IO.File]::WriteAllText($senha, (($bytes | ForEach-Object { $_.ToString('x2') }) -join ''))
        Ligar-Projeto
        cmd /c "npx --yes vercel@latest env add PUBLICACAO_TOKEN production --force < ""$senha"""
        if ($LASTEXITCODE -ne 0) { Parar 'Não consegui gravar a senha na Vercel. Nada foi publicado.' }
        Publicar-Backend
        Write-Host 'Pronto. Agora rode a etapa simular.' -ForegroundColor Green
    }
    'simular' {
        if (-not (Test-Path $senha)) { Parar 'Sem senha temporária: rode a etapa subir primeiro.' }
        npx ts-node prisma/publicar-pela-api.ts $senha
        if ($LASTEXITCODE -ne 0) { Parar 'A simulação falhou. Nada foi gravado.' }
    }
    'gravar' {
        if (-not (Test-Path $senha)) { Parar 'Sem senha temporária: rode a etapa subir primeiro.' }
        $resposta = Read-Host 'Gravar em produção? Digite SIM'
        if ($resposta -cne 'SIM') { Parar 'Cancelado. Nada foi gravado.' }
        npx ts-node prisma/publicar-pela-api.ts $senha --apply
        if ($LASTEXITCODE -ne 0) { Parar 'A gravação parou no meio. Pode rodar de novo: ela atualiza em vez de duplicar.' }
    }
    'remover' {
        Ligar-Projeto
        npx --yes vercel@latest env rm PUBLICACAO_TOKEN production --yes
        if ($LASTEXITCODE -ne 0) { Parar 'Não consegui apagar a senha da Vercel.' }
        Publicar-Backend
        Remove-Item $senha -Force -ErrorAction SilentlyContinue
        Write-Host 'Senha apagada e rota desligada.' -ForegroundColor Green
    }
}
