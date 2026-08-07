import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return { status: 'ok' };
  }
  getHello(): string {
    return 'Hello World!';
  }
}
