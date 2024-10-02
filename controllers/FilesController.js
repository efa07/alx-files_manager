const uuid = require('uuid').v4;
const fs = require('fs');
const path = require('path');
const redisClient = require('../utils/redis'); // Assuming you have a Redis client
const dbClient = require('../utils/db'); // MongoDB or any DB client

const FOLDER_PATH = process.env.FOLDER_PATH || '/tmp/files_manager';

class FilesController {
    static async postUpload(req, res) {
        const token = req.header('X-Token');
        
        if (!token) return res.status(401).json({ error: 'Unauthorized' });

        // Retrieve user from token
        const userId = await redisClient.get(`auth_${token}`);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const { name, type, parentId = 0, isPublic = false, data } = req.body;

        // Validation
        if (!name) return res.status(400).json({ error: 'Missing name' });
        if (!['folder', 'file', 'image'].includes(type)) return res.status(400).json({ error: 'Missing type' });
        if (type !== 'folder' && !data) return res.status(400).json({ error: 'Missing data' });

        // Handle parentId if provided
        let parentFile = null;
        if (parentId) {
            parentFile = await dbClient.collection('files').findOne({ _id: parentId });
            if (!parentFile) return res.status(400).json({ error: 'Parent not found' });
            if (parentFile.type !== 'folder') return res.status(400).json({ error: 'Parent is not a folder' });
        }

        // For folders
        if (type === 'folder') {
            const newFolder = {
                userId,
                name,
                type,
                isPublic,
                parentId,
            };
            const result = await dbClient.collection('files').insertOne(newFolder);
            return res.status(201).json(result.ops[0]);
        }

        // For files and images
        const fileId = uuid();
        const localPath = path.join(FOLDER_PATH, fileId);
        const buffer = Buffer.from(data, 'base64');

        if (!fs.existsSync(FOLDER_PATH)) {
            fs.mkdirSync(FOLDER_PATH, { recursive: true });
        }

        fs.writeFileSync(localPath, buffer);

        const newFile = {
            userId,
            name,
            type,
            isPublic,
            parentId,
            localPath,
        };

        const result = await dbClient.collection('files').insertOne(newFile);
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
    const file = await dbClient.collection('files').findOne({ _id: fileId, userId });
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
}

module.exports = FilesController;
