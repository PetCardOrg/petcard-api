import { registerAs } from '@nestjs/config';

export const authConfig = registerAs('auth', () => ({
  domain: process.env.AUTH0_DOMAIN,
  audience: process.env.AUTH0_AUDIENCE,
  clientId: process.env.AUTH0_CLIENT_ID,
  clientSecret: process.env.AUTH0_CLIENT_SECRET,
  issuerUrl: `https://${process.env.AUTH0_DOMAIN}/`,
  jwksUri: `https://${process.env.AUTH0_DOMAIN}/.well-known/jwks.json`,
}));
