const { expect } = require('chai');
const dbClient = require('../utils/db');

describe('dbClient', () => {
  it('should connect to the database', () => {
    expect(dbClient.isAlive()).to.be.true;
  });

  it('should return the correct number of documents in a collection', async () => {
    const usersCount = await dbClient.nbUsers();
    expect(usersCount).to.be.a('number');
  });

  it('should return the correct number of files', async () => {
    const filesCount = await dbClient.nbFiles();
    expect(filesCount).to.be.a('number');
  });
});
