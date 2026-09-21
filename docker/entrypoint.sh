#!/bin/sh
# Roda as migrations pendentes a cada deploy (Render free não tem
# "pre-deploy command" separado do start) e só então sobe a API.
set -e

npx prisma migrate deploy

exec node dist/src/main.js
