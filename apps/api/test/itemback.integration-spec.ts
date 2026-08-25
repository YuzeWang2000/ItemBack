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
    await prisma.tag.deleteMany();
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
    const emptySpace = (
      await agent.post('/api/v1/spaces').send({ name: '待删除空空间' }).expect(201)
    ).body;
    await agent
      .delete(`/api/v1/nodes/${emptySpace.id}`)
      .expect(200)
      .expect(({ body }) => expect(body).toMatchObject({ deleted: true }));
    expect((await agent.get('/api/v1/spaces').expect(200)).body).not.toContainEqual(
      expect.objectContaining({ id: emptySpace.id }),
    );
    const acquired = new Date();
    acquired.setUTCDate(acquired.getUTCDate() - 59);
    const expiry = new Date();
    expiry.setUTCHours(0, 0, 0, 0);
    expiry.setUTCDate(expiry.getUTCDate() + 30);
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
          expiryDate: expiry.toISOString().slice(0, 10),
          tags: ['通勤', '日常'],
        })
        .expect(201)
    ).body;
    expect(bag.holdingDays).toBe(60);
    expect(bag.dailyCost).toBe('10.0000');
    expect(bag.expiryDate).toBe(expiry.toISOString().slice(0, 10));
    expect(bag.tags.map((tag: { name: string }) => tag.name)).toEqual(['日常', '通勤']);

    const book = (
      await agent
        .post('/api/v1/items')
        .send({
          name: '书',
          parentId: bag.id,
          expiryDate: expiry.toISOString().slice(0, 10),
          tags: ['阅读', '日常'],
        })
        .expect(201)
    ).body;
    expect(book.valueAmount).toBeNull();
    expect(book.dailyCost).toBeNull();
    const tagList = (await agent.get('/api/v1/tags').expect(200)).body;
    const dailyTag = tagList.find((tag: { name: string }) => tag.name === '日常');
    const readingTag = tagList.find((tag: { name: string }) => tag.name === '阅读');
    expect(dailyTag.itemCount).toBe(2);
    const dailyItems = (await agent.get('/api/v1/items').query({ tags: dailyTag.id }).expect(200))
      .body;
    expect(dailyItems.total).toBe(2);
    const exactTaggedItems = (
      await agent
        .get('/api/v1/items')
        .query({ tags: `${dailyTag.id},${readingTag.id}` })
        .expect(200)
    ).body;
    expect(exactTaggedItems.items.map((item: { id: string }) => item.id)).toEqual([book.id]);
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
    const alternatePhoto = (
      await agent
        .post(`/api/v1/items/${book.id}/attachments`)
        .field('category', 'PHOTO')
        .attach('files', Buffer.from('fake jpg bytes'), {
          filename: '物品侧面.jpg',
          contentType: 'image/jpeg',
        })
        .expect(201)
    ).body[0];
    await agent
      .patch(`/api/v1/items/${book.id}/cover/${uploaded[0].id}`)
      .expect(404)
      .expect(({ body }) => expect(body.code).toBe('PREVIEW_IMAGE_NOT_FOUND'));
    await agent
      .patch(`/api/v1/items/${book.id}/cover/${alternatePhoto.id}`)
      .expect(200)
      .expect(({ body }) => expect(body.coverAttachmentId).toBe(alternatePhoto.id));
    expect((await agent.get(`/api/v1/nodes/${book.id}`).expect(200)).body.coverAttachmentId).toBe(
      alternatePhoto.id,
    );
    await agent.delete(`/api/v1/attachments/${alternatePhoto.id}`).expect(200);
    expect((await agent.get(`/api/v1/nodes/${book.id}`).expect(200)).body.coverAttachmentId).toBe(
      uploaded[2].id,
    );

    const editedBook = (
      await agent
        .patch(`/api/v1/nodes/${book.id}`)
        .send({ tags: ['阅读', '办公'], expiryDate: expiry.toISOString().slice(0, 10) })
        .expect(200)
    ).body;
    expect(editedBook.tags.map((tag: { name: string }) => tag.name)).toEqual(['办公', '阅读']);
    const officeTag = (await agent.get('/api/v1/tags').expect(200)).body.find(
      (tag: { name: string }) => tag.name === '办公',
    );
    expect(
      (await agent.get('/api/v1/items').query({ tags: officeTag.id }).expect(200)).body.total,
    ).toBe(1);
    await agent.delete(`/api/v1/attachments/${uploaded[0].id}`).expect(200);

    const search = (await agent.get('/api/v1/search').query({ q: '  书  ' }).expect(200)).body;
    expect(search.items[0].path.map((part: { name: string }) => part.name)).toEqual(['公司', '书']);
    const tagSearch = (await agent.get('/api/v1/search').query({ q: '办公' }).expect(200)).body;
    expect(tagSearch.items.map((item: { id: string }) => item.id)).toContain(book.id);
    const dashboard = (await agent.get('/api/v1/dashboard').expect(200)).body;
    expect(dashboard).toMatchObject({ itemCount: 3, spaceCount: 2 });
    expect(dashboard.valueTotals).toContainEqual({ currency: 'CNY', amount: '600.00' });

    await agent
      .delete(`/api/v1/nodes/${home.id}`)
      .expect(409)
      .expect(({ body }) => {
        expect(body.code).toBe('NODE_NOT_EMPTY');
        expect(body.message).toContain('清空后才能删除');
      });

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
