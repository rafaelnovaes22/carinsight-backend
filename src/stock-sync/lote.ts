/**
 * Lote de carros recebidos fora do site da loja, como fichas e fotos por WhatsApp.
 * Só entra o que tem preço, quilometragem e foto, e o que afeta a compra fica visível.
 */

export interface CarroLote {
  id: string;
  make: string;
  model: string;
  version?: string;
  yearFab: number;
  yearModel: number;
  cor?: string;
  km: number;
  price: number;
  bodyType: string;
  transmission?: string;
  fuel?: string;
  engine?: string;
  leilao?: boolean;
  features: string[];
  fotos: string[];
  video?: string;
}

export interface Lote {
  loja: string;
  carros: CarroLote[];
}

const BASE_DAS_FOTOS = 'https://www.carinsight.com.br/assets/carros/';
const TELEFONE =
  /(?<!\d)(?:\+?55[\s.-]*)?\(?\d{2}\)?[\s.-]*9?[\s.-]*\d{4}[\s.-]*\d{4}(?!\d)/;

/** Carro sem foto não bloqueia o lote: fica de fora até a foto chegar. */
export const carrosComFoto = (lote: Lote): CarroLote[] =>
  lote.carros.filter((carro) => carro.fotos.length > 0);

export function validarLote(lote: Lote): string[] {
  const erros: string[] = [];
  if (!lote.loja?.trim()) erros.push('lote sem loja');
  const ids = new Set<string>();

  for (const carro of lote.carros) {
    const nome = carro.id;
    if (ids.has(nome)) erros.push(`${nome}: id repetido`);
    ids.add(nome);
    if (!(carro.price > 0)) erros.push(`${nome}: sem preço`);
    if (!(carro.km > 0)) erros.push(`${nome}: sem quilometragem`);
    if (carro.yearFab > carro.yearModel) {
      erros.push(`${nome}: ano de fabricação maior que o do modelo`);
    }
    if (new Set(carro.fotos).size !== carro.fotos.length) {
      erros.push(`${nome}: foto repetida`);
    }
    for (const url of [...carro.fotos, ...(carro.video ? [carro.video] : [])]) {
      if (!url.startsWith(BASE_DAS_FOTOS))
        erros.push(`${nome}: mídia fora do site: ${url}`);
    }
    const textos = [carro.version ?? '', ...carro.features].join(' ');
    if (TELEFONE.test(textos)) erros.push(`${nome}: telefone no texto`);
    if (carro.leilao && !/leil[ãa]o/i.test(carro.version ?? '')) {
      erros.push(
        `${nome}: a passagem por leilão precisa aparecer no nome do carro`,
      );
    }
    if (
      carro.leilao &&
      !carro.features.some((item) => /leil[ãa]o/i.test(item))
    ) {
      erros.push(`${nome}: a passagem por leilão precisa aparecer nos itens`);
    }
  }
  return erros;
}

export function dadosDoVeiculo(carro: CarroLote, loja: string) {
  const nome = [carro.make, carro.model, carro.version]
    .filter(Boolean)
    .join(' ');
  return {
    title: `${nome} ${carro.yearModel}`,
    make: carro.make,
    model: carro.model,
    version: carro.version ?? null,
    yearFab: carro.yearFab,
    yearModel: carro.yearModel,
    price: carro.price,
    mileage: carro.km,
    condition: 'USED' as const,
    bodyType: carro.bodyType,
    technicalSpecs: {
      ...(carro.engine ? { engine: carro.engine } : {}),
      ...(carro.transmission ? { transmission: carro.transmission } : {}),
      ...(carro.fuel ? { fuel: carro.fuel } : {}),
      ...(carro.cor ? { color: carro.cor } : {}),
      source: { site: 'whatsapp', loja, id: carro.id },
    },
    features: carro.features,
    status: 'AVAILABLE' as const,
  };
}

export function midiaDoVeiculo(carro: CarroLote) {
  return [
    ...carro.fotos.map((url, order) => ({
      url,
      order,
      type: 'IMAGE' as const,
    })),
    ...(carro.video
      ? [
          {
            url: carro.video,
            order: carro.fotos.length,
            type: 'VIDEO' as const,
          },
        ]
      : []),
  ];
}
