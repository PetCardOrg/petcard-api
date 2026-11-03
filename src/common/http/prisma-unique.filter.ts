import { ArgumentsHost, Catch, ConflictException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '@prisma/client';

/** Código do Prisma para violação de unique. */
const UNIQUE_VIOLADA = 'P2002';

function mensagem(target: unknown): string {
  const campos = Array.isArray(target) ? target.join(',') : String(target);
  if (campos.includes('crmv')) return 'CRMV already registered';
  if (campos.includes('email')) return 'Email already registered';
  return 'Resource already exists';
}

/**
 * Violação de unique vira 409, não 500 (AUD API-19).
 *
 * Os services conferem e-mail e CRMV antes de gravar, mas duas requisições
 * podem passar juntas pela checagem e a segunda estoura a constraint no banco.
 * A mensagem é a mesma da checagem, para o cliente tratar os dois casos igual.
 * Qualquer outro erro segue o tratamento padrão do Nest.
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaUniqueFilter extends BaseExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    if (exception.code !== UNIQUE_VIOLADA) {
      return super.catch(exception, host);
    }
    return super.catch(
      new ConflictException(mensagem(exception.meta?.target)),
      host,
    );
  }
}
