import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'crypto';

const TAMANHO_MINIMO = 32;
const digest = (texto: string) => createHash('sha256').update(texto).digest();

/** Sem a senha temporária certa, a rota responde 404, como se não existisse. */
@Injectable()
export class PublicacaoGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const esperado = process.env.PUBLICACAO_TOKEN ?? '';
    const recebido = context.switchToHttp().getRequest<{
      headers: Record<string, unknown>;
    }>().headers['x-publicacao-token'];

    if (
      esperado.length < TAMANHO_MINIMO ||
      typeof recebido !== 'string' ||
      !timingSafeEqual(digest(recebido), digest(esperado))
    ) {
      throw new NotFoundException();
    }
    return true;
  }
}
