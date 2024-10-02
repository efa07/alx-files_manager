const uuid = require('uuid').v4;
const fs = require('fs');
const path = require('path');
const redisClient = require('../utils/redis');
const dbClient = require('../utils/db');
const mime = require('mime-types');
const { ObjectId } = require('mongodb');
const fileQueue = new Queue('fileQueue');


const FOLDER_PATH = process.env.FOLDER_PATH || '/tmp/files_manager';

class FilesController {
    static async postUpload(req, res) {
        const token = req.header('X-Token');
        if (!token) return res.status(401).json({ error: 'Unauthorized' });
    
        const userId = await redisClient.get(`auth_${token}`);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    
        const { name, type, parentId = 0, isPublic = false, data } = req.body;
        if (!name) return res.status(400).json({ error: 'Missing name' });
        if (!['folder', 'file', 'image'].includes(type)) return res.status(400).json({ error: 'Missing type' });
        if (type !== 'folder' && !data) return res.status(400).json({ error: 'Missing data' });
    
        let parentFile = null;
        if (parentId) {
          parentFile = await dbClient.collection('files').findOne({ _id: new ObjectId(parentId) });
          if (!parentFile) return res.status(400).json({ error: 'Parent not found' });
          if (parentFile.type !== 'folder') return res.status(400).json({ error: 'Parent is not a folder' });
        }
    
        if (type === 'folder') {
          const newFolder = { userId, name, type, isPublic, parentId };
          const result = await dbClient.collection('files').insertOne(newFolder);
          return res.status(201).json(result.ops[0]);
        }
    
        // Save the image file
        const fileId = uuid();
        const localPath = path.join(FOLDER_PATH, fileId);
        const buffer = Buffer.from(data, 'base64');
        
        if (!fs.existsSync(FOLDER_PATH)) {
          fs.mkdirSync(FOLDER_PATH, { recursive: true });
        }
    
        fs.writeFileSync(localPath, buffer);
    
        const newFile = { userId, name, type, isPublic, parentId, localPath };
        const result = await dbClient.collection('files').insertOne(newFile);
    
        // Add job to Bull queue for generating thumbnails if the file type is image
        if (type === 'image') {
          fileQueue.add({ userId, fileId: result.ops[0]._id });
        }
    
        return res.status(201).json(result.ops[0]);
      }    

    // GET /files/:id
    static async getShow(req, res) {
        const token = req.header('X-Token');
        if (!token) return res.status(401).json({ error: 'Unauthorized' });

        // Retrieve user from token
        const userId = await redisClient.get(`auth_${token}`);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const fileId = req.params.id;

        // Retrieve file based on ID and userId
        const file = await dbClient.collection('files').findOne({ _id: new ObjectId(fileId), userId });
        if (!file) return res.status(404).json({ error: 'Not found' });

        return res.status(200).json(file);
    }

    // GET /files
    static async getIndex(req, res) {
        const token = req.header('X-Token');
        if (!token) return res.status(401).json({ error: 'Unauthorized' });

        // Retrieve user from token
        const userId = await redisClient.get(`auth_${token}`);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        // Get query parameters (parentId and page)
        const parentId = req.query.parentId || 0;
        let page = parseInt(req.query.page, 10);
        if (isNaN(page) || page < 0) page = 0;

        const pageSize = 20;
        const skip = page * pageSize;

        // Retrieve files with pagination
        const files = await dbClient.collection('files')
            .find({ userId, parentId })
            .skip(skip)
            .limit(pageSize)
            .toArray();

        return res.status(200).json(files);
    }

    // PUT /files/:id/publish
    static async putPublish(req, res) {
        const token = req.header('X-Token');
        if (!token) return res.status(401).json({ error: 'Unauthorized' });

        // Retrieve user from token
        const userId = await redisClient.get(`auth_${token}`);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const fileId = req.params.id;

        // Find the file linked to the userId and fileId
        const file = await dbClient.collection('files').findOne({ _id: new ObjectId(fileId), userId });
        if (!file) return res.status(404).json({ error: 'Not found' });

        // Update isPublic to true
        await dbClient.collection('files').updateOne(
            { _id: new ObjectId(fileId), userId },
            { $set: { isPublic: true } }
        );

        // Return updated file document
        const updatedFile = await dbClient.collection('files').findOne({ _id: new ObjectId(fileId), userId });
        return res.status(200).json(updatedFile);
    }

    // PUT /files/:id/unpublish
    static async putUnpublish(req, res) {
        const token = req.header('X-Token');
        if (!token) return res.status(401).json({ error: 'Unauthorized' });

        // Retrieve user from token
        const userId = await redisClient.get(`auth_${token}`);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const fileId = req.params.id;

        // Find the file linked to the userId and fileId
        const file = await dbClient.collection('files').findOne({ _id: new ObjectId(fileId), userId });
        if (!file) return res.status(404).json({ error: 'Not found' });

        // Update isPublic to false
        await dbClient.collection('files').updateOne(
            { _id: new ObjectId(fileId), userId },
            { $set: { isPublic: false } }
        );

        // Return updated file document
        const updatedFile = await dbClient.collection('files').findOne({ _id: new ObjectId(fileId), userId });
        return res.status(200).json(updatedFile);
    }

    // GET /files/:id/data
    static async getFile(req, res) {
        const token = req.header('X-Token');
        const fileId = req.params.id;

        if (!token) return res.status(401).json({ error: 'Unauthorized' });

        // Retrieve user from token
        const userId = await redisClient.get(`auth_${token}`);
        
        // Retrieve file based on ID
        const file = await dbClient.collection('files').findOne({ _id: new ObjectId(fileId) });
        if (!file) return res.status(404).json({ error: 'Not found' });

        // Check if the file is public or the user is the owner
        if (!file.isPublic && (!userId || file.userId !== userId)) {
            return res.status(404).json({ error: 'Not found' });
        }

        // Check if the file is a folder
        if (file.type === 'folder') {
            return res.status(400).json({ error: "A folder doesn't have content" });
        }

        // Check if the file exists locally
        if (!fs.existsSync(file.localPath)) {
            return res.status(404).json({ error: 'Not found' });
        }

        // Get the MIME type
        const mimeType = mime.lookup(file.name);
        
        // Set headers and return the file content
        res.setHeader('Content-Type', mimeType);
        const fileStream = fs.createReadStream(file.localPath);
        fileStream.pipe(res);
    }
}

module.exports = FilesController;
