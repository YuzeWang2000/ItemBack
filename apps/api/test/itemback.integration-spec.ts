import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { ApiExceptionFilter } from '../src/common/http-exception.filter';

describe('ItemBack API critical flow (real PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let agent: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.attachment.deleteMany();
    await prisma.movement.deleteMany();
    await prisma.node.deleteMany();
    await prisma.authSession.deleteMany();
    await prisma.user.deleteMany();

    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();
    agent = request.agent(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('protects data and completes login, nesting, cost, move, search, dashboard and attachment operations', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/nodes/tree')
      .expect(401)
      .expect(({ body }) => {
        expect(body.code).toBe('AUTH_REQUIRED');
      });

    await agent
      .post('/api/v1/auth/login')
      .send({ email: 'admin@itemback.test', password: 'wrong-password' })
      .expect(401);
    await agent
      .post('/api/v1/auth/login')
      .send({ email: 'admin@itemback.test', password: 'itemback-test-password' })
      .expect(200)
      .expect('set-cookie', /itemback_session/);

    const home = (await agent.post('/api/v1/spaces').send({ name: '家' }).expect(201)).body;
    const office = (await agent.post('/api/v1/spaces').send({ name: '公司' }).expect(201)).body;
    const acquired = new Date();
    acquired.setUTCDate(acquired.getUTCDate() - 59);
    const bag = (
      await agent
        .post('/api/v1/items')
        .send({
          name: '书包',
          parentId: home.id,
          isContainer: true,
          valueAmount: '600.00',
          currency: 'CNY',
          acquiredDate: acquired.toISOString().slice(0, 10),
        })
        .expect(201)
    ).body;
    expect(bag.holdingDays).toBe(60);
    expect(bag.dailyCost).toBe('10.0000');

    const book = (
      await agent.post('/api/v1/items').send({ name: '书', parentId: bag.id }).expect(201)
    ).body;
    expect(book.valueAmount).toBeNull();
    expect(book.dailyCost).toBeNull();
    await agent
      .post('/api/v1/items')
      .send({ name: '非法子物品', parentId: book.id })
      .expect(409)
      .expect(({ body }) => {
        expect(body.code).toBe('PARENT_NOT_CONTAINER');
      });

    const pouch = (
      await agent
        .post('/api/v1/items')
        .send({ name: '内袋', parentId: bag.id, isContainer: true })
        .expect(201)
    ).body;
    await agent
      .post(`/api/v1/nodes/${bag.id}/move`)
      .send({ toParentId: pouch.id })
      .expect(409)
      .expect(({ body }) => {
        expect(body.code).toBe('MOVE_TO_DESCENDANT');
      });

    const movedBook = (
      await agent
        .post(`/api/v1/nodes/${book.id}/move`)
        .send({ toParentId: office.id, note: '带到公司' })
        .expect(201)
    ).body;
    expect(movedBook.path.map((part: { name: string }) => part.name)).toEqual(['公司', '书']);
    const history = (await agent.get(`/api/v1/nodes/${book.id}/movements`).expect(200)).body;
    expect(history[0]).toMatchObject({
      fromParent: { name: '书包' },
      toParent: { name: '公司' },
      note: '带到公司',
    });

    const uploaded = (
      await agent
        .post(`/api/v1/items/${book.id}/attachments`)
        .field('category', 'MANUAL')
        .field('description', '集成测试说明书')
        .attach('files', Buffer.from('%PDF-1.4 test'), {
          filename: 'manual.pdf',
          contentType: 'application/pdf',
        })
        .attach('files', Buffer.from('<html>unsafe</html>'), {
          filename: '../unsafe.html',
          contentType: 'text/html',
        })
        .attach('files', Buffer.from('fake png bytes'), {
          filename: '物品照片.png',
          contentType: 'image/png',
        })
        .expect(201)
    ).body;
    expect(uploaded).toHaveLength(3);
    expect(uploaded[0]).not.toHaveProperty('storageKey');
    expect(uploaded[1].originalFilename).toBe('unsafe.html');
    expect(uploaded[2].originalFilename).toBe('物品照片.png');
    await agent
      .get(`/api/v1/attachments/${uploaded[1].id}/content`)
      .expect(200)
      .expect('Content-Type', /application\/octet-stream/)
      .expect('Content-Disposition', /^attachment/);
    const listed = (await agent.get(`/api/v1/items/${book.id}/attachments`).expect(200)).body;
    expect(listed).toHaveLength(3);
    const officeChildren = (await agent.get(`/api/v1/nodes/${office.id}/children`).expect(200))
      .body;
    expect(officeChildren.find((item: { id: string }) => item.id === book.id)).toMatchObject({
      coverAttachmentId: uploaded[2].id,
    });
    await agent.delete(`/api/v1/attachments/${uploaded[0].id}`).expect(200);

    const search = (await agent.get('/api/v1/search').query({ q: '  书  ' }).expect(200)).body;
    expect(search.items[0].path.map((part: { name: string }) => part.name)).toEqual(['公司', '书']);
    const dashboard = (await agent.get('/api/v1/dashboard').expect(200)).body;
    expect(dashboard).toMatchObject({ itemCount: 3, spaceCount: 2 });
    expect(dashboard.valueTotals).toContainEqual({ currency: 'CNY', amount: '600.00' });

    await agent
      .delete(`/api/v1/nodes/${bag.id}`)
      .expect(409)
      .expect(({ body }) => {
        expect(body.code).toBe('NODE_NOT_EMPTY');
      });
    await agent.post('/api/v1/auth/logout').expect(204);
    await agent.get('/api/v1/dashboard').expect(401);
  });
});
