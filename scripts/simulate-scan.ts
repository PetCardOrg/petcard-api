type Args = Record<string, string | boolean>;

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (const raw of argv) {
    if (!raw.startsWith('--')) continue;
    const [key, ...rest] = raw.slice(2).split('=');
    args[key] = rest.length ? rest.join('=') : true;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const API = String(args.api ?? process.env.API_URL ?? 'http://localhost:3000');

function required(name: string): string {
  const value = args[name];
  if (typeof value !== 'string' || !value) {
    console.error(
      `Faltou --${name}. Ex.: npm run scan:simulate -- --email=a@b.com --password=segredo`,
    );
    process.exit(1);
  }
  return value;
}

async function call<T>(
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, ...rest } = init;
  const response = await fetch(`${API}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(rest.headers ?? {}),
    },
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      `${init.method ?? 'GET'} ${path} → ${response.status}\n${body}`,
    );
  }
  return (body ? JSON.parse(body) : undefined) as T;
}

async function main(): Promise<void> {
  const email = required('email');
  const password = required('password');

  console.log(`API: ${API}\n`);

  const login = await call<{ access_token: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  console.log('1/4  login ok');

  let petId = typeof args.pet === 'string' ? args.pet : undefined;
  if (!petId) {
    const pets = await call<{ id: string; nome?: string; name?: string }[]>(
      '/pets',
      {
        token: login.access_token,
      },
    );
    if (pets.length === 0) {
      console.error(
        'Nenhum pet cadastrado para este tutor — cadastre um antes.',
      );
      process.exit(1);
    }
    petId = pets[0].id;
    console.log(
      `2/4  pet: ${pets[0].nome ?? pets[0].name ?? petId} (${petId})`,
    );
  } else {
    console.log(`2/4  pet: ${petId} (informado)`);
  }

  const tag = await call<{ public_url: string }>(`/coleira/pets/${petId}/tag`, {
    token: login.access_token,
  });
  // `public_url` é `${base}/${token}` — o token é o último segmento.
  const collarToken = tag.public_url.split('/').filter(Boolean).pop()!;
  console.log(`3/4  coleira: ${tag.public_url}`);

  const semLocal = args['sem-local'] === true;
  const payload = semLocal
    ? {}
    : {
        latitude: Number(args.lat ?? -3.7327),
        longitude: Number(args.lng ?? -38.5267),
        accuracy_meters: 20,
      };

  const scan = await call<{ id?: string }>(`/coleira/${collarToken}/leitura`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  console.log(`4/4  leitura registrada${scan?.id ? ` (scan ${scan.id})` : ''}`);
  console.log(
    semLocal
      ? '\nPush enviada sem localização. Confira o celular.'
      : '\nPush enviada com localização. Confira o celular.',
  );
  console.log(
    'Se não chegar: veja o log da API (FcmClient) e a tabela `notification` — ' +
      'status PENDING significa que a fila não consumiu; FAILED traz o errorCode do FCM.',
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
