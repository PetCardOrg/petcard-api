import { ForbiddenException } from '@nestjs/common';
import { assertPodeEditar, assertPodeRemover } from '../autoria-clinica';

const doTutor = { veterinarioId: null };
const daCamila = { veterinarioId: 'vet-camila' };

describe('autoria de registro clínico (web#34)', () => {
  describe('editar', () => {
    it('o tutor edita o que ele mesmo declarou', () => {
      expect(() => assertPodeEditar(doTutor, 'tutor-1', false)).not.toThrow();
    });

    it('o veterinário edita a própria prescrição', () => {
      expect(() =>
        assertPodeEditar(daCamila, 'vet-camila', true),
      ).not.toThrow();
    });

    it('o tutor não edita a prescrição do veterinário', () => {
      // Editar mantendo a assinatura alheia falsificaria a autoria: a carteira
      // seguiria dizendo "prescrito por Dra. Camila" com outra dosagem.
      expect(() => assertPodeEditar(daCamila, 'tutor-1', false)).toThrow(
        ForbiddenException,
      );
    });

    it('um veterinário não edita a prescrição de outro', () => {
      expect(() => assertPodeEditar(daCamila, 'vet-outro', true)).toThrow(
        ForbiddenException,
      );
    });

    it('o veterinário não edita o que o tutor declarou', () => {
      expect(() => assertPodeEditar(doTutor, 'vet-camila', true)).toThrow(
        ForbiddenException,
      );
    });

    it('trata coluna ausente como registro do tutor', () => {
      // Defensivo: o Prisma sempre traz a coluna, mas `undefined` não pode
      // virar "registro de veterinário" e travar o tutor no próprio registro.
      expect(() => assertPodeEditar({}, 'tutor-1', false)).not.toThrow();
    });
  });

  describe('remover', () => {
    it('o tutor remove o que ele mesmo declarou', () => {
      expect(() => assertPodeRemover(doTutor, 'tutor-1', false)).not.toThrow();
    });

    it('o tutor remove a prescrição que decidiu não seguir', () => {
      // Caso central da api#117. A exclusão é lógica: sai da carteira dele e
      // permanece no histórico, registrada em seu nome.
      expect(() => assertPodeRemover(daCamila, 'tutor-1', false)).not.toThrow();
    });

    it('o veterinário remove a própria prescrição', () => {
      expect(() =>
        assertPodeRemover(daCamila, 'vet-camila', true),
      ).not.toThrow();
    });

    it('um veterinário não remove a prescrição de outro', () => {
      expect(() => assertPodeRemover(daCamila, 'vet-outro', true)).toThrow(
        ForbiddenException,
      );
    });

    it('o veterinário não remove o que o tutor declarou', () => {
      expect(() => assertPodeRemover(doTutor, 'vet-camila', true)).toThrow(
        ForbiddenException,
      );
    });
  });
});
