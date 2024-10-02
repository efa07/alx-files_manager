import redisClient from '../utils/redis';
import dbClient from '../utils/db';

class AppController {
  static getStatus(req, res) {
    // Return the status of Redis and DB
    res.status(200).json({
      redis: redisClient.isAlive(),
      db: dbClient.isAlive(),
    });
  }

  static async getStats(req, res) {
    // Return the count of users and files in the DB
    const users = await dbClient.nbUsers();
    const files = await dbClient.nbFiles();
    res.status(200).json({
      users,
      files,
    });
  }
}

export default AppController;
