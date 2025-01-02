import { createBot, createProvider, createFlow, MemoryDB } from '@builderbot/bot';
import { BaileysProvider } from '@builderbot/provider-baileys';
import { allFlows } from './flows/index.js';
import { initializeDataFiles } from './utils/flow-manager.js';
import dotenv from 'dotenv';
import { httpInject } from "@builderbot-plugins/openai-assistants"
import bot from '@builderbot/bot';

// Initialize environment variables
dotenv.config();

const PORT = process.env.PORT ?? 3000

// Validate required environment variables
if (!process.env.OPENAI_API_KEY) {
    console.error('Error: OPENAI_API_KEY is required in .env file');
    process.exit(1);
}

const main = async () => {
    try {
        // Initialize data files and directories
        await initializeDataFiles();

        // Initialize adapters
        const adapterDB = new MemoryDB();
        const adapterFlow = createFlow(allFlows);
        
        // Configure provider with specific options
        const adapterProvider = createProvider(BaileysProvider, {
            // Enable file downloads
            downloadMedia: true,
            // Optional: Configure browser details
            browser: ['Pool Lead Handler', 'Chrome', '120.0.0'],
            // Optional: Configure connection options
            connection: {
                printQRInTerminal: true,
                downloadHistory: true
            }
        });

        // Create bot with all configurations
        const {httpServer} = await createBot({
            flow: adapterFlow,
            provider: adapterProvider,
            database: adapterDB,
            // Additional settings for media handling
            settings: {
               saveMedia: true,
               mediaPath: './data/media',
               qrPath: './data/qr'
            }
        });

        httpInject(adapterProvider.server);
        httpServer(+PORT);

        // ENDPOINT PARA GRUPO DE WHATSAPP
        //----------------------------------------------------------------------
        adapterProvider.server.post('/send-message', async ( req, res) => {
            try {
                const body = req.body;
                const message = body.message;
                const mediaUrl = body.mediaUrl;

                await adapterProvider.sendMessage(process.env.FRIEND_NUMBER, message, {media: mediaUrl});
                //await adapterProvider.sendMessage(process.env.FRIEND_NUMBER, 'gay', {});

                // Envía la respuesta para completar la solicitud HTTP
                //req.res.writeHead(200, { 'Content-Type': 'application/json' });
                //req.write(JSON.stringify({ success: true }));
                //req.end();
            } catch(err) {
                console.error('Error sending message:', err);
                // Envía la respuesta para completar la solicitud HTTP
                //req.res.writeHead(500, { 'Content-Type': 'application/json' });
                //req.write(JSON.stringify({ error: err.message }));
                //req.end()
            }
        });


        adapterProvider.server.get('/get-message', (req, res) => {
            res.end('esto es el server contestando');
        });
        //-----------------------------------------------------------------------

        console.log('\n=== Bot Trainer Initialized ===');
        console.log('- Use "entrenar" to start training mode');
        console.log('- Use "salir" to exit training mode');
        console.log('- Start messages with "Modificar:" to suggest changes');
        console.log('=============================\n');
    } catch (error) {
        console.error('Error initializing the bot:', error);
    }
};

main();