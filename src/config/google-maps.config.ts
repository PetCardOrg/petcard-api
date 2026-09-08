import { registerAs } from '@nestjs/config';
import { inteiroPositivo } from './throttler.config';

/** Mesmo piso do validador de CRMV — Google lento não deve pendurar o handler. */
const DEFAULT_TIMEOUT_MS = 15000;

export const googleMapsConfig = registerAs('googleMaps', () => ({
  apiKey: process.env.GOOGLE_MAPS_API_KEY,
  timeoutMs: inteiroPositivo(
    process.env.GOOGLE_MAPS_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS,
  ),
}));
