import {
  assertPlausibleListing,
  detectBodyType,
  ExistingVehicle,
  ListedVehicle,
  parseDetail,
  parseListing,
  parseVehicleName,
  planSync,
} from './renatinhus.parser';

const card = (
  id: number,
  title: string,
  price: string,
  fuel = 'Flex',
  transmission = 'Manual',
  km = '120.000 Km',
) =>
  `<div class='listing-list-loop'><div class='image'><a href='javascript:Det(${id}, "X");'></a></div>` +
  `<div class='price'><span class='label-preco'>POR: </span><span class='heading-font'>${price}</span></div>` +
  `<div class='title heading-font'><a href='javascript:Det(${id}, "X");'>${title}</a></div>` +
  `<div class='meta-middle-unit fuel'><div class='name'>Combustível</div><div class='value h5'>${fuel}</div></div>` +
  `<div class='meta-middle-unit transmission'><div class='name'>Câmbio</div><div class='value h5'>${transmission}</div></div>` +
  `<div class='meta-middle-unit quilometragem'><div class='name'>Quilometragem</div><div class='value h5'>${km}</div></div>`;

const listed = (overrides: Partial<ListedVehicle> = {}): ListedVehicle => ({
  sourceId: '796',
  title: 'BMW 320I 2.0 16V TB ACTIVE 4P 2014',
  price: 87990,
  mileage: 120000,
  fuel: 'Flex',
  transmission: 'Manual',
  ...overrides,
});

const existing = (
  overrides: Partial<ExistingVehicle> = {},
): ExistingVehicle => ({
  id: 'db-1',
  title: 'BMW 320I 2.0 16V TB ACTIVE 4P 2014',
  price: 87990,
  mileage: 120000,
  status: 'AVAILABLE',
  sourceId: '796',
  ...overrides,
});

describe('parseListing', () => {
  it('lê código, título, preço, km, combustível e câmbio de cada cartão', () => {
    const html = `<html>${card(796, 'BMW 320I 2.0 16V TB ACTIVE 4P 2014', 'R$ 87.990,', 'Flex', 'Automático')}${card(868, 'CHEVROLET CRUZE 1.8 LT 16V 4P 2013', 'R$ 54.990,', 'Gasolina', 'Manual', '146.919 Km')}`;

    expect(parseListing(html)).toEqual([
      listed({ transmission: 'Automático' }),
      {
        sourceId: '868',
        title: 'CHEVROLET CRUZE 1.8 LT 16V 4P 2013',
        price: 54990,
        mileage: 146919,
        fuel: 'Gasolina',
        transmission: 'Manual',
      },
    ]);
  });

  it('devolve preço null para "R$ Consulte"', () => {
    const [vehicle] = parseListing(
      card(10, 'KIA SPORTAGE 2.0 EX 4X2 16V 4P 2010', 'R$ Consulte'),
    );
    expect(vehicle.price).toBeNull();
  });

  it('falha em vez de ignorar um cartão fora do formato', () => {
    expect(() =>
      parseListing("<div class='listing-list-loop'><p>layout novo</p>"),
    ).toThrow('fora do formato');
  });
});

describe('parseDetail', () => {
  const html = `
    <a href='https://www.armazena.net/site_externo/emp_394/fotos/394_796_2-1.jpg'></a>
    <img src='https://www.armazena.net/site_externo/emp_394/fotos/394_796_1-1.jpg'>
    <a href='https://www.armazena.net/site_externo/emp_394/fotos/394_796_1-1.jpg'></a>
    <img src='https://www.armazena.net/site_externo/emp_394/fotos/394_999_1-1.jpg'>
    <div id="tab-opcional"><ul><li><i class='fa-li'></i>AR CONDICIONADO</li><li><i class='fa-li'></i>CÂMERA DE RÉ</li></ul></div>
    <div id="tab-detalhe"><ul><li><i></i>NÃO É OPCIONAL</li></ul></div>
    <input type="hidden" name="txtNovoUsado" id="txtNovoUsado" value="Seminovo" />`;

  it('lista as fotos do veículo em ordem, sem repetir nem misturar outro carro', () => {
    expect(parseDetail(html, '796').photos).toEqual([
      'https://www.armazena.net/site_externo/emp_394/fotos/394_796_1-1.jpg',
      'https://www.armazena.net/site_externo/emp_394/fotos/394_796_2-1.jpg',
    ]);
  });

  it('lê só os opcionais da aba de opcionais', () => {
    expect(parseDetail(html, '796').features).toEqual([
      'AR CONDICIONADO',
      'CÂMERA DE RÉ',
    ]);
  });

  it('só considera novo quando o site diz "Novo"', () => {
    expect(parseDetail(html, '796').condition).toBe('USED');
    expect(
      parseDetail('<input id="txtNovoUsado" value="Novo" />', '1').condition,
    ).toBe('NEW');
  });
});

