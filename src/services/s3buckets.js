import { S3Client, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
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
        try {
            const folder = type === 'audio' ? 'Audios' : 'Imagenes';
            const extension = type === 'audio' ? 'oga' : 'jpeg';
            //const key = `${folder}/${phoneNumber}/${Date.now()}_${file.name}`;
            const key = `${folder}/${phoneNumber}/${Date.now()}.${extension}`;
            console.log("Nombre del archivo: ", file);
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
            return await getSignedUrl(s3Client, command, { expiresIn: 3600 });

        } catch (error) {
            console.error('Error generating signed URL:', error);
            throw error;
        }
    }

    static async getLatestImageUrlForUser(phoneNumber) {
        try {

            // Normalize the phone number to remove any hidden characters
            const normalizedPhone = phoneNumber.toString().trim().replace(/[^\d]/g, '');
            
            // Configure the command to list objects in the user's image folder
            const command = new ListObjectsV2Command({
                Bucket: BUCKET_NAME,
                Prefix: `Imagenes/${normalizedPhone}/`,
                MaxKeys: 1,  // We only need the latest one
                StartAfter: `Imagenes/${normalizedPhone}/`, // Start after the prefix to avoid listing the prefix itself
            });

            // Get the list of objects
            const response = await s3Client.send(command);

            // Check if we found any objects
            if (!response.Contents || response.Contents.length === 0) {
                console.log(`No images found for user ${phoneNumber}`);
                return null;
            }

            // Get the latest object (they're sorted by date)
            const latestImage = response.Contents[0];
            
            // Generate a signed URL for the image
            const signedUrl = await this.getSignedUrl(latestImage.Key);
            
            return signedUrl;
        } catch (error) {
            console.error('Error getting latest image URL:', error);
            throw error;
        }
    }

    static async getAllImageUrlForUser(phoneNumber) {
        try {
            // Normalize the phone number to remove any hidden characters
            const normalizedPhone = phoneNumber.toString().trim().replace(/[^\d]/g, '');
            
            const prefix = `Imagenes/${normalizedPhone}/`;
            console.log('Searching with prefix:', prefix);
            
            const command = new ListObjectsV2Command({
                Bucket: BUCKET_NAME,
                Prefix: prefix,
                MaxKeys: 5,
            });
    
            // Log the full command for debugging
            console.log('S3 Command:', JSON.stringify(command.input, null, 2));
    
            // Get the list of objects
            const response = await s3Client.send(command);
            
            // Log the full response for debugging
            console.log('S3 Response:', JSON.stringify(response, null, 2));
    
            // Check if we found any objects
            if (!response.Contents || response.Contents.length === 0) {
                console.log(`No images found for user ${normalizedPhone}`);
                console.log('Current bucket structure:');
                
                // List without prefix to see bucket contents
                const checkCommand = new ListObjectsV2Command({
                    Bucket: BUCKET_NAME,
                    MaxKeys: 10
                });
                const checkResponse = await s3Client.send(checkCommand);
                console.log('Bucket contents:', JSON.stringify(checkResponse.Contents, null, 2));
                
                return null;
            }
    
            const signedUrls = [];
            const numberOfImages = Math.min(response.Contents.length, 5);
            
            for (let i = 0; i < numberOfImages; i++) {
                const image = response.Contents[i];
                console.log('Processing image key:', image.Key);
                const url = await this.getSignedUrl(image.Key);
                signedUrls.push(url);
            }
            
            return signedUrls;
        } catch (error) {
            console.error('Error getting image URLs:', error);
            console.error('Full error object:', JSON.stringify(error, null, 2));
            throw error;
        }
    }
    /**
       * Obtiene una imagen de S3 y la prepara para un payload de WhatsApp
       * @param {string} key - La clave del archivo en S3
       * @returns {Promise<{data: string, mimetype: string, filename: string}>}
       */
    static async getImageForWhatsApp(key) {
        try {
            // Si tenemos una URL firmada, la usamos para obtener la imagen
            const signedUrl = await this.getSignedUrl(key);
            const response = await axios.get(signedUrl, { responseType: 'arraybuffer' });

            // Convertir el buffer a base64
            const base64Image = Buffer.from(response.data).toString('base64');

            // Determinar el tipo MIME basado en la extensión
            const extension = key.split('.').pop().toLowerCase();
            const mimeType = extension === 'png' ? 'image/png' :
                extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' :
                    'application/octet-stream';

            // Extraer el nombre del archivo de la key
            const filename = key.split('/').pop();

            return {
                data: base64Image,
                mimetype: mimeType,
                filename: filename
            };
        } catch (error) {
            console.error('Error getting image from S3 for WhatsApp:', error);
            throw error;
        }
    }
}


