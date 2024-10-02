import { ObjectId } from 'mongodb';
import sha1 from 'sha1';
import dbClient from '../utils/db';

class UsersController {
  static async postNew(req, res) {
    const { email, password } = req.body;

    // Check if email is provided
    if (!email) {
      return res.status(400).json({ error: 'Missing email' });
    }

    // Check if password is provided
    if (!password) {
      return res.status(400).json({ error: 'Missing password' });
    }

    // Check if user already exists in the database
    const existingUser = await dbClient.db.collection('users').findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Already exist' });
    }

    // Hash the password using SHA1
    const hashedPassword = sha1(password);

    // Insert the new user into the database
    const newUser = {
      email,
      password: hashedPassword,
    };

    const result = await dbClient.db.collection('users').insertOne(newUser);

    // Return the newly created user with the email and id only
    return res.status(201).json({
      id: result.insertedId,
      email,
    });
  }
}

export default UsersController;
