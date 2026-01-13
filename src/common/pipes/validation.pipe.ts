import {
  PipeTransform,
  Injectable,
  ArgumentMetadata,
  BadRequestException,
} from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

/**
 * Pipe de validação customizado que usa class-validator
 * para validar DTOs de entrada
 */
@Injectable()
export class ValidationPipe implements PipeTransform<any> {
  async transform(value: any, { metatype }: ArgumentMetadata) {
    // Se não houver metatype ou for um tipo nativo, retorna o valor sem validação
    if (!metatype || !this.toValidate(metatype)) {
      return value;
    }

    // Converte o objeto plain para a classe DTO
    const object = plainToInstance(metatype, value);

    // Valida o objeto usando class-validator
    const errors = await validate(object, {
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

    return object;
  }

  /**
   * Verifica se o metatype deve ser validado
   */
  private toValidate(metatype: Function): boolean {
    const types: Function[] = [String, Boolean, Number, Array, Object];
    return !types.includes(metatype);
  }
}
