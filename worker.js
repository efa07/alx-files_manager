const Queue = require('bull');
const fileQueue = new Queue('fileQueue');
const imageThumbnail = require('image-thumbnail');
const fs = require('fs');
const path = require('path');
const dbClient = require('./utils/db');
const { ObjectId } = require('mongodb');

fileQueue.process(async (job, done) => {
  const { fileId, userId } = job.data;

  if (!fileId) return done(new Error('Missing fileId'));
  if (!userId) return done(new Error('Missing userId'));

  const file = await dbClient.collection('files').findOne({ _id: new ObjectId(fileId), userId });
  if (!file) return done(new Error('File not found'));

  const sizes = [500, 250, 100];
  const localPath = file.localPath;

  for (const size of sizes) {
    const options = { width: size };
    const thumbnail = await imageThumbnail(localPath, options);
    const thumbnailPath = `${localPath}_${size}`;

    // Save the thumbnail file
    fs.writeFileSync(thumbnailPath, thumbnail);
  }

  done();
});
