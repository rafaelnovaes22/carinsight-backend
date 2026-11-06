/**
 * Publica o estoque pela rotina temporária do backend, que já tem acesso ao banco.
 * A leitura do site da loja fica aqui; a rota recebe um carro por chamada.
 *
 *   npx ts-node prisma/publicar-pela-api.ts <senha.txt>           guarda a cópia e simula
 *   npx ts-node prisma/publicar-pela-api.ts <senha.txt> --apply   guarda a cópia e grava
 *
 * Pode rodar de novo depois de uma falha: refaz o plano e atualiza em vez de duplicar.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import {
  carrosComFoto,
  dadosDoVeiculo,
  Lote,
  midiaDoVeiculo,
  validarLote,
} from '../src/stock-sync/lote';
import {
  assertPlausibleListing,
  detectBodyType,
  ExistingVehicle,
  parseListing,
  parseVehicleName,
  planSync,
} from '../src/stock-sync/renatinhus.parser';
import { conferirMidia } from './importar-lote';
import {
  buildVehicleData,
  DEALER_NAME,
  fetchDetails,
  fetchText,
  LISTING_URL,
  mediaData,
  printPlan,
} from './sync-renatinhus';

const API = 'https://api.carinsight.com.br/publicacao';
const ARQUIVO_LOTE = 'prisma/lotes/robust-car-2026-11-04.json';
const PASTA_COPIA = 'D:/inovais-local/backups';
const CONTATO_RENATINHUS = {
  address: 'Av. São Miguel, 9299 - São Paulo - SP',
};

interface Copia {
  banco: string;
  lojas: { id: string; name: string }[];
  carros: {
    id: string;
    dealerId: string;
    title: string;
    price: string;
    mileage: number;
    status: string;
    technicalSpecs: { source?: { id?: unknown } } | null;
  }[];
}

async function main(): Promise<void> {
  const [arquivoSenha] = process.argv
    .slice(2)
    .filter((a) => !a.startsWith('--'));
  if (!arquivoSenha) throw new Error('Informe o arquivo da senha temporária.');
  const senha = readFileSync(arquivoSenha, 'utf8').trim();
  const aplicar = process.argv.includes('--apply');

  const chamar = async <T>(caminho: string, corpo?: unknown): Promise<T> => {
    const resposta = await fetch(`${API}/${caminho}`, {
      method: corpo ? 'POST' : 'GET',
      headers: {
        'x-publicacao-token': senha,
        'content-type': 'application/json',
      },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: AbortSignal.timeout(70_000),
    });
    if (!resposta.ok) {
      const motivo = (await resposta.text()).slice(0, 200);
      throw new Error(`${resposta.status} em /${caminho}: ${motivo}`);
    }
    return (await resposta.json()) as T;
  };

  const copia = await chamar<Copia>('copia');
  mkdirSync(PASTA_COPIA, { recursive: true });
  const marca = new Date().toISOString().replace(/[:.]/g, '-');
  const destino = `${PASTA_COPIA}/carinsight-veiculos-${marca}.json`;
  writeFileSync(destino, JSON.stringify(copia, null, 1));
  const porSituacao = copia.carros.reduce<Record<string, number>>((soma, c) => {
    soma[c.status] = (soma[c.status] ?? 0) + 1;
    return soma;
  }, {});
  console.log(`Banco: ${copia.banco}`);
  console.log(`Lojas: ${copia.lojas.map((l) => l.name).join(', ')}`);
  console.log(`Carros: ${copia.carros.length} ${JSON.stringify(porSituacao)}`);
  console.log(`Cópia gravada em ${destino}`);

  const loja = copia.lojas.find((l) => l.name === DEALER_NAME);
  if (!loja) throw new Error(`Este banco não tem a loja ${DEALER_NAME}.`);
  const existentes: ExistingVehicle[] = copia.carros
    .filter((c) => c.dealerId === loja.id)
    .map((c) => ({
      id: c.id,
      title: c.title,
      price: Number(c.price),
      mileage: c.mileage,
      status: c.status,
      sourceId:
        typeof c.technicalSpecs?.source?.id === 'string'
          ? c.technicalSpecs.source.id
          : null,
    }));

  const listados = parseListing(await fetchText(LISTING_URL));
  const detalhes = await fetchDetails(
    listados.filter((carro) => carro.price !== null),
  );
  assertPlausibleListing(
    listados.length,
    existentes.filter((c) => c.status === 'AVAILABLE').length,
  );
  const plano = planSync(listados, existentes);
  console.log("\n=== Renatinhu's Cars ===");
  printPlan(plano, detalhes);
  console.log('\nCadastro público: endereço em São Paulo, sem telefone.');

  const lote = JSON.parse(readFileSync(ARQUIVO_LOTE, 'utf8')) as Lote;
  const erros = validarLote(lote);
  if (erros.length > 0) throw new Error(`Lote inválido:\n${erros.join('\n')}`);
  console.log(`\n=== ${lote.loja} ===`);
  for (const carro of carrosComFoto(lote)) {
    const dados = dadosDoVeiculo(carro, lote.loja);
    console.log(`  ${dados.title} | R$ ${carro.price} | ${carro.km} km`);
  }
  await conferirMidia(lote);

  if (!aplicar) {
    console.log('\nSimulação: nada foi gravado. Use --apply para gravar.');
    return;
  }

  const semBusca: string[] = [];
  const salvar = async (rotulo: string, corpo: unknown) => {
    const r = await chamar<{ busca: boolean; criado: boolean }>('carro', corpo);
    if (!r.busca) semBusca.push(rotulo);
    console.log(`  ${r.criado ? 'criado' : 'atualizado'}: ${rotulo}`);
  };
  const detalhe = (sourceId: string) => {
    const achado = detalhes.get(sourceId);
    if (!achado) throw new Error(`Detalhe ausente do carro ${sourceId}`);
    return achado;
  };

  // Os novos entram antes de os antigos saírem, para o catálogo nunca ficar vazio.
  for (const carro of plano.create) {
    const dados = buildVehicleData(carro, detalhe(carro.sourceId));
    const bodyType = detectBodyType(parseVehicleName(carro.title).model);
    if (!bodyType) throw new Error(`Sem carroceria: ${carro.title}`);
    await salvar(carro.title, {
      loja: DEALER_NAME,
      dados: { ...dados, bodyType },
      midia: mediaData(detalhe(carro.sourceId)),
    });
  }
  for (const { id, vehicle } of [...plano.update, ...plano.unchanged]) {
    await salvar(vehicle.title, {
      loja: DEALER_NAME,
      id,
      dados: buildVehicleData(vehicle, detalhe(vehicle.sourceId)),
      midia: mediaData(detalhe(vehicle.sourceId)),
    });
  }
  for (const carro of carrosComFoto(lote)) {
    await salvar(dadosDoVeiculo(carro, lote.loja).title, {
      loja: lote.loja,
      criarLoja: true,
      dados: dadosDoVeiculo(carro, lote.loja),
      midia: midiaDoVeiculo(carro),
    });
  }

  for (const [status, carros] of [
    ['SOLD', plano.markSold],
    ['RESERVED', plano.hide],
  ] as const) {
    if (carros.length === 0) continue;
    const r = await chamar<{ alterados: number }>('situacao', {
      loja: DEALER_NAME,
      ids: carros.map((c) => c.id),
      status,
    });
    console.log(`  ${status}: ${r.alterados} carros`);
  }
  await chamar('contato', {
    loja: DEALER_NAME,
    contactInfo: CONTATO_RENATINHUS,
  });
  console.log('  cadastro público da loja atualizado');

  if (semBusca.length > 0) {
    throw new Error(
      `Busca semântica falhou em ${semBusca.length}: ${semBusca.join(', ')}. Rode de novo.`,
    );
  }
  console.log(`\nPublicado. Cópia anterior em ${destino}`);
}

main().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
