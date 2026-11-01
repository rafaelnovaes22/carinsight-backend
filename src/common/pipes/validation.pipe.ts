import {
  PipeTransform,
  Injectable,
  ArgumentMetadata,
  BadRequestException,
} from '@nestjs/common';
import { validate, ValidationError } from 'class-validator';
import { plainToInstance } from 'class-transformer';

/**
 * Pipe de validação customizado que usa class-validator
 * para validar DTOs de entrada
 */

type ClassConstructor = new (...args: unknown[]) => object;

@Injectable()
export class ValidationPipe implements PipeTransform<unknown, Promise<object>> {
  async transform(
    value: unknown,
    { metatype }: ArgumentMetadata,
  ): Promise<object> {
    // Se não houver metatype ou for um tipo nativo, retorna o valor sem validação
    if (!metatype || !this.toValidate(metatype)) {
      return value as object;
    }

    // Converte o objeto plain para a classe DTO
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const object = plainToInstance(metatype, value as object);

    // Valida o objeto usando class-validator
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const errors: ValidationError[] = await validate(object, {
      whitelist: true, // Remove propriedades não decoradas
      forbidNonWhitelisted: true, // Lança erro se houver propriedades não permitidas
      skipMissingProperties: false, // Não pula propriedades faltando
    });

    if (errors.length > 0) {
      // Formata as mensagens de erro
      const messages = errors.map((error) => ({
        field: error.property,
        errors: Object.values(error.constraints || {}),
      }));

      throw new BadRequestException({
        statusCode: 400,
        message: 'Validation failed',
        errors: messages,
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return object;
  }

  /**
   * Verifica se o metatype deve ser validado
   */
  private toValidate(metatype: ClassConstructor): boolean {
    const types: ClassConstructor[] = [String, Boolean, Number, Array, Object];
    return !types.includes(metatype);
  }
}