describe('parseVehicleName', () => {
  it('separa marca, modelo, versão, ano e motor', () => {
    expect(parseVehicleName('BMW 320I 2.0 16V TB ACTIVE 4P 2014')).toEqual({
      make: 'BMW',
      model: '320I',
      version: '2.0 16V TB ACTIVE 4P',
      year: 2014,
      engine: '2.0',
    });
  });

  it('reconhece modelos de duas palavras', () => {
    const name = parseVehicleName(
      'TOYOTA COROLLA CROSS 1.8 VVT-I HYBRID XRV CVT 4P 2022',
    );
    expect(name.model).toBe('COROLLA CROSS');
    expect(detectBodyType(name.model)).toBe('suv');
  });

  it('não inventa motor quando a versão não traz', () => {
    expect(parseVehicleName('VOLKSWAGEN FUSCA 1300 2P 1975').engine).toBeNull();
  });

  it('falha quando o título não termina com o ano', () => {
    expect(() => parseVehicleName('FIAT UNO')).toThrow('sem ano');
  });
});

describe('detectBodyType', () => {
  it('compara o modelo inteiro, sem casar por pedaço do nome', () => {
    expect(detectBodyType('KA')).toBe('hatch');
    expect(detectBodyType('KAPTUR')).toBeNull();
  });
});

describe('planSync', () => {
  it('cria o que é novo no site', () => {
    expect(planSync([listed()], []).create).toEqual([listed()]);
  });

  it('não mexe no que já está igual', () => {
    const plan = planSync([listed()], [existing()]);
    expect(plan.unchanged).toHaveLength(1);
    expect(plan.update).toHaveLength(0);
  });

  it('vincula registro antigo pelo título e atualiza o preço', () => {
    const plan = planSync(
      [listed()],
      [existing({ sourceId: null, price: 80000 })],
    );
    expect(plan.update[0].id).toBe('db-1');
    expect(plan.update[0].changes).toEqual([
      'preço 80000 -> 87990',
      'vincula ao código do site',
    ]);
  });

  it('prefere o código do site ao título, mesmo com carros iguais', () => {
    const plan = planSync(
      [listed({ sourceId: '2' })],
      [
        existing({ id: 'sem-vinculo', sourceId: null }),
        existing({ id: 'vinculado', sourceId: '2' }),
      ],
    );
    expect(plan.unchanged[0].id).toBe('vinculado');
    expect(plan.markSold.map((vehicle) => vehicle.id)).toEqual(['sem-vinculo']);
  });

  it('marca como vendido só o que estava disponível e saiu do site', () => {
    const plan = planSync(
      [],
      [existing(), existing({ id: 'ja-vendido', status: 'SOLD' })],
    );
    expect(plan.markSold.map((vehicle) => vehicle.id)).toEqual(['db-1']);
  });

  it('reativa carro vendido que voltou ao site', () => {
    const plan = planSync([listed()], [existing({ status: 'SOLD' })]);
    expect(plan.update[0].changes).toEqual(['status SOLD -> AVAILABLE']);
  });

  it('não importa carro sem preço e esconde o registro existente', () => {
    const plan = planSync([listed({ price: null })], [existing()]);
    expect(plan.create).toHaveLength(0);
    expect(plan.skippedNoPrice).toHaveLength(1);
    expect(plan.hide.map((vehicle) => vehicle.id)).toEqual(['db-1']);
    expect(plan.markSold).toHaveLength(0);
  });
});

describe('assertPlausibleListing', () => {
  it('aceita estoque menor dentro do esperado', () => {
    expect(() => assertPlausibleListing(23, 32)).not.toThrow();
  });

  it('bloqueia leitura muito menor que o estoque atual', () => {
    expect(() => assertPlausibleListing(10, 32)).toThrow('Nada foi alterado');
  });

  it('bloqueia leitura vazia mesmo com banco vazio', () => {
    expect(() => assertPlausibleListing(0, 0)).toThrow('Nada foi alterado');
  });
});
