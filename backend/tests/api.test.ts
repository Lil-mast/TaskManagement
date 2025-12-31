import request from 'supertest';
import app from '../src/server';

describe('API Health Check', () => {
  it('should return health status', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200);

    expect(response.body).toHaveProperty('status', 'OK');
    expect(response.body).toHaveProperty('timestamp');
    expect(response.body).toHaveProperty('environment');
  });
});

describe('Authentication Routes', () => {
  it('should return 404 for non-existent auth routes', async () => {
    await request(app)
      .get('/api/auth/nonexistent')
      .expect(404);
  });
});

describe('Tasks Routes', () => {
  it('should return 401 for unauthenticated task access', async () => {
    await request(app)
      .get('/api/tasks')
      .expect(401);
  });
});

describe('Users Routes', () => {
  it('should return 401 for unauthenticated user access', async () => {
    await request(app)
      .get('/api/users/stats')
      .expect(401);
  });
});