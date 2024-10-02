const { expect } = require('chai');
const sinon = require('sinon');
const redisClient = require('../utils/redis');

describe('redisClient', () => {
  it('should connect to Redis', () => {
    const connectSpy = sinon.spy(redisClient.client, 'on');
    redisClient.client.emit('connect');
    expect(connectSpy.calledWith('connect')).to.be.true;
    connectSpy.restore();
  });

  it('should set and get a key', async () => {
    await redisClient.set('test_key', 'test_value');
    const value = await redisClient.get('test_key');
    expect(value).to.equal('test_value');
  });

  it('should delete a key', async () => {
    await redisClient.set('test_key', 'test_value');
    await redisClient.del('test_key');
    const value = await redisClient.get('test_key');
    expect(value).to.be.null;
  });
});
