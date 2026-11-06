# Publica o estoque no banco de produção: guarda uma cópia, sincroniza a Renatinhu's Cars e
# grava o lote da Robust Car. Mostra a simulação e pede confirmação antes de gravar.
# Rodar na raiz do repositório: powershell -ExecutionPolicy Bypass -File bin\publicar-estoque.ps1
# A Vercel não entrega valores sensíveis, então o script os pede com digitação oculta.
# Os valores ficam só na memória deste processo: nada vai para arquivo nem para o histórico.

$ErrorActionPreference = 'Stop'
$lote = 'prisma/lotes/robust-car-2026-11-04.json'
$copia = 'D:\inovais-local\backups\carinsight-veiculos-' + (Get-Date -Format 'yyyy-MM-dd-HHmm') + '.json'

function Parar($mensagem) { Write-Host $mensagem -ForegroundColor Red; exit 1 }

function Pedir($nome, $pergunta) {
    $atual = [Environment]::GetEnvironmentVariable($nome)
    if ($atual) { return $atual }
    $seguro = Read-Host $pergunta -AsSecureString
    $ponteiro = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($seguro)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ponteiro).Trim() }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ponteiro) }
}

if (Test-Path .env) { Parar 'Já existe um .env aqui. Renomeie antes de rodar, para não misturar bancos.' }

$banco = Pedir 'DATABASE_URL' 'Cole a conexão direta do Neon (não aparece na tela)'
if ($banco -notmatch '^postgres(ql)?://[^@\s]+@([^/:\s?]+)') { Parar 'Isso não é uma conexão postgres válida. Nada foi gravado.' }
$servidor = $Matches[2]
if ($servidor -match '-pooler') { Parar 'Use a conexão direta do Neon: desligue o Connection pooling. Nada foi gravado.' }

$chave = Pedir 'OPENAI_API_KEY' 'Cole a chave da OpenAI (não aparece na tela)'
if ($chave -notmatch '^sk-\S{20,}$') { Parar 'Isso não parece uma chave da OpenAI. Nada foi gravado.' }

$env:DATABASE_URL = $banco
$env:OPENAI_API_KEY = $chave
Write-Host "Banco: $servidor"

try {
    npx ts-node prisma/copiar-veiculos.ts $copia
    if ($LASTEXITCODE -ne 0) { Parar 'Não consegui copiar os carros. Nada foi gravado.' }

    Write-Host "=== SIMULAÇÃO: Renatinhu's Cars ===" -ForegroundColor Cyan
    npx ts-node prisma/sync-renatinhus.ts
    if ($LASTEXITCODE -ne 0) { Parar 'A simulação falhou. Nada foi gravado.' }
    Write-Host "=== SIMULAÇÃO: Robust Car ===" -ForegroundColor Cyan
    npx ts-node prisma/importar-lote.ts $lote
    if ($LASTEXITCODE -ne 0) { Parar 'A simulação falhou. Nada foi gravado.' }

    $resposta = Read-Host "Gravar em produção no banco $servidor? Digite SIM"
    if ($resposta -cne 'SIM') { Parar 'Cancelado. Nada foi gravado.' }

    npx ts-node prisma/sync-renatinhus.ts --apply
    if ($LASTEXITCODE -ne 0) { Parar "A sincronização da Renatinhu's falhou. Cópia anterior em $copia" }
    npx ts-node prisma/importar-lote.ts $lote --apply
    if ($LASTEXITCODE -ne 0) { Parar "A gravação da Robust Car falhou. Cópia anterior em $copia" }
    Write-Host "Publicado. Cópia anterior em $copia" -ForegroundColor Green
}
finally {
    Remove-Item Env:DATABASE_URL, Env:OPENAI_API_KEY -ErrorAction SilentlyContinue
}
