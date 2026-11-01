import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';

interface AnalyticsRequest extends Request {
  user?: { sub: string; role: string; via?: string };
}

const isValidApiKey = (request: AnalyticsRequest): boolean => {
  const apiKey = request.headers['x-api-key'];
  return (
    !!process.env.ANALYTICS_API_KEY &&
    typeof apiKey === 'string' &&
    apiKey === process.env.ANALYTICS_API_KEY
  );
};

/**
 * Lê o token do bot no header x-api-key (env ANALYTICS_API_KEY) e, na ausência
 * dele, cai para o fluxo JWT normal (depois o RolesGuard exige ADMIN/DEALER).
 */
@Injectable()
export class AnalyticsAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AnalyticsRequest>();
    if (isValidApiKey(request)) {
      request.user = { sub: 'analytics-bot', role: 'ADMIN', via: 'api-key' };
      return true;
    }
    return super.canActivate(context);
  }
}

/** Ingestão é somente para bots com a chave — nunca anônimo, nunca JWT fraco. */
@Injectable()
export class BotIngestGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AnalyticsRequest>();
    if (isValidApiKey(request)) {
      return true;
    }
    throw new UnauthorizedException('x-api-key inválido ou ausente');
  }
}
