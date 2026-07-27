import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AuditService } from './audit.service';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function sanitize(body: unknown): unknown {
  if (!body || typeof body !== 'object') return undefined;
  const clone: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    clone[k] = /password|secret|token/i.test(k) ? '***' : v;
  }
  return Object.keys(clone).length ? clone : undefined;
}

/** Records every successful mutating API call into the audit trail. */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    if (!MUTATING.has(req.method)) return next.handle();

    const path: string = req.route?.path ?? req.url;
    const segments = (req.originalUrl || path).split('?')[0].split('/').filter(Boolean);
    const resource = segments[1] ?? 'unknown';

    return next.handle().pipe(
      tap((response) => {
        const userId: string | undefined = req.user?.id ?? (response as any)?.user?.id;
        void this.audit.log({
          userId,
          action: `${req.method} ${path}`,
          resource,
          resourceId: req.params?.id ?? req.params?.cameraId,
          details: sanitize(req.body),
          ip: req.ip,
        });
      }),
    );
  }
}
