// Gera um badge SVG de cobertura (linhas) a partir de coverage/coverage-summary.json.
// Self-contained: sem dependências externas nem chamadas de rede. Escrito em
// .github/badges/coverage.svg e commitado pelo CI no push da develop (PC-091).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const { total } = JSON.parse(readFileSync('coverage/coverage-summary.json', 'utf8'));
const pct = Math.round(total.lines.pct);

const color =
  pct >= 80
    ? '#4c1'
    : pct >= 60
      ? '#97ca00'
      : pct >= 40
        ? '#dfb317'
        : pct >= 20
          ? '#fe7d37'
          : '#e05d44';

const label = 'coverage';
const value = `${pct}%`;
const labelW = 61;
const valueW = value.length * 9 + 10;
const w = labelW + valueW;
const labelX = (labelW / 2) * 10;
const valueX = (labelW + valueW / 2) * 10;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${label}: ${value}"><title>${label}: ${value}</title><linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient><clipPath id="r"><rect width="${w}" height="20" rx="3" fill="#fff"/></clipPath><g clip-path="url(#r)"><rect width="${labelW}" height="20" fill="#555"/><rect x="${labelW}" width="${valueW}" height="20" fill="${color}"/><rect width="${w}" height="20" fill="url(#s)"/></g><g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="110" text-rendering="geometricPrecision"><text x="${labelX}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${(labelW - 12) * 10}">${label}</text><text x="${labelX}" y="140" transform="scale(.1)" textLength="${(labelW - 12) * 10}">${label}</text><text x="${valueX}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${(valueW - 12) * 10}">${value}</text><text x="${valueX}" y="140" transform="scale(.1)" textLength="${(valueW - 12) * 10}">${value}</text></g></svg>`;

mkdirSync('.github/badges', { recursive: true });
writeFileSync('.github/badges/coverage.svg', `${svg}\n`);
console.log(`coverage badge atualizado: ${value} (linhas)`);
