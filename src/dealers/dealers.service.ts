import { Injectable } from '@nestjs/common';
import { CreateDealerDto } from './dto/create-dealer.dto';
import { UpdateDealerDto } from './dto/update-dealer.dto';

@Injectable()
export class DealersService {
  create(createDealerDto: CreateDealerDto) {
    return 'This action adds a new dealer';
  }

  findAll() {
    return `This action returns all dealers`;
  }

  findOne(id: number) {
    return `This action returns a #${id} dealer`;
  }

  update(id: number, updateDealerDto: UpdateDealerDto) {
    return `This action updates a #${id} dealer`;
  }

  remove(id: number) {
    return `This action removes a #${id} dealer`;
  }
}
