import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3" ;
import { Upload } from "@aws-sdk/lib-storage" ;
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createReadStream, statSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

const BUCKET_NAME = process.env.AWS_BUCKET_NAME;

export class S3Buckets {
    static async uploadMedia(phoneNumber, file, type) {
        try{
            const folder = type === 'audio' ? 'Audios' : 'Imagenes';
            const extension = type === 'audio' ? 'oga' : 'jpeg';
            //const key = `${folder}/${phoneNumber}/${Date.now()}_${file.name}`;
            const key = `${folder}/${phoneNumber}/${Date.now()}.${extension}`;
            console.log ("Nombre del archivo: ", file);
            const fileStream = createReadStream(file);
            const fileSize = statSync(file).size;

            const upload = new Upload({
                client: s3Client,
                params: {
                    Bucket: BUCKET_NAME,
                    Key: key,
                    Body: fileStream,
                    ContentType: type === 'audio' ? 'audio/oga' : 'image/jpeg',
                    ContentLength: fileSize
                }
            });
            
            await upload.done();
            return key;
        } catch (error) {
            console.error('Error uploading to S3: ', error);
            throw error;
        }
    }

    static async getSignedUrl(key) {
        try {
            const command = new GetObjectCommand({
                Bucket: BUCKET_NAME,
                Key: key
            });
            return await getSignedUrl(s3Client, command, {expiresIn: 3600 });

        } catch (error) {
            console.error('Error generating signed URL:', error);
            throw error;
        }
    }
}